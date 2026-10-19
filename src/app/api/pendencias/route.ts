import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/session";
import { carregarPendencias, ORDEM_SEVERIDADE } from "@/lib/data/pendencias";

// Sino do cabeçalho: quantas pendências a pessoa tem e as mais graves (mesma regra da central de pendências).
export async function GET() {
  const sessao = await getSessao();
  try {
    const todas = await carregarPendencias(sessao);
    const ordenadas = [...todas].sort((a, b) => ORDEM_SEVERIDADE.indexOf(a.severidade) - ORDEM_SEVERIDADE.indexOf(b.severidade));
    return NextResponse.json(
      {
        total: todas.length,
        criticas: todas.filter((p) => p.severidade === "critico").length,
        itens: ordenadas.slice(0, 6).map(({ id, severidade, area, titulo, href }) => ({ id, severidade, area, titulo, href })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[pendencias]", e instanceof Error ? e.message : e);
    return NextResponse.json({ total: 0, criticas: 0, itens: [], erro: true }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
