"use server";

import { redirect } from "next/navigation";
import { createClient as createClientPublico } from "@supabase/supabase-js";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type EstadoSair = { erro?: string };

/**
 * Sair do relógio só com a senha da conta que está aberta nele (funcionário não sai da tela).
 * Confere a senha num cliente à parte, sem cookie, e encerra só essa conferência.
 */
export async function sairDoRelogio(
  _prev: EstadoSair,
  fd: FormData,
): Promise<EstadoSair> {
  const sessao = await getSessao();
  const senha = String(fd.get("senha") ?? "");
  if (!senha) return { erro: "Digite a senha." };
  if (!sessao.email)
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
  const { error } = await conferencia.auth.signInWithPassword({
    email: sessao.email,
    password: senha,
  });
  if (error) return { erro: "Senha incorreta." };
  await conferencia.auth.signOut({ scope: "local" });

  if (sessao.papel === "relogio") {
    // o login do relógio só tem esta tela: sair = desconectar este aparelho
    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });
    redirect("/login");
  }
  redirect("/ponto/relogio");
}
