import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// Manifesto do app "Relógio <filial>": instalado no computador da loja, abre sempre pelo link do relógio (entra sozinho
// de novo se o login cair) e fica em janela própria, sem barra de endereço. Rota pública, como o link.
export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const nada = () => new Response("Não encontrado.", { status: 404 });
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) return nada();
  const admin = createAdminClient();
  if (!admin) return nada();
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: link } = await admin
    .from("relogio_links")
    .select("branch_id, filial:branches!relogio_links_branch_id_fkey(codigo, nome)")
    .eq("token_hash", hash)
    .is("revogado_em", null)
    .maybeSingle();
  if (!link?.filial) return nada();
  const { codigo, nome } = link.filial;
  const manifesto = {
    id: `/relogio/app/${codigo}`,
    name: `Relógio de ponto ${codigo} ${nome}`,
    short_name: `Relógio ${codigo}`,
    description: `Relógio de ponto da filial ${codigo} ${nome}.`,
    lang: "pt-BR",
    start_url: `/relogio/entrar/${token}`,
    scope: "/relogio",
    display: "standalone",
    display_override: ["fullscreen", "standalone"],
    background_color: "#fbf9f7",
    theme_color: "#c10510",
    icons: [
      { src: "/app/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app/icone-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifesto), {
    headers: { "Content-Type": "application/manifest+json; charset=utf-8", "Cache-Control": "no-store" },
  });
}
