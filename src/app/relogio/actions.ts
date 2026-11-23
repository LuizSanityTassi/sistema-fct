"use server";

import { redirect } from "next/navigation";
import { createClient as createClientPublico } from "@supabase/supabase-js";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type EstadoSair = { erro?: string };

/** Quem pode desconectar o relógio da loja com o próprio login (o relógio aberto pelo link não tem senha conhecida). */
const PAPEIS_GESTOR = ["admin", "rh", "ti", "gerente", "lider_loja", "coordenador"];

/**
 * Sair do relógio só com a senha da conta que está aberta nele, ou (login do relógio) com o e-mail e a senha de um
 * gestor. Funcionário não sai da tela. Confere a senha num cliente à parte, sem cookie, e encerra só essa conferência.
 */
export async function sairDoRelogio(
  _prev: EstadoSair,
  fd: FormData,
): Promise<EstadoSair> {
  const sessao = await getSessao();
  const senha = String(fd.get("senha") ?? "");
  if (!senha) return { erro: "Digite a senha." };
  const emailGestor = String(fd.get("email") ?? "").trim().toLowerCase();
  const porGestor = sessao.papel === "relogio" && !!emailGestor && emailGestor !== sessao.email.toLowerCase();
  const email = porGestor ? emailGestor : sessao.email;
  if (!email)
    return { erro: "Esta conta não tem e-mail para conferir a senha." };

  const conferencia = createClientPublico(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  const { data: entrou, error } = await conferencia.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (error) return { erro: porGestor ? "E-mail ou senha incorretos." : "Senha incorreta." };
  if (porGestor) {
    // o gestor precisa estar ativo e ter papel de gestão (funcionário comum não desconecta o relógio)
    const { data: perfil } = await conferencia.from("profiles").select("papel, ativo").eq("id", entrou.user.id).maybeSingle();
    await conferencia.auth.signOut({ scope: "local" });
    if (!perfil?.ativo || !PAPEIS_GESTOR.includes(String(perfil.papel)))
      return { erro: "Só gerente, coordenador, RH, TI ou administrador desconectam o relógio." };
  } else {
    await conferencia.auth.signOut({ scope: "local" });
  }

  if (sessao.papel === "relogio") {
    // o login do relógio só tem esta tela: sair = desconectar este aparelho
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login");
  }
  redirect("/ponto/relogio");
}
