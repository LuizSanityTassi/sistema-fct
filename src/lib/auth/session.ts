import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeAcessar } from "@/lib/nav";
import { ehPapel, type AppRole } from "@/lib/roles";

export type Sessao = {
  id: string;
  email: string;
  nome: string;
  /** Papel que vale para as PERMISSÕES: "admin" para quem tem a marcação "Administrador do sistema". */
  papel: AppRole;
  /** Cargo cadastrado (o que aparece na tela), ex.: TI. */
  cargo: AppRole;
  /** Tem todos os poderes de administrador mantendo o cargo (profiles.admin_sistema). */
  adminSistema: boolean;
  branchId: string | null;
  /** Coordenador de vendas: a regional que ele coordena (Sul, Serra, Oeste…). */
  regional: string | null;
};

/** Usuário logado + perfil. Memoizado por requisição: layout e página compartilham a mesma leitura. */
export const getSessao = cache(async (): Promise<Sessao> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, papel, branch_id, ativo, ultimo_acesso, regional, admin_sistema")
    .eq("id", user.id)
    .maybeSingle();

  // Usuário desativado pelo administrador: encerra a sessão.
  if (profile && profile.ativo === false) {
    await supabase.auth.signOut();
    redirect("/login?erro=inativo");
  }

  // Registra o último acesso no máximo a cada 30 minutos.
  if (profile && (!profile.ultimo_acesso || Date.now() - Date.parse(profile.ultimo_acesso) > 30 * 60 * 1000)) {
    await supabase.from("profiles").update({ ultimo_acesso: new Date().toISOString() }).eq("id", user.id);
  }

  const cargo: AppRole = ehPapel(profile?.papel) ? profile.papel : "usuario";
  const adminSistema = !!profile?.admin_sistema && cargo !== "admin";
  return {
    id: user.id,
    email: user.email ?? "",
    nome: profile?.nome?.trim() || user.email?.split("@")[0] || "Usuário",
    papel: adminSistema ? "admin" : cargo,
    cargo,
    adminSistema,
    branchId: profile?.branch_id ?? null,
    regional: profile?.regional ?? null,
  };
});

/** Leva para a tela "Você não tem acesso", onde a pessoa pode pedir acesso ao administrador. */
export function semAcesso(rota: string): never {
  redirect(`/sem-acesso?rota=${encodeURIComponent(rota)}`);
}

/** Bloqueia a página para papéis sem acesso (a mesma regra do menu). Devolve a sessão quando liberado. */
export async function exigirAcesso(rota: string): Promise<Sessao> {
  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, rota)) semAcesso(rota);
  return sessao;
}
