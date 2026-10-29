import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/conciliacao/agente não tem sessão de usuário: autentica pela chave do agente (X-Agente) dentro da própria rota.
// /vitrine: catálogo visual dos componentes com dados fictícios, só no ambiente local (a página dá 404 em produção).
// /api/cron: rotinas agendadas da Vercel, protegidas pelo CRON_SECRET na própria rota (sem sessão de usuário)
const ROTAS_PUBLICAS = ["/login", "/recuperar-senha", "/auth", "/api/conciliacao/agente", "/api/cron", ...(process.env.NODE_ENV === "development" ? ["/vitrine"] : [])];

// Renova a sessão em cada request e protege as rotas privadas.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((r) => path === r || path.startsWith(r + "/"));

  // Sem sessão em rota privada → manda para o login
  if (!user && !publica) {
    const url = request.nextUrl.clone();
    const destino = path + request.nextUrl.search;
    url.pathname = "/login";
    url.search = "";
    // volta para onde a pessoa ia depois do login (ex.: QR do equipamento); só caminhos internos
    if (path !== "/" && !path.startsWith("/api/")) url.searchParams.set("voltar", destino);
    return NextResponse.redirect(url);
  }
  // Já logado tentando ver o login → manda para o portal (tela de entrada)
  if (user && (path === "/login" || path === "/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal";
    return NextResponse.redirect(url);
  }

  return response;
}
