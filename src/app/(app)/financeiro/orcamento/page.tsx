import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Ponto } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { anosFinanceiro, GRUPOS_ESCOPO, lerEscopo } from "@/lib/data/dre";
import { listarCompetenciasFinanceiro } from "@/lib/data/financeiro";
import { dadosOrcamento, realizadoEfetivo, type LinhaOrcamento } from "@/lib/data/orcamento";
import { moedaFin } from "@/lib/financeiro/formatos";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { formatarMoeda } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { CelulaEditavel } from "../dre/celula-editavel";
import { salvarOrcamento } from "./actions";

export const metadata = { title: "Orçamento" };

const MESES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const pctTom = (p: number | null) => (p === null ? "text-muted-foreground" : p > 100 ? "text-red-700" : p >= 90 ? "text-orange-700" : p >= 80 ? "text-amber-700" : "text-emerald-700");
const pctTxt = (p: number | null) => (p === null ? "—" : `${p.toFixed(0)}%`);

export default async function OrcamentoPage({ searchParams }: PageProps<"/financeiro/orcamento">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/orcamento"), searchParams]);
  const escopo = lerEscopo(sp);
  const visao = sp.visao === "ano" ? "ano" : "mes";
  const [anos, competencias, dados] = await Promise.all([anosFinanceiro(), listarCompetenciasFinanceiro(), dadosOrcamento({ grupo: escopo.grupo }, escopo.ano)]);
  const mesesDoAno = [...new Set([...competencias.filter((c) => c.startsWith(escopo.ano)), ...dados.meses])].sort().reverse();
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : (mesesDoAno[0] ?? `${escopo.ano}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const podeEditar = podeFecharMes(sessao.papel);
  const base = { grupo: escopo.grupo };
  const mesesAno = Array.from({ length: 12 }, (_, i) => `${escopo.ano}-${String(i + 1).padStart(2, "0")}`);

  // KPIs
  const linhasMes = dados.linhas.filter((l) => l.porMes[mes]);
  const orcAno = (l: LinhaOrcamento) => mesesAno.reduce((s, m) => s + (l.porMes[m]?.orcado ?? 0), 0);
  const realAno = (l: LinhaOrcamento) => mesesAno.reduce((s, m) => s + realizadoEfetivo(l.porMes[m]), 0);
  const kpi = visao === "mes" ? linhasMes.filter((l) => l.porMes[mes].orcado != null).map((l) => ({ o: l.porMes[mes].orcado ?? 0, r: realizadoEfetivo(l.porMes[mes]) })) : dados.linhas.filter((l) => orcAno(l) > 0).map((l) => ({ o: orcAno(l), r: realAno(l) }));
  const totOrc = kpi.reduce((s, k) => s + k.o, 0);
  const totReal = kpi.reduce((s, k) => s + k.r, 0);
  const estouros = kpi.filter((k) => k.r > k.o);
  const pctGeral = totOrc > 0 ? (totReal / totOrc) * 100 : null;

  const familias = [...new Set((visao === "mes" ? linhasMes : dados.linhas).map((l) => l.familia))];

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Orçamento" descricao="Orçado × realizado por categoria de despesa. O realizado vem dos lançamentos; dá para sobrescrever (apague para voltar ao automático)." />

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_auto_auto] lg:items-center">
        <SelectNativo name="grupo" defaultValue={escopo.grupo} aria-label="Grupo" className="lg:w-44">
          {GRUPOS_ESCOPO.map((g) => (
            <option key={g} value={g}>
              {g === "TODOS" ? "Todas (grupo)" : g}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="visao" defaultValue={visao} aria-label="Visão" className="lg:w-40">
          <option value="mes">Mês a mês</option>
          <option value="ano">Ano (matriz)</option>
        </SelectNativo>
        <SelectNativo name="ano" defaultValue={escopo.ano} aria-label="Ano" className="lg:w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="mes" defaultValue={mes} aria-label="Mês" className="lg:w-48">
          {[...new Set([mes, ...mesesDoAno])].sort().reverse().map((m) => (
            <option key={m} value={m}>
              {rotuloCompetencia(m)}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/orcamento" />}>
          Limpar
        </Button>
      </form>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          [visao === "mes" ? "Orçado (categorias definidas)" : `Orçado anual ${escopo.ano}`, moedaFin(totOrc), ""],
          ["Realizado (das orçadas)", moedaFin(totReal), "text-red-700"],
          ["% consumido", pctGeral === null ? "—" : `${pctGeral.toFixed(0)}%`, pctTom(pctGeral)],
          ["Acima do orçamento", String(estouros.length), estouros.length ? "text-red-700" : "text-muted-foreground"],
        ].map(([r, v, t]) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{r}</p>
            <p className={`mt-1 numero-sm ${t}`}>{v}</p>
            {r === "Acima do orçamento" && estouros.length > 0 && <p className="text-xs text-muted-foreground">{formatarMoeda(estouros.reduce((s, k) => s + (k.r - k.o), 0))} de estouro</p>}
          </div>
        ))}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        {visao === "mes" ? (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-2 py-2 text-left">Categoria</th>
                <th className="px-2 py-2 text-right">Orçado</th>
                <th className="px-2 py-2 text-right">Realizado</th>
                <th className="px-2 py-2 text-right">Diferença</th>
                <th className="px-2 py-2 text-right">% consumido</th>
              </tr>
            </thead>
            <tbody>
              {linhasMes.length === 0 && (
                <tr>
                  <td colSpan={5} className="vazio">
                    Sem despesas nem orçamento em {rotuloCompetencia(mes)}.
                  </td>
                </tr>
              )}
              {familias.map((fam) => {
                const lista = linhasMes.filter((l) => l.familia === fam).sort((a, b) => realizadoEfetivo(b.porMes[mes]) - realizadoEfetivo(a.porMes[mes]));
                if (!lista.length) return null;
                return (
                  <React.Fragment key={fam}>
                    <tr className="bg-muted/50 font-semibold">
                      <td className="px-2 py-1">{fam}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{moedaFin(lista.reduce((s, l) => s + (l.porMes[mes].orcado ?? 0), 0)) === "R$ 0" ? "" : moedaFin(lista.reduce((s, l) => s + (l.porMes[mes].orcado ?? 0), 0))}</td>
                      <td className="px-2 py-1 text-right tabular-nums text-red-700">{formatarMoeda(lista.reduce((s, l) => s + realizadoEfetivo(l.porMes[mes]), 0))}</td>
                      <td colSpan={2} />
                    </tr>
                    {lista.map((l) => {
                      const c = l.porMes[mes];
                      const real = realizadoEfetivo(c);
                      const p = c.orcado ? (real / c.orcado) * 100 : null;
                      const estourou = c.orcado != null && real > c.orcado;
                      return (
                        <tr key={l.id} className={estourou ? "bg-red-50" : ""}>
                          <td className="px-2 py-1 pl-6">
                            {l.nome}
                            {estourou ? <Ponto tom="perigo" rotulo="Passou do orçamento" className="ml-1.5" /> : null}
                          </td>
                          <CelulaEditavel action={salvarOrcamento} campos={{ ...base, categoria_id: l.id, competencia: mes, campo: "valor" }} valorAtual={c.orcado} exibicao={c.orcado == null ? "—" : formatarMoeda(c.orcado)} podeEditar={podeEditar} />
                          <CelulaEditavel action={salvarOrcamento} campos={{ ...base, categoria_id: l.id, competencia: mes, campo: "realizado" }} valorAtual={c.realizadoInformado} exibicao={formatarMoeda(real)} automatico={formatarMoeda(c.realizado)} ajustado={c.realizadoInformado != null} classe="text-red-700" podeEditar={podeEditar} />
                          <td className={`px-2 py-1 text-right tabular-nums ${c.orcado == null ? "text-muted-foreground" : real - c.orcado > 0 ? "text-red-700" : "text-emerald-700"}`}>{c.orcado == null ? "—" : `${real - c.orcado > 0 ? "+" : ""}${formatarMoeda(real - c.orcado)}`}</td>
                          <td className={`px-2 py-1 text-right font-semibold tabular-nums ${pctTom(p)}`}>
                            {p !== null && (
                              <span className="mr-2 inline-block h-2 w-16 overflow-hidden rounded bg-muted align-middle">
                                <span className={`block h-full ${p > 100 ? "bg-red-600" : p >= 90 ? "bg-orange-500" : p >= 80 ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${Math.max(2, Math.min(100, p))}%` }} />
                              </span>
                            )}
                            {pctTxt(p)}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="sticky left-0 bg-card px-2 py-2 text-left">Categoria</th>
                {MESES_CURTO.map((m) => (
                  <th key={m} className="px-1 py-2 text-right">
                    {m}
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Orçado ano</th>
                <th className="px-2 py-2 text-right">Realiz. ano</th>
                <th className="px-2 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {familias.map((fam) => {
                const lista = dados.linhas.filter((l) => l.familia === fam).sort((a, b) => realAno(b) - realAno(a));
                return (
                  <React.Fragment key={fam}>
                    <tr className="bg-muted/50 font-semibold">
                      <td className="sticky left-0 bg-muted/50 px-2 py-1">{fam}</td>
                      <td colSpan={12} />
                      <td />
                      <td className="px-2 py-1 text-right tabular-nums text-red-700">{moedaFin(lista.reduce((s, l) => s + realAno(l), 0))}</td>
                      <td />
                    </tr>
                    {lista.map((l) => {
                      const oa = orcAno(l);
                      const ra = realAno(l);
                      const p = oa > 0 ? (ra / oa) * 100 : null;
                      return (
                        <tr key={l.id} className={oa > 0 && ra > oa ? "bg-red-50" : ""}>
                          <td className="sticky left-0 bg-card px-2 py-1 pl-4">{l.nome}</td>
                          {mesesAno.map((m) => {
                            const c = l.porMes[m];
                            return <CelulaEditavel key={m} action={salvarOrcamento} campos={{ ...base, categoria_id: l.id, competencia: m, campo: "valor" }} valorAtual={c?.orcado ?? null} exibicao={c?.orcado == null ? "—" : moedaFin(c.orcado)} automatico={`realizado ${moedaFin(realizadoEfetivo(c))}`} podeEditar={podeEditar} classe="text-xs" />;
                          })}
                          <td className="px-2 py-1 text-right font-semibold tabular-nums">{oa ? moedaFin(oa) : "—"}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-red-700">{moedaFin(ra)}</td>
                          <td className={`px-2 py-1 text-right font-semibold tabular-nums ${pctTom(p)}`}>{p === null ? "—" : `${p.toFixed(0)}%`}</td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {podeEditar ? "Digite o orçado de cada categoria (clique na célula). Na visão mês dá para sobrescrever o realizado; apague para voltar ao automático. " : ""}
        Vermelho = passou do orçamento. % consumido: verde até 80% · amarelo até 90% · laranja até 100% · vermelho acima.
      </p>
    </>
  );
}

import React from "react";
