import { manifestoPortal } from "@/lib/manifesto-app";

// Manifesto do Portal (app instalável). Fica fora do login (src/proxy.ts): o navegador busca sem os cookies.
export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(manifestoPortal()), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
