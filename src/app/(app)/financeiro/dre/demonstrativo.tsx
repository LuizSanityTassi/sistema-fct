import { calcularDre, ROTULO_LINHA, type ContasDre, type Lancamentos, type LinhaDre } from "@/lib/financeiro/dre-contabil";
import { moedaFin } from "@/lib/financeiro/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { cn } from "@/lib/utils";

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mostraPct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : pct.format(v));
const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");

type Coluna = { chave: string; rotulo: string; l: Lancamentos; c: ContasDre };
type Linha =
  | { tipo: "conta"; rotulo: string; linha: LinhaDre; recuo?: boolean; sempre?: boolean }
  | { tipo: "total"; rotulo: string; valor: (c: ContasDre) => number; destaque?: boolean; cor?: boolean }
  | { tipo: "pct"; rotulo: string; valor: (c: ContasDre) => number | null }
  | { tipo: "pe"; rotulo: string };

const LINHAS: Linha[] = [
  { tipo: "total", rotulo: "Receita bruta", valor: (c) => c.receitaBruta },
  { tipo: "conta", rotulo: ROTULO_LINHA.vendas, linha: "vendas", recuo: true, sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.outras_receitas_brutas, linha: "outras_receitas_brutas", recuo: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.devolucoes, linha: "devolucoes", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.impostos_vendas, linha: "impostos_vendas", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.comissoes, linha: "comissoes", sempre: true },
  { tipo: "total", rotulo: "Receita líquida", valor: (c) => c.receitaLiquida },
  { tipo: "total", rotulo: "CMV", valor: (c) => c.cmv },
  { tipo: "conta", rotulo: ROTULO_LINHA.custo_mercadoria, linha: "custo_mercadoria", recuo: true, sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.ajuste_cmv, linha: "ajuste_cmv", recuo: true },
  { tipo: "total", rotulo: "Margem de contribuição", valor: (c) => c.margem, cor: true },
  { tipo: "pct", rotulo: "M.C. %", valor: (c) => c.margemPct },
  { tipo: "conta", rotulo: ROTULO_LINHA.despesas_pessoal, linha: "despesas_pessoal", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.despesas_administrativas, linha: "despesas_administrativas", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.despesas_comerciais, linha: "despesas_comerciais", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.outras_despesas, linha: "outras_despesas", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.depreciacao, linha: "depreciacao" },
  { tipo: "total", rotulo: "Total de despesas", valor: (c) => c.despesas },
  { tipo: "pct", rotulo: "Despesas % s/ receita líquida", valor: (c) => c.despesasPct },
  { tipo: "total", rotulo: "Lucro operacional", valor: (c) => c.lucroOperacional, cor: true },
  { tipo: "pct", rotulo: "L.O. %", valor: (c) => c.lucroOperacionalPct },
  { tipo: "conta", rotulo: ROTULO_LINHA.receita_financeira, linha: "receita_financeira", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.outras_receitas, linha: "outras_receitas", sempre: true },
  { tipo: "conta", rotulo: ROTULO_LINHA.despesas_financeiras, linha: "despesas_financeiras", sempre: true },
  { tipo: "total", rotulo: "Resultado financeiro", valor: (c) => c.financeiro },
  { tipo: "conta", rotulo: ROTULO_LINHA.ir_csll, linha: "ir_csll", sempre: true },
  { tipo: "total", rotulo: "Lucro / prejuízo", valor: (c) => c.lucro, destaque: true, cor: true },
  { tipo: "pct", rotulo: "Lucro / prejuízo %", valor: (c) => c.lucroPct },
  { tipo: "pe", rotulo: "Ponto de equilíbrio (receita bruta)" },
];

const tom = (v: number) => (v < 0 ? "text-red-700 dark:text-red-400" : v > 0 ? "text-emerald-700 dark:text-emerald-400" : "");

/** Edição no próprio demonstrativo: cada conta de cada mês vira um campo de um formulário (atributo form). */
export type EdicaoDemonstrativo = { form: string; campos: Record<string, { nome: string; valor: string }> };

/** DRE linha a linha: um mês por coluna, o total do período e as participações sobre a receita líquida e a bruta. */
export function Demonstrativo({ meses, porMes, editar }: { meses: string[]; porMes: Map<string, Lancamentos>; editar?: EdicaoDemonstrativo }) {
  const colunas: Coluna[] = meses.map((m) => {
    const l = porMes.get(m) ?? {};
    return { chave: m, rotulo: mesCurto(m), l, c: calcularDre(l) };
  });
  const lTotal: Lancamentos = {};
  for (const col of colunas) for (const [k, v] of Object.entries(col.l)) lTotal[k as LinhaDre] = (lTotal[k as LinhaDre] ?? 0) + (v ?? 0);
  const total: Coluna = { chave: "total", rotulo: "Total", l: lTotal, c: calcularDre(lTotal) };
  const todas = [...colunas, total];
  const sobre = (v: number, base: number) => (base ? v / base : null);
  const linhas = LINHAS.filter((d) => d.tipo !== "conta" || d.sempre || !!editar || todas.some((c) => c.l[d.linha]));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">Conta</th>
            {colunas.map((c) => (
              <th key={c.chave} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                {c.rotulo}
              </th>
            ))}
            <th className="border-l px-3 py-2 text-right font-semibold whitespace-nowrap text-foreground">Total</th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap" title="Participação sobre a receita líquida do período">
              % RL
            </th>
            <th className="px-3 py-2 text-right font-medium whitespace-nowrap" title="Participação sobre a receita bruta do período">
              % RB
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((d) => {
            const valorDe = (c: Coluna) => (d.tipo === "conta" ? (c.l[d.linha] ?? 0) : d.tipo === "total" ? d.valor(c.c) : 0);
            const negrito = d.tipo === "total";
            return (
              <tr key={d.rotulo} className={cn("border-b last:border-0", d.tipo === "total" && "bg-muted/40", d.tipo === "total" && d.destaque && "bg-muted")}>
                <th
                  scope="row"
                  className={cn(
                    "sticky left-0 z-10 px-4 py-1.5 text-left font-normal whitespace-nowrap",
                    d.tipo === "total" ? (d.destaque ? "bg-muted font-semibold" : "bg-muted font-semibold") : "bg-card",
                    d.tipo === "conta" && d.recuo && "pl-8 text-muted-foreground",
                    d.tipo === "pct" && "pl-8 text-xs text-muted-foreground",
                  )}
                >
                  {d.rotulo}
                </th>
                {todas.map((c) => {
                  const ehTotal = c.chave === "total";
                  const campo = editar && d.tipo === "conta" && !ehTotal ? editar.campos[`${c.chave}|${d.linha}`] : undefined;
                  if (campo) {
                    return (
                      <td key={c.chave} className="bg-amber-50 px-1 py-1 dark:bg-amber-400/10">
                        <input
                          form={editar!.form}
                          name={campo.nome}
                          defaultValue={campo.valor}
                          inputMode="decimal"
                          placeholder="0,00"
                          aria-label={`${d.rotulo} · ${c.rotulo}`}
                          className="h-7 w-24 rounded-md border bg-background px-2 text-right text-xs tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                        />
                      </td>
                    );
                  }
                  let texto: string;
                  let classe = "";
                  if (d.tipo === "pct") texto = mostraPct(d.valor(c.c));
                  else if (d.tipo === "pe") texto = c.c.pontoEquilibrio === null ? "Sem PE" : moedaFin(c.c.pontoEquilibrio);
                  else {
                    const v = valorDe(c);
                    texto = v ? moedaFin(v) : "—";
                    if (d.tipo === "total" && d.cor) classe = tom(v);
                  }
                  return (
                    <td
                      key={c.chave}
                      className={cn(
                        "px-3 py-1.5 text-right tabular-nums whitespace-nowrap",
                        negrito && "font-semibold",
                        d.tipo === "pct" && "text-xs text-muted-foreground",
                        ehTotal && "border-l",
                        classe,
                      )}
                    >
                      {texto}
                    </td>
                  );
                })}
                {d.tipo === "conta" || d.tipo === "total" ? (
                  <>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{mostraPct(sobre(valorDe(total), total.c.receitaLiquida))}</td>
                    <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{mostraPct(sobre(valorDe(total), total.c.receitaBruta))}</td>
                  </>
                ) : (
                  <>
                    <td />
                    <td />
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
