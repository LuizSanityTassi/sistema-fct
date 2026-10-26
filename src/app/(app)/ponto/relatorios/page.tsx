import Link from "next/link";
import { ChartColumn } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { lerParamsRelatorioPonto, montarRelatorioPonto } from "@/lib/data/ponto-relatorios";
import { formatarData } from "@/lib/formatos";
import { RELATORIOS_PONTO, type TipoRelatorioPonto } from "@/lib/ponto/relatorios";
import { cn } from "@/lib/utils";
import { BotoesExportar } from "../_ui/exportar";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";

export const metadata = { title: "Relatórios do ponto" };

const PREVIA = 200;

const DESCRICAO: Record<TipoRelatorioPonto, string> = {
  horas: "Uma linha por funcionário: previsto, trabalhado, extras 50% e 100%, débito, saldo, noturno, faltas e atrasos. Base para a folha.",
  espelho: "O espelho dia a dia de cada funcionário (no PDF, uma página por pessoa com assinatura).",
  extras: "Cada dia com hora extra, separando 50% e 100% (folga e feriado).",
  faltas: "Faltas, atrasos, saídas antecipadas e dias com marcação faltando.",
  inconsistencias: "Dias que ferem a CLT: sem intervalo, intervalo curto, mais de 10h, interjornada menor que 11h, marcação faltando.",
  banco: "Saldo do banco de horas de cada funcionário hoje (positivas, negativas, meses fechados e em aberto).",
  marcacoes: "Todas as marcações do mês com NSR, método, aparelho, IP, localização e anulações (para fiscalização).",
};

export default async function RelatoriosPontoPage({ searchParams }: PageProps<"/ponto/relatorios">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/relatorios"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const p = { ...lerParamsRelatorioPonto(sp), filial: filtros.filial, departamento: filtros.departamento, q: filtros.q };
  const { relatorios, funcionarios } = await montarRelatorioPonto(sessao, p);
  const params = { relatorio: p.relatorio, mes: p.mes, filial: p.filial, departamento: p.departamento, q: p.q };
  const link = (r: string) => `/ponto/relatorios?${new URLSearchParams(Object.entries({ ...params, relatorio: r, filial: p.filial ?? (sp.filial === "todas" ? "todas" : undefined) }).filter(([, v]) => v) as [string, string][])}`;
  const linhasTotal = relatorios.reduce((s, r) => s + r.linhas.length, 0);

  return (
    <>
      <PageHeader eyebrow="Ponto" titulo="Relatórios do ponto" descricao="Escolha o relatório, a filial e o mês. Exporte em Excel, CSV ou imprima / salve em PDF." acoes={<BotoesExportar params={params} />} />

      <nav aria-label="Relatórios" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(RELATORIOS_PONTO) as TipoRelatorioPonto[]).map((r) => (
          <Link
            key={r}
            href={link(r)}
            aria-current={p.relatorio === r ? "page" : undefined}
            className={cn("rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40", p.relatorio === r && "border-fct-tinta ring-2 ring-fct-tinta/20")}
          >
            <p className="text-sm font-medium">{RELATORIOS_PONTO[r]}</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{DESCRICAO[r]}</p>
          </Link>
        ))}
      </nav>

      <BarraFiltrosPonto rota="/ponto/relatorios" filtros={filtros} mes={p.relatorio === "banco" ? undefined : p.mes} extra={<input type="hidden" name="relatorio" value={p.relatorio} />} />

      {relatorios.length === 0 || linhasTotal === 0 ? (
        <Painel>
          <EstadoVazio icone={ChartColumn} titulo="Sem dados para este filtro" descricao={funcionarios ? "Ninguém se encaixa neste relatório no período." : "Nenhum funcionário neste filtro."} />
        </Painel>
      ) : (
        relatorios.slice(0, p.relatorio === "espelho" ? 3 : 1).map((r, i) => (
          <Painel key={i} className="mb-4" titulo={r.titulo} descricao={`${r.linhas.length} linha(s)${r.linhas.length > PREVIA ? ` · mostrando as ${PREVIA} primeiras; exporte para ver tudo` : ""}${p.relatorio === "espelho" && relatorios.length > 3 && i === 2 ? ` · mais ${relatorios.length - 3} funcionário(s) na exportação` : ""}`}>
            <div className="overflow-x-auto border-t">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    {r.colunas.map((c) => (
                      <th key={c.chave} className="px-3 py-2 font-medium whitespace-nowrap">
                        {c.titulo}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.linhas.slice(0, PREVIA).map((l, j) => (
                    <tr key={j} className="border-b last:border-0">
                      {r.colunas.map((c) => (
                        <td key={c.chave} className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                          {c.tipo === "data" && typeof l[c.chave] === "string" ? formatarData(l[c.chave] as string) : (l[c.chave] ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {r.totais && (
                  <tfoot>
                    <tr className="border-t font-semibold">
                      {r.colunas.map((c) => (
                        <td key={c.chave} className="px-3 py-2 whitespace-nowrap tabular-nums">
                          {r.totais![c.chave] ?? ""}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Painel>
        ))
      )}
    </>
  );
}
