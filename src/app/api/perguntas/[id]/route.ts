import { NextResponse } from "next/server";
import { getSessao } from "@/lib/auth/session";
import { responderPergunta } from "@/lib/data/perguntas";
import { perguntaPorId, podeFazerPergunta } from "@/lib/perguntas/catalogo";
import { gerarCsv } from "@/lib/relatorios/csv";

// Resposta de uma pergunta pronta em CSV (Excel pt-BR). Mesmos filtros e mesmos dados da tela (RLS).
export async function GET(req: Request, ctx: RouteContext<"/api/perguntas/[id]">) {
  const { id } = await ctx.params;
  const sessao = await getSessao();
  const pergunta = perguntaPorId(id);
  if (!pergunta || !podeFazerPergunta(sessao.papel, pergunta, sessao.bloqueios)) return new NextResponse("Pergunta inexistente", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const resposta = await responderPergunta(sessao, id, { mes: sp.get("mes") ?? undefined, filial: sp.get("filial") ?? undefined });
  if (!resposta) return new NextResponse("Pergunta inexistente", { status: 404 });
  const nome = `${id}${resposta.mes ? `-${resposta.mes}` : ""}.csv`;
  return new NextResponse(gerarCsv([resposta.relatorio]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
