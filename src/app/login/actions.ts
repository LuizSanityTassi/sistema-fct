"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_TROCA_SENHA, cookieTrocaSenhaValido } from "@/lib/auth/troca-senha";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { erro?: string; ok?: string };

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host")!;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: "E-mail ou senha inválidos." };
  redirect(destinoSeguro(formData.get("voltar")));
}

/** Para onde voltar depois do login: só caminho interno do sistema (nada de outro site nem //host). */
function destinoSeguro(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\/(?![/\\])\S*$/.test(s) && !s.startsWith("/login") && !s.startsWith("/auth") ? s : "/portal";
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { erro: "Informe o e-mail." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origem()}/auth/confirm?next=/auth/atualizar-senha`,
  });
  // Mensagem genérica (não revela se o e-mail existe)
  return { ok: "Se o e-mail estiver cadastrado, enviamos um link para redefinir a senha." };
}

export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const senha = String(formData.get("senha") ?? "");
  const senha2 = String(formData.get("senha2") ?? "");
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };
  if (senha !== senha2) return { erro: "As senhas não coincidem." };
  const supabase = await createClient();
  // só quem chegou pelo link do e-mail (cookie assinado do /auth/confirm, 15 min) troca a senha por aqui:
  // uma sessão já aberta (ex.: computador da loja) não serve para tomar a conta
  const { data: login } = await supabase.auth.getClaims();
  const jar = await cookies();
  if (!login?.claims?.sub || !cookieTrocaSenhaValido(jar.get(COOKIE_TROCA_SENHA)?.value, login.claims.sub)) {
    return { erro: "Para definir a senha, use o link enviado por e-mail (em “Esqueci minha senha”). O link vale por 15 minutos." };
  }
  const { error } = await supabase.auth.updateUser({ password: senha });
  if (error) return { erro: "Não foi possível alterar a senha. O link pode ter expirado." };
  jar.delete(COOKIE_TROCA_SENHA);
  redirect("/portal");
}
