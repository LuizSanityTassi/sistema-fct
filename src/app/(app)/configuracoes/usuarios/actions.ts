"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { PAPEIS } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoUsuario = {
  erro?: string;
  erros?: Record<string, string>;
  ok?: string;
};

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function errosDoZod(e: z.ZodError) {
  const { fieldErrors } = z.flattenError(e);
  const erros: Record<string, string> = {};
  for (const [campo, mensagens] of Object.entries(fieldErrors)) {
    const primeira = (mensagens as string[] | undefined)?.[0];
    if (primeira) erros[campo] = primeira;
  }
  return erros;
}

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function exigirAdmin() {
  const sessao = await getSessao();
  return sessao.papel === "admin" ? sessao : null;
}

// ---------- convidar ----------

const esquemaConvite = z.object({
  email: z.email({ error: "E-mail inválido." }).transform((e) => e.toLowerCase()),
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  papel: z.enum(PAPEIS, { error: "Escolha o papel." }),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
});

/** Convida por e-mail (Supabase Auth, chave service_role só no servidor) e define papel/unidade. Só admin. */
export async function convidarUsuario(_prev: EstadoUsuario, fd: FormData): Promise<EstadoUsuario> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores convidam usuários." };

  const r = esquemaConvite.safeParse({
    email: texto(fd, "email"),
    nome: texto(fd, "nome"),
    papel: texto(fd, "papel"),
    branch_id: texto(fd, "branch_id"),
  });
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };

  const admin = createAdminClient();
  if (!admin) {
    return {
      erro:
        "Convite por e-mail não configurado neste ambiente: defina SUPABASE_SERVICE_ROLE_KEY nas variáveis do servidor (Vercel → Settings → Environment Variables; localmente no .env.local). Enquanto isso, crie o usuário em Supabase → Authentication → Users e ajuste o papel aqui.",
    };
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(r.data.email, {
    data: { nome: r.data.nome },
    redirectTo: `${await origem()}/auth/confirm?next=/auth/atualizar-senha`,
  });
  if (error || !data.user) return { erro: `Não foi possível convidar: ${error?.message ?? "erro desconhecido"}` };

  // O trigger handle_new_user já criou o perfil; aqui definimos papel e unidade.
  const supabase = await createClient();
  const { error: erroPerfil } = await supabase
    .from("profiles")
    .update({ nome: r.data.nome, papel: r.data.papel, branch_id: r.data.branch_id ?? null })
    .eq("id", data.user.id);
  if (erroPerfil) return { erro: `Convite enviado, mas o perfil não pôde ser ajustado: ${erroPerfil.message}` };

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "convidar",
    entidade: "profiles",
    registroId: data.user.id,
    novo: { email: r.data.email, nome: r.data.nome, papel: r.data.papel, branch_id: r.data.branch_id ?? null },
  });
  revalidatePath("/configuracoes/usuarios");
  redirect("/configuracoes/usuarios?convidado=1");
}

// ---------- editar ----------

const esquemaUsuario = z.object({
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  papel: z.enum(PAPEIS, { error: "Escolha o papel." }),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
});

export async function salvarUsuario(id: string, _prev: EstadoUsuario, fd: FormData): Promise<EstadoUsuario> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores alteram usuários." };
  if (!ehUuid(id)) return { erro: "Usuário inválido." };

  const r = esquemaUsuario.safeParse({ nome: texto(fd, "nome"), papel: texto(fd, "papel"), branch_id: texto(fd, "branch_id") });
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const ativo = fd.get("ativo") === "on";
  const filiais = fd.getAll("filiais").filter((v): v is string => typeof v === "string" && ehUuid(v));

  if (id === sessao.id) {
    if (r.data.papel !== "admin") return { erro: "Você não pode remover o seu próprio papel de administrador." };
    if (!ativo) return { erro: "Você não pode desativar o seu próprio usuário." };
  }

  const supabase = await createClient();
  const [{ data: atual }, { data: acessosAtuais }] = await Promise.all([
    supabase.from("profiles").select("id, nome, papel, branch_id, ativo").eq("id", id).maybeSingle(),
    supabase.from("user_branch_access").select("branch_id").eq("user_id", id),
  ]);
  if (!atual) return { erro: "Usuário não encontrado." };

  const patch = { nome: r.data.nome, papel: r.data.papel, branch_id: r.data.branch_id ?? null, ativo };
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  const antes = (acessosAtuais ?? []).map((a) => a.branch_id).sort();
  const depois = [...new Set(filiais)].sort();
  if (antes.join(",") !== depois.join(",")) {
    await supabase.from("user_branch_access").delete().eq("user_id", id);
    if (depois.length > 0) {
      const { error: erroAcesso } = await supabase
        .from("user_branch_access")
        .insert(depois.map((branch_id) => ({ user_id: id, branch_id })));
      if (erroAcesso) return { erro: `Perfil salvo, mas as unidades adicionais falharam: ${erroAcesso.message}` };
    }
  }

  const dif = diferencas({ ...atual, filiais_adicionais: antes }, { ...patch, filiais_adicionais: depois });
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: !atual.ativo && ativo ? "reativar" : atual.ativo && !ativo ? "inativar" : "editar",
    entidade: "profiles",
    registroId: id,
    anterior: dif.anterior,
    novo: dif.novo,
  });
  revalidatePath("/configuracoes/usuarios");
  redirect("/configuracoes/usuarios?salvo=1");
}

// ---------- redefinição de senha ----------

export async function enviarRedefinicaoSenha(fd: FormData) {
  const sessao = await exigirAdmin();
  if (!sessao) return;
  const email = texto(fd, "email");
  if (!email) return;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origem()}/auth/confirm?next=/auth/atualizar-senha`,
  });
  redirect("/configuracoes/usuarios?reset=1");
}
