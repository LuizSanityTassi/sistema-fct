"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerUuid } from "@/lib/data/ponto";
import { mensagemBanco } from "@/lib/ponto/form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
    userId: sessao.id,
    acao: "criar",
    entidade: "profiles",
    registroId: data.user.id,
    novo: { email, nome, papel: "relogio", branch_id: filial.id },
  });
  revalidatePath("/ponto/relogio");
  return {
    ok: `Acesso criado. Na loja, entre com ${email} e a senha que você definiu.`,
  };
}

export type EstadoCodigoLeitor = { erro?: string; codigo?: string; filial?: string };

/** Gera o código de uso único (vale 30 minutos) para ativar o leitor de digital de uma filial. Só admin. */
export async function gerarCodigoLeitor(
  _prev: EstadoCodigoLeitor,
  fd: FormData,
): Promise<EstadoCodigoLeitor> {
  const filialId = lerUuid(fd.get("filial"));
  if (!filialId) return { erro: "Escolha a filial." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_leitor_gerar_codigo", {
    p_branch: filialId,
  });
  if (error)
    return { erro: mensagemBanco(error, "Não foi possível gerar o código.") };
  revalidatePath("/ponto/relogio");
  return { codigo: data, filial: filialId };
}

/** Desativa o leitor de um computador: o relógio dele volta a aceitar só o PIN. Só admin. */
export async function revogarLeitor(fd: FormData): Promise<void> {
  const id = lerUuid(fd.get("leitor"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("ponto_leitor_revogar", { p_leitor: id });
  revalidatePath("/ponto/relogio");
}

export type LeitorAtivado =
  | { ok: true; id: string; segredo: string }
  | { ok: false; erro: string };

/** No relógio da loja: troca o código pelo segredo que fica guardado no programa do leitor. */
export async function ativarLeitorNoRelogio(
  filial: string,
  codigo: string,
): Promise<LeitorAtivado> {
  const b = lerUuid(filial);
  const c = codigo.trim().slice(0, 12);
  if (!b || !c) return { ok: false, erro: "Digite o código de ativação." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("ponto_leitor_ativar", {
    p_branch: b,
    p_codigo: c,
    p_nome: "Relógio da filial",
  });
  if (error)
    return { ok: false, erro: mensagemBanco(error, "Não foi possível ativar o leitor.") };
  const r = data as { id: string; segredo: string };
  return { ok: true, id: r.id, segredo: r.segredo };
}
