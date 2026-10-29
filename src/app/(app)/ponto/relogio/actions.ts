"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerUuid } from "@/lib/data/ponto";
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
