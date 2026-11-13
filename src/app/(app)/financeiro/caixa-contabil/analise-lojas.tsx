import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { Ponto } from "@/components/layout/status";
import { ordenarGrupos, type dadosAnalise } from "@/lib/data/analise";
import type { dreDoPeriodo, lerEscopo } from "@/lib/data/dre";
import { abreviarGrupo, GRUPOS_DESPESA_ORD } from "@/lib/financeiro/dre";
import { moedaSemRs } from "@/lib/financeiro/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { cabecalhosOrdenaveis, type Direcao } from "../dre/comum";

/**
 * Ranking de lojas, resumo por loja e comparativo mês a mês do Caixa contábil (antes ficavam em "Inadimplência e
 * ranking"). Mesmo recorte de grupo, unidade e ano do demonstrativo; valores sem "R$", como no resto da tela. Os dados
 * vêm prontos da página: as linhas unidade × mês × grupo (`dadosAnalise`) e, no comparativo, o próprio caixa contábil
 * (`dreDoPeriodo`, com os ajustes do contador).
 */
export type Esc = ReturnType<typeof lerEscopo>;
export type DadosLojas = Awaited<ReturnType<typeof dadosAnalise>>;
type DreAno = Awaited<ReturnType<typeof dreDoPeriodo>>;

const tom = (v: number) => (v < 0 ? "text-red-700" : v > 0 ? "text-emerald-700" : "text-muted-foreground");
const pct = (v: number, casas = 1) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");

export const METRICAS_RANKING = [
  ["resultado-ac", "Resultado — acumulado"],
  ["resultado-mes", "Resultado — mês"],
  ["despesa-ac", "Despesa — acumulado"],
  ["despesa-mes", "Despesa — mês"],
  ["receita-ac", "Receita — acumulado"],
  ["receita-mes", "Receita — mês"],
] as const;
export const metricaEscolhida = (m?: string) => (m && METRICAS_RANKING.some(([v]) => v === m) ? m : "resultado-ac");
/** Mês pedido na URL, se existir no ano; senão o último com movimento. */
export const mesEscolhido = (meses: string[], mes?: string): string | undefined => (mes && meses.includes(mes) ? mes : meses[meses.length - 1]);
/** Período do resumo por loja: "ano" (ano inteiro) ou um mês do ano (padrão: o último com movimento, como na DRE). */
export const periodoEscolhido = (meses: string[], periodo?: string) => (periodo === "ano" ? "ano" : (mesEscolhido(meses, periodo) ?? "ano"));

function Vazio({ ano }: { ano: string }) {
  return <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sem lançamentos para este recorte em {ano}.</section>;
}

export function MesSelect({ meses, mes }: { meses: string[]; mes?: string }) {
  return (
    <SelectNativo name="mes" defaultValue={mesEscolhido(meses, mes) ?? ""} aria-label="Mês" className="lg:w-48">
      {meses.map((m) => (
        <option key={m} value={m}>
          {rotuloCompetencia(m)}
        </option>
      ))}
    </SelectNativo>
  );
}

export function MetricaSelect({ metrica }: { metrica: string }) {
  return (
    <SelectNativo name="metrica" defaultValue={metricaEscolhida(metrica)} aria-label="Métrica" className="lg:w-56">
      {METRICAS_RANKING.map(([v, r]) => (
        <option key={v} value={v}>
          {r}
        </option>
      ))}
    </SelectNativo>
  );
}

/** Período do resumo por loja, como o da DRE: um mês ou o ano inteiro (consolidado). */
export function PeriodoSelect({ meses, periodo, ano }: { meses: string[]; periodo: string; ano: string }) {
  return (
    <SelectNativo name="periodo" defaultValue={periodo} aria-label="Período" className="lg:w-52">
      <optgroup label="Mês">
        {[...meses].reverse().map((m) => (
          <option key={m} value={m}>
            {rotuloCompetencia(m)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Consolidado">
        <option value="ano">Ano inteiro ({ano})</option>
      </optgroup>
    </SelectNativo>
  );
}

export function RankingView({ dados, escopo, metrica, mes }: { dados: DadosLojas; escopo: Esc; metrica: string; mes?: string }) {
  const { linhas, porId, meses } = dados;
  if (!linhas.length) return <Vazio ano={escopo.ano} />;
  const [met, base] = metricaEscolhida(metrica).split("-");
  const mesSel = mesEscolhido(meses, mes)!;
  const acc = new Map<string, { recMes: number; recAc: number; pagMes: number; pagAc: number }>();
  for (const l of linhas) {
    const a = acc.get(l.branch_id) ?? { recMes: 0, recAc: 0, pagMes: 0, pagAc: 0 };
    if (l.tipo === "receber") {
      a.recAc += l.total;
      if (l.competencia === mesSel) a.recMes += l.total;
    } else {
      a.pagAc += l.total;
      if (l.competencia === mesSel) a.pagMes += l.total;
    }
    acc.set(l.branch_id, a);
  }
  const valor = (a: { recMes: number; recAc: number; pagMes: number; pagAc: number }) => {
    const rec = base === "mes" ? a.recMes : a.recAc;
    const pag = base === "mes" ? a.pagMes : a.pagAc;
    return met === "despesa" ? pag : met === "receita" ? rec : rec - pag;
  };
  const lojas = [...acc.entries()].map(([id, a]) => ({ u: porId.get(id), v: valor(a) })).sort((a, b) => b.v - a.v);
  const titulo = `${met === "despesa" ? "Despesa" : met === "receita" ? "Receita" : "Resultado"} — ${base === "mes" ? rotuloCompetencia(mesSel) : "acumulado " + escopo.ano}`;
  return (
    <div className="max-w-2xl rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="w-12 px-2 py-2 text-left">#</th>
            <th className="px-2 py-2 text-left">Loja</th>
            <th className="px-2 py-2 text-right">{titulo}</th>
          </tr>
        </thead>
        <tbody>
          {lojas.map((l, i) => (
            <tr key={l.u?.id ?? i} className={`border-b last:border-0 ${l.u && !l.u.ativo ? "opacity-60" : ""}`}>
              <td className="px-2 py-1">{met === "resultado" && i < 3 ? <span className="font-semibold text-fct-red-dark">{i + 1}º</span> : `${i + 1}º`}</td>
              <td className="px-2 py-1">
                <span className="font-mono text-xs text-fct-tinta">{l.u?.codigo}</span> {l.u?.nome}
                {l.u && !l.u.ativo ? <span className="ml-1 text-xs text-muted-foreground">(inativa)</span> : null}
              </td>
              <td className={`px-2 py-1 text-right font-semibold tabular-nums ${met === "despesa" ? "text-red-700" : met === "receita" ? "text-emerald-700" : tom(l.v)}`}>{moedaSemRs(l.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted-foreground">{met === "resultado" ? "Resultado = receitas − despesas realizadas. Verde = lucro · vermelho = prejuízo." : met === "despesa" ? "Maior gasto no topo." : "Maior faturamento no topo."}</p>
    </div>
  );
}

/**
 * Resumo por loja no período escolhido (um mês ou o ano inteiro): receitas, despesas e resultado de cada loja, o
 * acumulado do ano até o mês e a composição das despesas; no fim, o consolidado do período (soma de todas as lojas do
 * recorte), como o "Resultado por filial" da DRE.
 */
export function ResumoLojasView({
  dados,
  escopo,
  periodo,
  ordem,
  dir,
  link,
}: {
  dados: DadosLojas;
  escopo: Esc;
  periodo: string;
  /** coluna da tabela por loja (?ordem=&dir=, como no "Resultado por filial" da DRE) */
  ordem?: string;
  dir?: string;
  link: (p: { ordem?: string; dir?: Direcao }) => string;
}) {
  const { linhas, porId, meses } = dados;
  if (!linhas.length) return <Vazio ano={escopo.ano} />;
  const mesSel = periodo === "ano" ? undefined : mesEscolhido(meses, periodo);
  const noPeriodo = (c: string) => !mesSel || c === mesSel;
  const ateOFim = (c: string) => !mesSel || c <= mesSel;
  const nomePeriodo = mesSel ? rotuloCompetencia(mesSel) : `ano inteiro de ${escopo.ano}`;
  const deAte = `${rotuloCompetencia(meses[0])}${meses.length > 1 ? ` a ${rotuloCompetencia(meses[meses.length - 1])}` : ""}`;
  type D = { rec: number; desp: number; acum: number; mov: boolean; g: Record<string, number> };
  const data = new Map<string, D>();
  for (const l of linhas) {
    if (!ateOFim(l.competencia)) continue;
    const d = data.get(l.branch_id) ?? { rec: 0, desp: 0, acum: 0, mov: false, g: {} };
    d.acum += (l.tipo === "receber" ? 1 : -1) * l.total;
    if (noPeriodo(l.competencia)) {
      d.mov = true;
      if (l.tipo === "receber") d.rec += l.total;
      else {
        d.desp += l.total;
        d.g[l.grupo] = (d.g[l.grupo] ?? 0) + l.total;
      }
    }
    data.set(l.branch_id, d);
  }
  const lojas = [...data.keys()].sort((a, b) => (porId.get(a)?.codigo ?? "").localeCompare(porId.get(b)?.codigo ?? "", "pt-BR", { numeric: true }));
  // consolidado do período: soma de todas as lojas do recorte (com as inativas, que também gastaram)
  const grpTot: Record<string, number> = {};
  let totRec = 0;
  let totDesp = 0;
  let totAcum = 0;
  for (const d of data.values()) {
    totRec += d.rec;
    totDesp += d.desp;
    totAcum += d.acum;
    for (const [g, v] of Object.entries(d.g)) grpTot[g] = (grpTot[g] ?? 0) + v;
  }
  const totRes = totRec - totDesp;
  const gs = ordenarGrupos(GRUPOS_DESPESA_ORD.filter((g) => grpTot[g]).concat(Object.keys(grpTot).filter((g) => !GRUPOS_DESPESA_ORD.includes(g))));
  // lojas ativas com movimento no período, pelo resultado do período
  const EMP = 1000;
  let nLucro = 0;
  let nPrej = 0;
  let nEmp = 0;
  for (const f of lojas) {
    const d = data.get(f)!;
    const u = porId.get(f);
    if ((u && !u.ativo) || !d.mov) continue;
    const r = d.rec - d.desp;
    if (r > EMP) nLucro++;
    else if (r < -EMP) nPrej++;
    else nEmp++;
  }
  const semMov = lojas.filter((f) => !data.get(f)!.mov).length;
  const pctR = (v: number) => (totRec > 0 ? `-${pct((v / totRec) * 100, 2)}` : "—");
  const pctG = (g: Record<string, number>, grupo: string, total: number) => (g[grupo] && total ? pct((g[grupo] / total) * 100, 2) : "—");
  const colAcum = mesSel ? `Acumulado até ${mesCurto(mesSel)}` : null;
  // ordem da tabela por loja: padrão pelo código; nas colunas de valor, 1º clique do maior para o menor, 2º inverte.
  // Loja sem movimento no período (ou sem o grupo) fica no fim nos dois sentidos.
  const pedida = ordem ?? "filial";
  const chaveOrd =
    pedida === "filial" || pedida === "receitas" || pedida === "despesas" || pedida === "resultado" || (pedida === "acumulado" && colAcum) || (pedida.startsWith("g:") && gs.includes(pedida.slice(2)))
      ? pedida
      : "filial";
  const dirOrd: Direcao = dir === "asc" || dir === "desc" ? dir : chaveOrd === "filial" ? "asc" : "desc";
  const valorOrd = (f: string): number | null => {
    const d = data.get(f)!;
    if (chaveOrd === "receitas") return d.mov ? d.rec : null;
    if (chaveOrd === "despesas") return d.mov ? d.desp : null;
    if (chaveOrd === "resultado") return d.mov ? d.rec - d.desp : null;
    if (chaveOrd === "acumulado") return d.acum;
    const g = chaveOrd.slice(2);
    return d.g[g] && d.desp ? d.g[g] / d.desp : null;
  };
  const lojasOrd =
    chaveOrd === "filial"
      ? dirOrd === "asc"
        ? lojas
        : [...lojas].reverse()
      : [...lojas].sort((a, b) => {
          const va = valorOrd(a);
          const vb = valorOrd(b);
          if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
          return dirOrd === "desc" ? vb - va : va - vb;
        });
  const cabecalho = cabecalhosOrdenaveis(chaveOrd, dirOrd, "filial", link);
  const th = "px-2 py-2 first:pl-2 last:pr-2";
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Receitas", moedaSemRs(totRec), "text-emerald-700", nomePeriodo],
          ["Despesas", moedaSemRs(totDesp), "text-red-700", nomePeriodo],
          ["Resultado", moedaSemRs(totRes), totRes < 0 ? "text-red-700" : "text-emerald-700", mesSel ? `acumulado até ${mesCurto(mesSel)}: ${moedaSemRs(totAcum)}` : deAte],
          ["Lojas ativas", `${nLucro} com lucro`, "", `${nEmp} empataram · ${nPrej} com prejuízo`],
        ].map(([r, v, t, nota]) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{r}</p>
            <p className={`mt-1 numero-sm ${t}`}>{v}</p>
            <p className="text-xs text-muted-foreground">{nota}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Lojas ativas por resultado · {nomePeriodo}</h2>
          <table className="w-full">
            <tbody>
              <tr className="bg-red-600 font-semibold text-white">
                <td className="px-3 py-1.5">Com prejuízo</td>
                <td className="px-3 py-1.5 text-right">{nPrej}</td>
              </tr>
              <tr className="bg-sky-300 font-semibold text-sky-950">
                <td className="px-3 py-1.5">Empataram (±1 mil)</td>
                <td className="px-3 py-1.5 text-right">{nEmp}</td>
              </tr>
              <tr className="bg-emerald-600 font-semibold text-white">
                <td className="px-3 py-1.5">Com lucro</td>
                <td className="px-3 py-1.5 text-right">{nLucro}</td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Composição (% do faturamento) · {nomePeriodo}</h2>
          <table className="w-full">
            <tbody>
              {gs.map((g) => (
                <tr key={g} className="border-b last:border-0">
                  <td className="py-1">{abreviarGrupo(g)}</td>
                  <td className="py-1 text-right tabular-nums text-red-700">{pctR(grpTot[g])}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-bold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right tabular-nums text-red-700">{pctR(totDesp)}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <section className="overflow-x-auto rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-3 pb-2">
          <h2 className="text-sm font-semibold">Resultado por loja · {nomePeriodo}</h2>
          <p className="text-xs text-muted-foreground">Clique no título da coluna para ordenar; clique de novo para inverter.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-y">
              {cabecalho("filial", "Loja", `${th} text-left`)}
              {cabecalho("receitas", "Receitas", `${th} text-right`)}
              {cabecalho("despesas", "Despesas", `${th} text-right`)}
              {cabecalho("resultado", "Resultado", `${th} text-right`)}
              {colAcum && cabecalho("acumulado", colAcum, `${th} text-right`)}
              {gs.map((g) => cabecalho(`g:${g}`, abreviarGrupo(g), `${th} text-right`))}
            </tr>
          </thead>
          <tbody>
            {lojasOrd.map((f) => {
              const d = data.get(f)!;
              const u = porId.get(f);
              const res = d.rec - d.desp;
              return (
                <tr key={f} className={`border-b last:border-0 ${u && !u.ativo ? "opacity-60" : ""}`}>
                  <td className="px-2 py-1">
                    <span className="font-mono text-xs text-fct-tinta">{u?.codigo}</span> {u?.nome}
                    {u && !u.ativo ? <span className="ml-1 text-xs text-muted-foreground">(inativa)</span> : null}
                  </td>
                  {d.mov ? (
                    <>
                      <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{moedaSemRs(d.rec)}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-red-700">{moedaSemRs(d.desp)}</td>
                      <td className={`px-2 py-1 text-right font-semibold tabular-nums ${tom(res)}`}>{moedaSemRs(res)}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="px-2 py-1 text-right text-xs text-muted-foreground">
                      sem movimento em {nomePeriodo}
                    </td>
                  )}
                  {colAcum && <td className={`px-2 py-1 text-right font-semibold tabular-nums ${tom(d.acum)}`}>{moedaSemRs(d.acum)}</td>}
                  {gs.map((g) => (
                    <td key={g} className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {pctG(d.g, g, d.desp)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-fct-yellow bg-muted/40 font-bold">
              <td className="px-2 py-1.5">Consolidado · {nomePeriodo}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-emerald-700">{moedaSemRs(totRec)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-red-700">{moedaSemRs(totDesp)}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${tom(totRes)}`}>{moedaSemRs(totRes)}</td>
              {colAcum && <td className={`px-2 py-1.5 text-right tabular-nums ${tom(totAcum)}`}>{moedaSemRs(totAcum)}</td>}
              {gs.map((g) => (
                <td key={g} className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {pctG(grpTot, g, totDesp)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Receitas, despesas e resultado de cada loja em {nomePeriodo}
          {mesSel ? `; "${colAcum}" = resultado de ${rotuloCompetencia(meses[0])} até ${rotuloCompetencia(mesSel)}` : ` (${deAte})`}. De Fornecedores até Patronal: % que cada grupo representa das despesas daquela loja (soma ~100%). O consolidado soma todas as lojas do recorte
          {semMov > 0 ? `; ${semMov} ${semMov === 1 ? "loja sem movimento no período aparece" : "lojas sem movimento no período aparecem"} só com o acumulado` : ""}.
        </p>
      </section>
    </div>
  );
}

export function ComparativoView({ dre, mes, link }: { dre: DreAno; mes?: string; link: (extra: Record<string, string | undefined>) => string }) {
  // os mesmos números do caixa contábil: ajustes do contador, saldo inicial digitado e cadeia do acumulado
  const meses = dre.mesesTotal;
  if (meses.length < 2) return <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Precisa de pelo menos 2 meses para comparar.</section>;
  // linhas por grupo do demonstrativo, em valor positivo (despesa sem o sinal)
  const linhasDe = (receita: boolean) => [
    ...dre.familias.filter((f) => f.sinal > 0 === receita).flatMap((f) => f.grupos.map((g) => ({ chave: `${f.nome}|${g.nome}`, nome: g.nome, porMes: g.porMes, sinal: f.sinal }))),
    ...(dre.naoClassificadas.length ? [{ chave: "sem", nome: "Sem classificação", porMes: Object.fromEntries(meses.map((m) => [m, dre.naoClassificadas.filter((l) => l.porMes[m].valor > 0 === receita).reduce((s, l) => s + l.porMes[m].valor, 0)])), sinal: receita ? 1 : -1 }] : []),
  ];
  const gruposRec = linhasDe(true);
  const gruposDesp = linhasDe(false);
  const v = (g: (typeof gruposRec)[number], m: string) => g.sinal * (g.porMes[m] ?? 0);
  const recM = (m: string) => dre.receitas.porMes[m] ?? 0;
  const despM = (m: string) => dre.saidas.porMes[m] ?? 0;
  const resM = (m: string) => dre.resultado.porMes[m] ?? 0;
  const B = mes && meses.includes(mes) && meses.indexOf(mes) > 0 ? mes : meses[meses.length - 1];
  const A = meses[meses.indexOf(B) - 1];
  const fmtPct = (d: number, base: number) => (Math.abs(d) < 1 ? "—" : `${d > 0 ? "+" : ""}${pct(base !== 0 ? (d / Math.abs(base)) * 100 : d !== 0 ? 100 : 0, 2)}`);
  const fmtVar = (d: number) => (Math.abs(d) < 1 ? "—" : `${d > 0 ? "+" : ""}${moedaSemRs(d)}`);
  const cor = (d: number, rec: boolean) => (Math.abs(d) < 1 ? "text-muted-foreground" : (rec ? d > 0 : d < 0) ? "text-emerald-700" : "text-red-700");
  const status = (d: number, rec: boolean) =>
    Math.abs(d) < 1 ? (
      <span className="text-muted-foreground">—</span>
    ) : (rec ? d > 0 : d < 0) ? (
      <span className="font-semibold text-emerald-700">
        <Ponto tom="sucesso" className="mr-1.5" />
        Positivo
      </span>
    ) : (
      <span className="font-semibold text-red-700">
        <Ponto tom="perigo" className="mr-1.5" />
        Negativo
      </span>
    );
  const linhaG = (g: (typeof gruposRec)[number], rec: boolean) => {
    const a = v(g, A);
    const b = v(g, B);
    if (!a && !b) return null;
    const d = b - a;
    return (
      <tr key={g.chave} className="border-b last:border-0">
        <td className="px-2 py-1 pl-6">{g.nome}</td>
        <td className={`px-2 py-1 text-right tabular-nums ${cor(d, rec)}`}>{fmtPct(d, a)}</td>
        <td className={`px-2 py-1 text-right font-semibold tabular-nums ${cor(d, rec)}`}>{fmtVar(d)}</td>
        <td className="px-2 py-1 text-right">{status(d, rec)}</td>
        <td />
      </tr>
    );
  };
  const linhaT = (nome: string, vb: number, va: number, rec: boolean) => {
    const d = vb - va;
    return (
      <tr className="bg-muted/40 font-bold">
        <td className="px-2 py-1">{nome}</td>
        <td className={`px-2 py-1 text-right tabular-nums ${cor(d, rec)}`}>{fmtPct(d, va)}</td>
        <td className={`px-2 py-1 text-right tabular-nums ${cor(d, rec)}`}>{fmtVar(d)}</td>
        <td className="px-2 py-1 text-right">{status(d, rec)}</td>
        <td />
      </tr>
    );
  };
  const dRes = resM(B) - resM(A);
  const ini = dre.saldoInicial[B];
  const acA = dre.acumulado[A] ?? null;
  const acB = dre.acumulado[B] ?? null;
  const dAc = acA !== null && acB !== null ? acB - acA : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        {meses.slice(1).map((m) => (
          <Link key={m} href={link({ mes: m })} className={`rounded-full border px-3 py-1 ${m === B ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
            {rotuloCompetencia(m)} × {rotuloCompetencia(meses[meses.indexOf(m) - 1])}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2 text-left">
                {rotuloCompetencia(B).toUpperCase()} × {rotuloCompetencia(A).toUpperCase()}
              </th>
              <th className="px-2 py-2 text-right">%</th>
              <th className="px-2 py-2 text-right">Variação</th>
              <th className="px-2 py-2 text-right">Status</th>
              <th className="px-2 py-2 text-right">AC</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-semibold">
              <td className="px-2 py-1">SALDO INICIAL</td>
              <td colSpan={3} />
              <td className={`px-2 py-1 text-right font-bold tabular-nums ${ini == null ? "text-muted-foreground" : tom(ini)}`}>{ini == null ? "—" : moedaSemRs(ini)}</td>
            </tr>
            <tr className="bg-primary font-semibold text-primary-foreground">
              <td className="px-2 py-1" colSpan={5}>
                RECEBIMENTOS
              </td>
            </tr>
            {gruposRec.map((g) => linhaG(g, true))}
            {linhaT("Total recebimento", recM(B), recM(A), true)}
            <tr className="bg-primary font-semibold text-primary-foreground">
              <td className="px-2 py-1" colSpan={5}>
                DESPESAS
              </td>
            </tr>
            {gruposDesp.map((g) => linhaG(g, false))}
            {linhaT("Total despesas", despM(B), despM(A), false)}
            <tr className="border-t-2 border-fct-yellow bg-muted/40 font-bold">
              <td className="px-2 py-1.5">RESULTADO REALIZADO TOTAL MÊS</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${cor(dRes, true)}`}>{fmtPct(dRes, resM(A))}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${cor(dRes, true)}`}>{fmtVar(dRes)}</td>
              <td className="px-2 py-1.5 text-right">{status(dRes, true)}</td>
              <td />
            </tr>
            <tr className="bg-muted/40 font-bold">
              <td className="px-2 py-1">Resultado acumulado total</td>
              <td className={`px-2 py-1 text-right tabular-nums ${cor(dAc ?? 0, true)}`}>{dAc === null ? "—" : fmtPct(dAc, acA ?? 0)}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${cor(dAc ?? 0, true)}`}>{dAc === null ? "—" : fmtVar(dAc)}</td>
              <td className="px-2 py-1 text-right">{status(dAc ?? 0, true)}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${acB == null ? "text-muted-foreground" : tom(acB)}`}>{acB == null ? "—" : moedaSemRs(acB)}</td>
            </tr>
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted-foreground">Compara o mês com o anterior, com os mesmos números do demonstrativo (ajustes do contador incluídos). Status = impacto no resultado: verde = receita subiu ou despesa caiu · vermelho = o contrário. AC: saldo inicial e resultado acumulado do Caixa contábil (a mesma cadeia, a partir do saldo inicial digitado lá).</p>
      </div>
    </div>
  );
}
