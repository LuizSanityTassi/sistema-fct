"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerUuid } from "@/lib/data/ponto";
import { mensagemBanco } from "@/lib/ponto/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { origemDoSistema } from "@/lib/ti/qr";
import { emailDoRelogio } from "./filiais";

export type EstadoAcessoRelogio = { erro?: string; ok?: string };

/**
 * Cria o login do relógio da filial (papel "relogio": só abre o relógio) ou troca a senha dele.
 * A senha é digitada pelo administrador; a conta não recebe e-mail. Só admin.
 */
export async function salvarAcessoRelogio(
  _prev: EstadoAcessoRelogio,
  fd: FormData,
): Promise<EstadoAcessoRelogio> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin")
    return { erro: "Só administradores criam o acesso do relógio." };
  const filialId = lerUuid(fd.get("filial"));
  const senha = String(fd.get("senha") ?? "");
  if (!filialId) return { erro: "Escolha a filial." };
  if (senha.length < 8)
    return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== String(fd.get("senha2") ?? ""))
    return { erro: "As senhas não coincidem." };

  const supabase = await createClient();
  const { data: filial } = await supabase
    .from("branches")
    .select("id, codigo, nome")
    .eq("id", filialId)
    .maybeSingle();
  if (!filial) return { erro: "Filial não encontrada." };
  const admin = createAdminClient();
  if (!admin)
    return {
      erro: "Falta a chave de serviço do Supabase no servidor (SUPABASE_SERVICE_ROLE_KEY).",
    };

  const { data: existente } = await supabase
    .from("profiles")
    .select("id, email, ativo")
    .eq("papel", "relogio")
    .eq("branch_id", filial.id)
    .limit(1)
    .maybeSingle();
  if (existente) {
    const { error } = await admin.auth.admin.updateUserById(existente.id, {
      password: senha,
    });
    if (error)
      return { erro: `Não foi possível trocar a senha: ${error.message}` };
    if (!existente.ativo)
      await supabase
        .from("profiles")
        .update({ ativo: true })
        .eq("id", existente.id);
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "profiles",
      registroId: existente.id,
      novo: { acesso_relogio: filial.codigo, senha_trocada: true },
    });
    revalidatePath("/ponto/relogio");
    return {
      ok: `Senha do relógio da ${filial.codigo} trocada. Login: ${existente.email}`,
    };
  }

  const conta = await criarContaRelogio(supabase, admin, filial, senha, sessao.id);
  if ("erro" in conta) return { erro: conta.erro };
  revalidatePath("/ponto/relogio");
  return {
    ok: `Acesso criado. Na loja, entre com ${conta.email} e a senha que você definiu.`,
  };
}

type ClienteServidor = Awaited<ReturnType<typeof createClient>>;
type ClienteAdmin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Cria a conta do relógio da filial (papel "relogio": só abre /relogio) com a senha dada. */
async function criarContaRelogio(
  supabase: ClienteServidor,
  admin: ClienteAdmin,
  filial: { id: string; codigo: string; nome: string },
  senha: string,
  autor: string,
): Promise<{ id: string; email: string } | { erro: string }> {
  const email = emailDoRelogio(filial.codigo);
  const nome = `Relógio ${filial.codigo} ${filial.nome}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (error || !data.user)
    return {
      erro: `Não foi possível criar o acesso: ${error?.message ?? "erro desconhecido"}`,
    };
  // o trigger handle_new_user já criou o perfil; aqui vira login de relógio da filial
  const { error: erroPerfil } = await supabase
    .from("profiles")
    .update({
      nome,
      papel: "relogio",
      admin_sistema: false,
      branch_id: filial.id,
      regional: null,
      employee_id: null,
    })
    .eq("id", data.user.id);
  if (erroPerfil) {
    // sem o papel certo a conta seria um login comum: desfaz a conta recém-criada
    await admin.auth.admin.deleteUser(data.user.id);
    return { erro: `Não foi possível ajustar o acesso: ${erroPerfil.message}` };
  }
  await registrarAuditoria(supabase, {
    userId: autor,
    acao: "criar",
    entidade: "profiles",
    registroId: data.user.id,
    novo: { email, nome, papel: "relogio", branch_id: filial.id },
  });
  return { id: data.user.id, email };
}

export type EstadoLinkRelogio = { erro?: string; ok?: string; link?: string };

/** Hash do link do relógio (o link em si não fica guardado; a rota /relogio/entrar calcula igual). */
async function hashLinkRelogio(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Gera o link do relógio da filial: aberto no computador da loja, entra direto no relógio (login do relógio da
 * filial, sem senha). Cria o login do relógio se ainda não existir (senha aleatória que ninguém sabe). Gerar outro
 * desliga o anterior. O link aparece uma vez só; fica guardado só o hash. Só admin.
 */
export async function gerarLinkRelogio(_prev: EstadoLinkRelogio, fd: FormData): Promise<EstadoLinkRelogio> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só administradores geram o link do relógio." };
  const filialId = lerUuid(fd.get("filial"));
  if (!filialId) return { erro: "Escolha a filial." };
  const supabase = await createClient();
  const { data: filial } = await supabase.from("branches").select("id, codigo, nome").eq("id", filialId).maybeSingle();
  if (!filial) return { erro: "Filial não encontrada." };
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a chave de serviço do Supabase no servidor (SUPABASE_SERVICE_ROLE_KEY)." };

  const { data: existente } = await supabase
    .from("profiles")
    .select("id, ativo")
    .eq("papel", "relogio")
    .eq("branch_id", filial.id)
    .limit(1)
    .maybeSingle();
  if (existente && !existente.ativo) await supabase.from("profiles").update({ ativo: true }).eq("id", existente.id);
  if (!existente) {
    const conta = await criarContaRelogio(supabase, admin, filial, randomBytes(24).toString("base64url"), sessao.id);
    if ("erro" in conta) return { erro: conta.erro };
  }

  const token = randomBytes(32).toString("base64url");
  const agora = new Date().toISOString();
  const { error: e1 } = await admin
    .from("relogio_links")
    .update({ revogado_em: agora, revogado_por: sessao.id })
    .eq("branch_id", filial.id)
    .is("revogado_em", null);
  if (e1) return { erro: mensagemBanco(e1) };
  const { data: novo, error: e2 } = await admin
    .from("relogio_links")
    .insert({ branch_id: filial.id, token_hash: await hashLinkRelogio(token), criado_por: sessao.id })
    .select("id")
    .single();
  if (e2) return { erro: mensagemBanco(e2) };
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "criar",
    entidade: "relogio_links",
    registroId: novo.id,
    novo: { filial: filial.codigo },
  });
  revalidatePath("/ponto/relogio");
  return {
    ok: `Link do relógio da ${filial.codigo} gerado. Abra no computador da loja e deixe aberto. Ele aparece só agora: copie antes de sair desta tela.`,
    link: `${await origemDoSistema()}/relogio/entrar/${token}`,
  };
}

/** Desliga o link do relógio da filial e desconecta os computadores que estão nele (em até 1 hora). Só admin. */
export async function desativarLinkRelogio(fd: FormData): Promise<void> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return;
  const filialId = lerUuid(fd.get("filial"));
  if (!filialId) return;
  const admin = createAdminClient();
  if (!admin) return;
  const supabase = await createClient();
  await admin
    .from("relogio_links")
    .update({ revogado_em: new Date().toISOString(), revogado_por: sessao.id })
    .eq("branch_id", filialId)
    .is("revogado_em", null);
  const { data: sessoes } = await supabase.rpc("relogio_desconectar", { p_branch: filialId });
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "relogio_links",
    registroId: filialId,
    novo: { desativado: true, computadores_desconectados: sessoes ?? 0 },
  });
  revalidatePath("/ponto/relogio");
}

/** Desativa o leitor de um computador: o relógio dele volta a aceitar só o PIN. Só admin. */
export async function revogarLeitor(fd: FormData): Promise<void> {
  const id = lerUuid(fd.get("leitor"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("ponto_leitor_revogar", { p_leitor: id });
  revalidatePath("/ponto/relogio");
}

export type LeitorGarantido =
  | { ok: true; id: string; segredo?: string }
  | { ok: false; erro: string };

/** Ao abrir o relógio: confere o leitor deste computador e, se ainda não estiver ativado, ativa sozinho (o banco diz quem pode). */
export async function garantirLeitorNoRelogio(
  filial: string,
  leitorId: string | null,
): Promise<LeitorGarantido> {
  const b = lerUuid(filial);
  if (!b) return { ok: false, erro: "Filial inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_leitor_garantir", {
    p_branch: b,
    p_leitor: lerUuid(leitorId ?? undefined) ?? null,
    p_nome: "Relógio da filial",
  });
  if (error)
    return { ok: false, erro: mensagemBanco(error, "Não foi possível ativar o leitor.") };
  const r = data as { id?: string; segredo?: string; precisa_admin?: boolean };
  if (!r.id)
    return {
      ok: false,
      erro: "Este computador ainda não está liberado para o leitor de digital. Peça para o RH, a TI ou um administrador abrir o relógio uma vez aqui.",
    };
  return { ok: true, id: r.id, segredo: r.segredo };
}
