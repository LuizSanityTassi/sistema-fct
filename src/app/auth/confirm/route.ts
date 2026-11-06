import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_TROCA_SENHA, destinoInterno, gerarCookieTrocaSenha, VALIDADE_TROCA_SENHA_S } from "@/lib/auth/troca-senha";
import { createClient } from "@/lib/supabase/server";

// Recebe o link de confirmação/recuperação do Supabase, troca o código/token
// por uma sessão e encaminha para a próxima página (ex.: definir nova senha).
// O destino é sempre um caminho interno do sistema (sem redirecionar para outro site).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = destinoInterno(searchParams.get("next"));

  const supabase = await createClient();

  let userId: string | null = null;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) userId = data.user?.id ?? data.session?.user.id ?? null;
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as "recovery" | "email" | "signup" | "invite" | "email_change",
      token_hash: tokenHash,
    });
    if (!error) userId = data.user?.id ?? data.session?.user.id ?? null;
  }
  if (!userId) return NextResponse.redirect(`${origin}/login?erro=link_invalido`);

  const resposta = NextResponse.redirect(`${origin}${next}`);
  // quem chegou pelo link pode definir a senha nos próximos 15 minutos (sessão aberta sem o link não pode)
  if (next.startsWith("/auth/atualizar-senha")) {
    resposta.cookies.set(COOKIE_TROCA_SENHA, gerarCookieTrocaSenha(userId), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: VALIDADE_TROCA_SENHA_S,
    });
  }
  return resposta;
}
