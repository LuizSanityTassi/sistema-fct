import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { gerarXlsx, lerParamsRelatorioPonto, montarRelatorioPonto } from "@/lib/data/ponto-relatorios";
import { gerarCsv } from "@/lib/relatorios/csv";
import { createClient } from "@/lib/supabase/server";

// Relatórios do ponto em CSV ou Excel. ?relatorio=horas|espelho|extras|faltas|inconsistencias|banco|marcacoes
// &mes=AAAA-MM&filial=&departamento=&funcionario=&formato=csv|xlsx. Quem não gere o ponto só exporta o próprio.
export async function GET(req: Request) {
  const sessao = await getSessao();
  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const p = lerParamsRelatorioPonto(sp);
  const formato = sp.formato === "csv" ? "csv" : "xlsx";
  const { relatorios, funcionarios } = await montarRelatorioPonto(sessao, p);
  const nome = `ponto-${p.relatorio}-${p.mes}.${formato}`;

  const supabase = await createClient();
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "exportar",
    entidade: "ponto_relatorios",
    novo: { relatorio: p.relatorio, mes: p.mes, filial: p.filial ?? null, funcionario: p.funcionario ?? null, formato, funcionarios },
  });

  if (formato === "csv") {
    return new NextResponse(gerarCsv(relatorios), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nome}"`, "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(new Uint8Array(gerarXlsx(relatorios)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
