import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/session";
import { carregarPendencias, ORDEM_SEVERIDADE } from "@/lib/data/pendencias";
import { createClient } from "@/lib/supabase/server";

/** Avisos da pessoa ainda não lidos (fim do envio ao Omie). Se a leitura falhar, as pendências continuam aparecendo. */
async function avisosNaoLidos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("avisos").select("id, severidade, titulo, detalhe, href, created_at").is("lida_em", null).order("created_at", { ascending: false }).limit(20);
  if (error) console.error("[avisos]", error.message);
  return data ?? [];
}

// Sino do cabeçalho: os avisos da pessoa, quantas pendências ela tem e as mais graves (mesma regra da central de pendências).
export async function GET() {
  const sessao = await getSessao();
  const avisos = await avisosNaoLidos();
  try {
    const todas = await carregarPendencias(sessao);
    const ordenadas = [...todas].sort((a, b) => ORDEM_SEVERIDADE.indexOf(a.severidade) - ORDEM_SEVERIDADE.indexOf(b.severidade));
    return NextResponse.json(
      {
        total: todas.length,
        criticas: todas.filter((p) => p.severidade === "critico").length,
        itens: ordenadas.slice(0, 6).map(({ id, severidade, area, titulo, href }) => ({ id, severidade, area, titulo, href })),
        avisos,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[pendencias]", e instanceof Error ? e.message : e);
    return NextResponse.json({ total: 0, criticas: 0, itens: [], avisos, erro: true }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
