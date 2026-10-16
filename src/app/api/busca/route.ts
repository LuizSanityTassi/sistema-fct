import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/session";
import { buscaValida } from "@/lib/busca";
import { buscarTudo } from "@/lib/data/busca-global";

// Busca global da janela Ctrl+K: devolve os resultados que o usuário pode ver (RLS + menu), agrupados por tipo.
export async function GET(req: Request) {
  const sessao = await getSessao();
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  if (!buscaValida(q)) return NextResponse.json({ grupos: [] }, { headers: { "Cache-Control": "no-store" } });
  try {
    const grupos = await buscarTudo(sessao, q);
    return NextResponse.json({ grupos }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[busca]", e instanceof Error ? e.message : e);
    return NextResponse.json({ grupos: [], erro: "Não consegui buscar agora. Tente de novo." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
