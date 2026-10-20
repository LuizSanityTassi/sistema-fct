import React from "react";
import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Ponto } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { dadosAnalise, inadimplencia, ordenarGrupos } from "@/lib/data/analise";
import { anosFinanceiro, GRUPOS_ESCOPO, lerEscopo } from "@/lib/data/dre";
import { abreviarGrupo, GRUPOS_DESPESA_ORD, GRUPOS_RECEITA_ORD } from "@/lib/financeiro/dre";
import { moedaFin } from "@/lib/financeiro/formatos";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { formatarMoeda } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { salvarInadimplencia } from "../caixa/actions";
import { CelulaEditavel } from "../caixa-contabil/celula-editavel";

export const metadata = { title: "Inadimplência e ranking" };

const ABAS = [
  { chave: "inadimplencia", rotulo: "Inadimplência" },
  { chave: "ranking", rotulo: "Ranking de lojas" },
  { chave: "resumo", rotulo: "Resumo por loja" },
  { chave: "comparativo", rotulo: "Comparativo mês a mês" },
] as const;
const MES = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const tom = (v: number) => (v < 0 ? "text-red-700" : v > 0 ? "text-emerald-700" : "text-muted-foreground");
const pct = (v: number, casas = 1) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

export default async function AnalisePage({ searchParams }: PageProps<"/financeiro/analise">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/analise"), searchParams]);
  const aba = (ABAS.find((a) => a.chave === sp.aba)?.chave ?? "inadimplencia") as (typeof ABAS)[number]["chave"];
  const escopo = lerEscopo(sp);
  const anos = await anosFinanceiro();
  const podeEditar = podeFecharMes(sessao.papel);
  const q = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams({ aba, grupo: escopo.grupo, ano: escopo.ano, ...(escopo.filial ? { filial: escopo.filial } : {}) });
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    return `/financeiro/analise?${u.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Inadimplência e ranking" descricao="Inadimplência de crediário e convênio, ranking e resumo por loja e comparativo mês a mês." />
      <nav aria-label="Abas" className="mb-4 flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <Link key={a.chave} href={`/financeiro/analise?aba=${a.chave}&grupo=${encodeURIComponent(escopo.grupo)}&ano=${escopo.ano}`} aria-current={aba === a.chave ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${aba === a.chave ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "inadimplencia" ? (
        <InadimplenciaView podeEditar={podeEditar} anoBase={Number(escopo.ano)} />
      ) : (
        <>
          <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_auto_auto_auto] lg:items-center">
            <input type="hidden" name="aba" value={aba} />
            <SelectNativo name="grupo" defaultValue={escopo.grupo} aria-label="Grupo" className="lg:w-44">
              {GRUPOS_ESCOPO.map((g) => (
                <option key={g} value={g}>
                  {g === "TODOS" ? "Todas (grupo)" : g}
                </option>
              ))}
            </SelectNativo>
            <SelectNativo name="ano" defaultValue={escopo.ano} aria-label="Ano" className="lg:w-28">
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </SelectNativo>
            {aba === "ranking" && (
              <SelectNativo name="metrica" defaultValue={typeof sp.metrica === "string" ? sp.metrica : "resultado-ac"} aria-label="Métrica" className="lg:w-56">
                <option value="resultado-ac">Resultado — acumulado</option>
                <option value="resultado-mes">Resultado — mês</option>
                <option value="despesa-ac">Despesa — acumulado</option>
                <option value="despesa-mes">Despesa — mês</option>
                <option value="receita-ac">Receita — acumulado</option>
                <option value="receita-mes">Receita — mês</option>
              </SelectNativo>
            )}
            {(aba === "ranking" || aba === "comparativo") && <MesSelect escopo={escopo} mes={typeof sp.mes === "string" ? sp.mes : undefined} />}
            <Button type="submit" variant="outline">
              Aplicar
            </Button>
            <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`/financeiro/analise?aba=${aba}`} />}>
              Limpar
            </Button>
          </form>
          {aba === "ranking" && <RankingView escopo={escopo} metrica={typeof sp.metrica === "string" ? sp.metrica : "resultado-ac"} mes={typeof sp.mes === "string" ? sp.mes : undefined} />}
          {aba === "resumo" && <ResumoView escopo={escopo} />}
          {aba === "comparativo" && <ComparativoView escopo={escopo} mes={typeof sp.mes === "string" ? sp.mes : undefined} link={q} />}
        </>
      )}
    </>
  );
}

type Esc = ReturnType<typeof lerEscopo>;

async function MesSelect({ escopo, mes }: { escopo: Esc; mes?: string }) {
  const { meses } = await dadosAnalise(escopo, escopo.ano);
  const atual = mes && meses.includes(mes) ? mes : meses[meses.length - 1];
  return (
    <SelectNativo name="mes" defaultValue={atual ?? ""} aria-label="Mês" className="lg:w-48">
      {meses.map((m) => (
        <option key={m} value={m}>
          {rotuloCompetencia(m)}
        </option>
      ))}
    </SelectNativo>
  );
}

async function InadimplenciaView({ podeEditar, anoBase }: { podeEditar: boolean; anoBase: number }) {
  const rows = await inadimplencia();
  const anos = [anoBase - 1, anoBase];
  const TIPOS = [
    ["crediario", "Crediário"],
    ["convenio", "Convênio"],
  ] as const;
  const g = (tipo: string, ano: number, mes: number) => rows.find((r) => r.tipo === tipo && r.ano === ano && r.mes === mes);
  const taxa = (a: number | null | undefined, r: number | null | undefined) => {
    if (a == null || r == null || r === 0) return <span className="text-muted-foreground">—</span>;
    const t = (a / r) * 100;
    return <span className={`font-semibold ${t > 10 ? "text-red-700" : t > 5 ? "text-amber-700" : "text-emerald-700"}`}>{pct(t, 2)}</span>;
  };
  // resumo do último mês com dado no ano base
  const comDado = rows.filter((r) => r.ano === anoBase && (r.atrasado != null || r.recebido != null)).map((r) => r.mes);
  const ultMes = comDado.length ? Math.max(...comDado) : 0;
  const soma = (ano: number, mes: number, campo: "atrasado" | "recebido") => rows.filter((r) => r.ano === ano && r.mes === mes).reduce((s, r) => s + (r[campo] ?? 0), 0);
  const atA = soma(anoBase, ultMes, "atrasado");
  const reA = soma(anoBase, ultMes, "recebido");
  const txA = reA > 0 ? (atA / reA) * 100 : null;
  const mesAnt = ultMes > 1 ? ultMes - 1 : 12;
  const anoAnt = ultMes > 1 ? anoBase : anoBase - 1;
  const reB = soma(anoAnt, mesAnt, "recebido");
  const txB = reB > 0 ? (soma(anoAnt, mesAnt, "atrasado") / reB) * 100 : null;
  const vari = txA != null && txB != null ? txA - txB : null;

  return (
    <div className="space-y-6">
      {ultMes > 0 && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [`Em atraso — ${MES[ultMes]}/${anoBase}`, formatarMoeda(atA), "text-red-700"],
            ["Recebido", formatarMoeda(reA), "text-emerald-700"],
            ["Taxa atual", txA == null ? "—" : pct(txA, 2), txA == null ? "" : txA > 10 ? "text-red-700" : txA > 5 ? "text-amber-700" : "text-emerald-700"],
            ["Variação vs mês anterior", vari == null ? "—" : `${vari > 0.05 ? "+" : ""}${vari.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`, vari == null ? "" : vari > 0 ? "text-red-700" : "text-emerald-700"],
          ].map(([r, v, t]) => (
            <div key={r} className="rounded-xl border bg-card p-4">
              <p className="rotulo">{r}</p>
              <p className={`mt-1 numero-sm ${t}`}>{v}</p>
            </div>
          ))}
        </section>
      )}
      {TIPOS.map(([tipo, rotulo]) => (
        <section key={tipo} className="overflow-x-auto rounded-xl border bg-card">
          <h2 className="px-4 py-3 text-sm font-semibold">{rotulo}</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-y">
                <th rowSpan={2} className="px-2 py-1 text-left">
                  Mês
                </th>
                {anos.map((a) => (
                  <th key={a} colSpan={3} className="border-l px-2 py-1 text-center">
                    {a}
                  </th>
                ))}
              </tr>
              <tr className="border-b">
                {anos.map((a) => (
                  <React.Fragment key={a}>
                    <th className="border-l px-2 py-1 text-right">Atrasado</th>
                    <th className="px-2 py-1 text-right">Recebido</th>
                    <th className="px-2 py-1 text-right">Taxa</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((mes) => (
                <tr key={mes} className="border-b last:border-0">
                  <td className="px-2 py-1">{MES[mes]}</td>
                  {anos.map((a) => {
                    const r = g(tipo, a, mes);
                    return (
                      <React.Fragment key={a}>
                        <CelulaEditavel action={salvarInadimplencia} campos={{ tipo, ano: String(a), mes: String(mes), campo: "atrasado" }} valorAtual={r?.atrasado ?? null} exibicao={r?.atrasado == null ? "—" : formatarMoeda(r.atrasado)} classe="border-l" podeEditar={podeEditar} />
                        <CelulaEditavel action={salvarInadimplencia} campos={{ tipo, ano: String(a), mes: String(mes), campo: "recebido" }} valorAtual={r?.recebido ?? null} exibicao={r?.recebido == null ? "—" : formatarMoeda(r.recebido)} podeEditar={podeEditar} />
                        <td className="px-2 py-1 text-right">{taxa(r?.atrasado, r?.recebido)}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-t-2 font-semibold">
                <td className="px-2 py-1">Total / taxa</td>
                {anos.map((a) => {
                  const at = rows.filter((r) => r.tipo === tipo && r.ano === a).reduce((s, r) => s + (r.atrasado ?? 0), 0);
                  const re = rows.filter((r) => r.tipo === tipo && r.ano === a).reduce((s, r) => s + (r.recebido ?? 0), 0);
                  return (
                    <React.Fragment key={a}>
                      <td className="border-l px-2 py-1 text-right tabular-nums">{formatarMoeda(at)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{formatarMoeda(re)}</td>
                      <td className="px-2 py-1 text-right">{taxa(at, re)}</td>
                    </React.Fragment>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">{podeEditar ? "Digite atrasado e recebido de cada mês; " : ""}a taxa aparece sozinha (verde ≤ 5%, amarelo ≤ 10%, vermelho acima).</p>
    </div>
  );
}

async function RankingView({ escopo, metrica, mes }: { escopo: Esc; metrica: string; mes?: string }) {
  const { linhas, porId, meses } = await dadosAnalise(escopo, escopo.ano);
  if (!linhas.length) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sem lançamentos para este recorte.</p>;
  const [met, base] = metrica.split("-");
  const mesSel = mes && meses.includes(mes) ? mes : meses[meses.length - 1];
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
              <td className={`px-2 py-1 text-right font-semibold tabular-nums ${met === "despesa" ? "text-red-700" : met === "receita" ? "text-emerald-700" : tom(l.v)}`}>{formatarMoeda(l.v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-3 text-xs text-muted-foreground">{met === "resultado" ? "Resultado = receitas − despesas realizadas. Verde = lucro · vermelho = prejuízo." : met === "despesa" ? "Maior gasto no topo." : "Maior faturamento no topo."}</p>
    </div>
  );
}

async function ResumoView({ escopo }: { escopo: Esc }) {
  const { linhas, porId, meses } = await dadosAnalise(escopo, escopo.ano);
  if (!linhas.length) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sem lançamentos para este recorte.</p>;
  const mesSel = meses[meses.length - 1];
  type D = { resMes: number; resAc: number; g: Record<string, number> };
  const data = new Map<string, D>();
  for (const l of linhas) {
    const d = data.get(l.branch_id) ?? { resMes: 0, resAc: 0, g: {} };
    const s = l.tipo === "receber" ? 1 : -1;
    d.resAc += s * l.total;
    if (l.competencia === mesSel) d.resMes += s * l.total;
    if (l.tipo === "pagar") d.g[l.grupo] = (d.g[l.grupo] ?? 0) + l.total;
    data.set(l.branch_id, d);
  }
  const lojas = [...data.keys()].sort((a, b) => (porId.get(a)?.codigo ?? "").localeCompare(porId.get(b)?.codigo ?? "", "pt-BR", { numeric: true }));
  const gs = ordenarGrupos(GRUPOS_DESPESA_ORD.filter((g) => lojas.some((f) => data.get(f)!.g[g])).concat([...new Set(linhas.filter((l) => l.tipo === "pagar" && !GRUPOS_DESPESA_ORD.includes(l.grupo)).map((l) => l.grupo))]));
  const EMP = 1000;
  let nLucro = 0, nPrej = 0, nEmp = 0;
  for (const f of lojas) {
    if (porId.get(f) && !porId.get(f)!.ativo) continue;
    const r = data.get(f)!.resAc;
    if (r > EMP) nLucro++;
    else if (r < -EMP) nPrej++;
    else nEmp++;
  }
  const totRec = linhas.filter((l) => l.tipo === "receber").reduce((s, l) => s + l.total, 0);
  const grpTot: Record<string, number> = {};
  for (const l of linhas) if (l.tipo === "pagar") grpTot[l.grupo] = (grpTot[l.grupo] ?? 0) + l.total;
  const pctR = (v: number) => (totRec > 0 ? `-${pct((v / totRec) * 100, 2)}` : "—");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Lojas ativas por resultado acumulado ({escopo.ano})</h2>
          <table className="w-full">
            <tbody>
              <tr className="bg-red-600 text-white font-semibold"><td className="px-3 py-1.5">Com prejuízo</td><td className="px-3 py-1.5 text-right">{nPrej}</td></tr>
              <tr className="bg-sky-300 text-sky-950 font-semibold"><td className="px-3 py-1.5">Empataram (±R$ 1 mil)</td><td className="px-3 py-1.5 text-right">{nEmp}</td></tr>
              <tr className="bg-emerald-600 text-white font-semibold"><td className="px-3 py-1.5">Com lucro</td><td className="px-3 py-1.5 text-right">{nLucro}</td></tr>
            </tbody>
          </table>
        </section>
        <section className="rounded-xl border bg-card p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">Composição (% do faturamento)</h2>
          <table className="w-full">
            <tbody>
              {gs.filter((g) => grpTot[g]).map((g) => (
                <tr key={g} className="border-b last:border-0">
                  <td className="py-1">{abreviarGrupo(g)}</td>
                  <td className="py-1 text-right tabular-nums text-red-700">{pctR(grpTot[g])}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-bold">
                <td className="py-1">Total</td>
                <td className="py-1 text-right tabular-nums text-red-700">{pctR(Object.values(grpTot).reduce((s, v) => s + v, 0))}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2 text-left">Loja</th>
              <th className="px-2 py-2 text-right">Result. {rotuloCompetencia(mesSel)}</th>
              <th className="px-2 py-2 text-right">Result. acumulado</th>
              {gs.map((g) => (
                <th key={g} className="px-2 py-2 text-right">
                  {abreviarGrupo(g)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lojas.map((f) => {
              const d = data.get(f)!;
              const u = porId.get(f);
              const totDesp = Object.values(d.g).reduce((s, x) => s + x, 0);
              return (
                <tr key={f} className={`border-b last:border-0 ${u && !u.ativo ? "opacity-60" : ""}`}>
                  <td className="px-2 py-1">
                    <span className="font-mono text-xs text-fct-tinta">{u?.codigo}</span> {u?.nome}
                    {u && !u.ativo ? <span className="ml-1 text-xs text-muted-foreground">(inativa)</span> : null}
                  </td>
                  <td className={`px-2 py-1 text-right font-semibold tabular-nums ${tom(d.resMes)}`}>{moedaFin(d.resMes)}</td>
                  <td className={`px-2 py-1 text-right font-semibold tabular-nums ${tom(d.resAc)}`}>{moedaFin(d.resAc)}</td>
                  {gs.map((g) => (
                    <td key={g} className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {d.g[g] && totDesp ? pct((d.g[g] / totDesp) * 100, 2) : "—"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted-foreground">Resultado do mês e acumulado por loja. De Fornecedores até Patronal: % que cada grupo representa das despesas daquela loja (soma ~100%).</p>
      </div>
    </div>
  );
}

async function ComparativoView({ escopo, mes, link }: { escopo: Esc; mes?: string; link: (extra: Record<string, string | undefined>) => string }) {
  const { linhas, meses } = await dadosAnalise(escopo, escopo.ano);
  if (meses.length < 2) return <p className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Precisa de pelo menos 2 meses para comparar.</p>;
  const val = new Map<string, number>();
  for (const l of linhas) val.set(`${l.grupo}|${l.competencia}`, (val.get(`${l.grupo}|${l.competencia}`) ?? 0) + l.total);
  const gruposRec = ordenarGrupos([...GRUPOS_RECEITA_ORD, ...linhas.filter((l) => l.tipo === "receber").map((l) => l.grupo)]).filter((g) => meses.some((m) => val.has(`${g}|${m}`)) && linhas.some((l) => l.grupo === g && l.tipo === "receber"));
  const gruposDesp = ordenarGrupos([...GRUPOS_DESPESA_ORD, ...linhas.filter((l) => l.tipo === "pagar").map((l) => l.grupo)]).filter((g) => linhas.some((l) => l.grupo === g && l.tipo === "pagar"));
  const soma = (grupos: string[], m: string) => grupos.reduce((s, g) => s + (val.get(`${g}|${m}`) ?? 0), 0);
  const resM = (m: string) => soma(gruposRec, m) - soma(gruposDesp, m);
  const acumAte = (m: string) => {
    let s = 0;
    for (const mm of meses) {
      s += resM(mm);
      if (mm === m) break;
    }
    return s;
  };
  const B = mes && meses.includes(mes) && meses.indexOf(mes) > 0 ? mes : meses[meses.length - 1];
  const A = meses[meses.indexOf(B) - 1];
  const fmtPct = (d: number, base: number) => (Math.abs(d) < 1 ? "—" : `${d > 0 ? "+" : ""}${pct(base !== 0 ? (d / Math.abs(base)) * 100 : d !== 0 ? 100 : 0, 2)}`);
  const fmtVar = (d: number) => (Math.abs(d) < 1 ? "—" : `${d > 0 ? "+" : ""}${formatarMoeda(d)}`);
  const cor = (d: number, rec: boolean) => (Math.abs(d) < 1 ? "text-muted-foreground" : (rec ? d > 0 : d < 0) ? "text-emerald-700" : "text-red-700");
  const status = (d: number, rec: boolean) => (Math.abs(d) < 1 ? <span className="text-muted-foreground">—</span> : (rec ? d > 0 : d < 0) ? <span className="font-semibold text-emerald-700"><Ponto tom="sucesso" className="mr-1.5" />Positivo</span> : <span className="font-semibold text-red-700"><Ponto tom="perigo" className="mr-1.5" />Negativo</span>);
  const linhaG = (g: string, rec: boolean) => {
    const a = val.get(`${g}|${A}`) ?? 0;
    const b = val.get(`${g}|${B}`) ?? 0;
    if (!a && !b) return null;
    const d = b - a;
    return (
      <tr key={g} className="border-b last:border-0">
        <td className="px-2 py-1 pl-6">{g}</td>
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
  const acA = acumAte(A);
  const acB = acumAte(B);
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
              <td className={`px-2 py-1 text-right font-bold tabular-nums ${tom(acA)}`}>{moedaFin(acA)}</td>
            </tr>
            <tr className="bg-primary text-primary-foreground font-semibold">
              <td className="px-2 py-1" colSpan={5}>
                RECEBIMENTOS
              </td>
            </tr>
            {gruposRec.map((g) => linhaG(g, true))}
            {linhaT("Total recebimento", soma(gruposRec, B), soma(gruposRec, A), true)}
            <tr className="bg-primary text-primary-foreground font-semibold">
              <td className="px-2 py-1" colSpan={5}>
                DESPESAS
              </td>
            </tr>
            {gruposDesp.map((g) => linhaG(g, false))}
            {linhaT("Total despesas", soma(gruposDesp, B), soma(gruposDesp, A), false)}
            <tr className="border-t-2 border-fct-yellow bg-muted/40 font-bold">
              <td className="px-2 py-1.5">RESULTADO REALIZADO TOTAL MÊS</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${cor(dRes, true)}`}>{fmtPct(dRes, resM(A))}</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${cor(dRes, true)}`}>{fmtVar(dRes)}</td>
              <td className="px-2 py-1.5 text-right">{status(dRes, true)}</td>
              <td />
            </tr>
            <tr className="bg-muted/40 font-bold">
              <td className="px-2 py-1">Resultado acumulado total</td>
              <td className={`px-2 py-1 text-right tabular-nums ${cor(acB - acA, true)}`}>{fmtPct(acB - acA, acA)}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${cor(acB - acA, true)}`}>{fmtVar(acB - acA)}</td>
              <td className="px-2 py-1 text-right">{status(acB - acA, true)}</td>
              <td className={`px-2 py-1 text-right tabular-nums ${tom(acB)}`}>{moedaFin(acB)}</td>
            </tr>
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-muted-foreground">Compara o mês com o anterior. Status = impacto no resultado: verde = receita subiu ou despesa caiu · vermelho = o contrário. AC = resultado acumulado (saldo inicial = acumulado até o mês anterior).</p>
      </div>
    </div>
  );
}
