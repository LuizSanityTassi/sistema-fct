import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_LINK_RELOGIO } from "../../link";

// Link do relógio da filial (gerado em Ponto → Relógio da filial): entra com o login do relógio da filial, sem senha,
// e abre o relógio em tela cheia. Esse login só enxerga a tela /relogio. Link desligado ou trocado → volta para o login.
// Rota pública (lib/supabase/middleware.ts): o computador da loja ainda não tem sessão.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const origem = new URL(request.url).origin;
  const recusar = () => NextResponse.redirect(`${origem}/login?erro=link_relogio`);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return recusar();

  const admin = createAdminClient();
  if (!admin) return recusar();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: link } = await admin.from("relogio_links").select("id, branch_id, usos").eq("token_hash", hash).is("revogado_em", null).maybeSingle();
  if (!link) return recusar();
  const { data: conta } = await admin
    .from("profiles")
    .select("id, email")
    .eq("papel", "relogio")
    .eq("branch_id", link.branch_id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  if (!conta?.email) return recusar();

  const supabase = await createClient();
  // navegador já logado com outra pessoa (ex.: o administrador testando): pergunta antes de trocar o login dela
  if (request.nextUrl.searchParams.get("confirmar") !== "1") {
    const { data: atual } = await supabase.auth.getUser();
    if (atual.user && atual.user.id !== conta.id) return NextResponse.redirect(`${origem}/relogio/entrar/${token}/confirmar`);
  }

  // link de entrada de uso único criado na hora (não manda e-mail); vira a sessão deste navegador
  const { data: gerado, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: conta.email });
  const tokenHash = gerado?.properties?.hashed_token;
  if (error || !tokenHash) return recusar();
  const { error: erroSessao } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (erroSessao) return recusar();

  await admin.from("relogio_links").update({ ultimo_uso: new Date().toISOString(), usos: link.usos + 1 }).eq("id", link.id);
  const resposta = NextResponse.redirect(`${origem}/relogio`);
  // o relógio usa o link para oferecer "Instalar app" (o app abre sempre por ele)
  resposta.cookies.set(COOKIE_LINK_RELOGIO, token, { httpOnly: true, secure: true, sameSite: "lax", path: "/relogio", maxAge: 60 * 60 * 24 * 3650 });
  return resposta;
}
