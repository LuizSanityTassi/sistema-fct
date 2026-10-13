import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { gerarRelatorio, lerFiltrosRelatorio, tipoRelatorioValido } from "@/lib/data/relatorios";
import { hojeIso } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import { gerarCsv } from "@/lib/relatorios/csv";

// Exporta o relatório em CSV (Excel pt-BR). Mesmos filtros da tela; mesmos dados (RLS).
export async function GET(req: Request, ctx: RouteContext<"/api/relatorios/[tipo]">) {
  const { tipo } = await ctx.params;
  if (!tipoRelatorioValido(tipo)) return new NextResponse("Relatório inexistente", { status: 404 });

  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, "/relatorios")) redirect("/dashboard?erro=sem_permissao");
  if (tipo === "folha" && sessao.papel !== "admin" && sessao.papel !== "rh") {
    return new NextResponse("Sem permissão", { status: 403 });
  }

  const url = new URL(req.url);
  const sp: Record<string, string> = { tipo };
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const filtros = lerFiltrosRelatorio(sp);
  const relatorios = await gerarRelatorio(sessao, filtros);
  const csv = gerarCsv(relatorios);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${tipo}-${hojeIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
