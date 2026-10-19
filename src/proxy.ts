import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16: o antigo "middleware.ts" virou "proxy.ts". Renova a sessão e protege as rotas.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // tudo, menos estáticos, imagens e os arquivos do aplicativo (manifesto, service worker e página offline,
    // que o navegador busca sem os cookies de login)
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
