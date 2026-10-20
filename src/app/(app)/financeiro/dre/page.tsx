import type { ReactNode } from "react";
import Link from "next/link";
import { FileUp, ScrollText, Trash2 } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { contas, distribuirRateios, empresasDre, lancamentosDre, somar, type MapaDre, type RateioDre } from "@/lib/data/dre-contabil";
import { baseDoRateio, calcularDre, ROTULO_LINHA, situacaoDoLucro, type Lancamentos } from "@/lib/financeiro/dre-contabil";
import { moedaFin } from "@/lib/financeiro/formatos";
import { formatarDataHora } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { excluirRateio, salvarRateio } from "./actions";
import { Demonstrativo } from "./demonstrativo";
import { RateioForm } from "./rateio-form";

export const metadata = { title: "DRE" };

const pct = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mostraPct = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? "—" : pct.format(v));
const tom = (v: number) => (v < 0 ? "text-red-700 dark:text-red-400" : v > 0 ? "text-emerald-700 dark:text-emerald-400" : "");
const query = (p: Record<string, string | undefined>) => new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
const ORDENS = { lucro: "Lucro / prejuízo", operacional: "Lucro operacional", faturamento: "Faturamento", margem: "M.C. %" } as const;
type Ordem = keyof typeof ORDENS;

/** DRE contábil por filial (planilha do contador): resumo por filial (mês ou acumulado), o demonstrativo mês a mês e o rateio por faturamento. */
export default async function DrePage({ searchParams }: PageProps<"/financeiro/dre">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/dre"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const podeImportar = sessao.papel === "admin" || sessao.papel === "financeiro" || sessao.papel === "contador";
  const botaoImportar = podeImportar ? (
    <Button nativeButton={false} render={<Link href="/financeiro/dre/importar" />}>
      <FileUp data-icon="inline-start" />
      Importar planilha
    </Button>
  ) : undefined;

  const empresas = await empresasDre();
  if (!empresas.length) {
    return (
      <>
        <PageHeader eyebrow="Financeiro" titulo="DRE" descricao="DRE contábil por filial, a partir da planilha que o contador manda todo mês." acoes={botaoImportar} />
        <section className="rounded-xl border bg-card">
          <EstadoVazio icone={ScrollText} titulo="Nenhuma DRE importada ainda" descricao="Importe a planilha “DRE POR FILIAIS” do contador para ver o resultado de cada filial." />
        </section>
      </>
    );
  }

  const emp = empresas.find((e) => e.empresa === s("empresa")) ?? empresas[0];
  const anos = [...new Set(emp.meses.map((m) => m.slice(0, 4)))].sort().reverse();
  const ano = anos.includes(s("ano")) ? s("ano") : anos[0];
  const mesesDoAno = emp.meses.filter((m) => m.startsWith(ano)).sort();
  const ver = s("ver") === "demonstrativo" ? "demonstrativo" : s("ver") === "rateio" ? "rateio" : "resumo";
  const { mapa, rateios } = await lancamentosDre(emp.empresa, `${ano}-01`, `${ano}-12`);

  const ids = [...mapa.keys()].filter(Boolean);
  const supabase = await createClient();
  const { data: lojas } = ids.length ? await supabase.from("branches").select("id, codigo, nome").in("id", ids) : { data: [] };
  const porId = new Map((lojas ?? []).map((l) => [l.id, l]));
  const filiaisOrdenadas = ids.map((id) => ({ id, codigo: porId.get(id)?.codigo ?? "?", nome: porId.get(id)?.nome ?? "" })).sort((a, b) => a.codigo.localeCompare(b.codigo));
  const base = { empresa: emp.empresa, ano };

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="DRE"
        descricao={`DRE contábil da ${emp.empresa} por filial (planilha do contador). Última importação: ${emp.ultima.arquivo ?? "planilha"} · ${emp.ultima.por ?? "—"} · ${formatarDataHora(emp.ultima.em)}.`}
        acoes={botaoImportar}
      />

      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-label="Visões da DRE">
        {(
          [
            ["resumo", "Resumo por filial"],
            ["demonstrativo", "Demonstrativo"],
            ["rateio", "Rateio por faturamento"],
          ] as const
        ).map(([v, r]) => (
          <Link
            key={v}
            href={`/financeiro/dre?${query({ ...base, ver: v === "resumo" ? undefined : v, filial: v === "demonstrativo" ? s("filial") || undefined : undefined })}`}
            aria-current={ver === v ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${ver === v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}
          >
            {r}
          </Link>
        ))}
      </nav>

      {ver === "resumo" ? (
        <Resumo s={s} base={base} empresas={empresas.map((e) => e.empresa)} anos={anos} mesesDoAno={mesesDoAno} mapa={mapa} rateios={rateios} filiais={filiaisOrdenadas} />
      ) : ver === "demonstrativo" ? (
        <VerDemonstrativo s={s} base={base} empresas={empresas.map((e) => e.empresa)} anos={anos} mesesDoAno={mesesDoAno} mapa={mapa} rateios={rateios} filiais={filiaisOrdenadas} />
      ) : (
        <Rateio s={s} base={base} empresas={empresas.map((e) => e.empresa)} anos={anos} mesesDoAno={mesesDoAno} mapa={mapa} rateios={rateios} filiais={filiaisOrdenadas} podeEditar={podeImportar} />
      )}
    </>
  );
}

type Props = {
  s: (k: string) => string;
  base: { empresa: string; ano: string };
  empresas: string[];
  anos: string[];
  mesesDoAno: string[];
  mapa: MapaDre;
  rateios: RateioDre[];
  filiais: { id: string; codigo: string; nome: string }[];
};

function Filtros({ base, empresas, anos, ver, children }: { base: Props["base"]; empresas: string[]; anos: string[]; ver: string; children?: ReactNode }) {
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      {ver !== "resumo" && <input type="hidden" name="ver" value={ver} />}
      {empresas.length > 1 && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Empresa</span>
          <SelectNativo name="empresa" defaultValue={base.empresa} className="w-40">
            {empresas.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </SelectNativo>
        </label>
      )}
      {empresas.length === 1 && <input type="hidden" name="empresa" value={base.empresa} />}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Ano</span>
        <SelectNativo name="ano" defaultValue={base.ano} className="w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
      </label>
      {children}
      <Button type="submit" variant="outline">
        Ver
      </Button>
    </form>
  );
}

function Resumo({ s, base, empresas, anos, mesesDoAno, mapa, rateios, filiais }: Props) {
  const periodo = s("mes") === "acumulado" ? "acumulado" : mesesDoAno.includes(s("mes")) ? s("mes") : mesesDoAno[mesesDoAno.length - 1];
  const meses = periodo === "acumulado" ? mesesDoAno : [periodo];
  const ordem: Ordem = s("ordem") in ORDENS ? (s("ordem") as Ordem) : "lucro";
  const temLancamento = (id: string) => meses.some((m) => Object.values(mapa.get(id)?.get(m) ?? {}).some((v) => v));
  const linhas = filiais
    .filter((f) => temLancamento(f.id))
    .map((f) => ({ ...f, c: contas(mapa, f.id, meses) }))
    .sort((a, b) => {
      const k = (x: typeof a) => (ordem === "operacional" ? x.c.lucroOperacional : ordem === "faturamento" ? x.c.receitaBruta : ordem === "margem" ? (x.c.margemPct ?? -9) : x.c.lucro);
      return k(b) - k(a);
    });
  const consolidado = contas(mapa, "*", meses);
  const daEmpresa = calcularDre(somar(mapa, "", meses));
  const somaFiliais = calcularDre(
    filiais.reduce<Lancamentos>((acc, f) => {
      const l = somar(mapa, f.id, meses);
      for (const [k, v] of Object.entries(l)) acc[k as keyof Lancamentos] = (acc[k as keyof Lancamentos] ?? 0) + (v ?? 0);
      return acc;
    }, {}),
  );
  const conta = { prejuizo: 0, empate: 0, lucro: 0 };
  for (const l of linhas) conta[situacaoDoLucro(l.c.lucro)]++;
  const nomePeriodo = periodo === "acumulado" ? `acumulado de ${rotuloCompetencia(mesesDoAno[0])} a ${rotuloCompetencia(mesesDoAno[mesesDoAno.length - 1])}` : rotuloCompetencia(periodo);
  const linkOrdem = (o: Ordem) => `/financeiro/dre?${query({ ...base, mes: s("mes") || undefined, ordem: o === "lucro" ? undefined : o })}`;

  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="resumo">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Período</span>
          <SelectNativo name="mes" defaultValue={periodo} className="w-52">
            {[...mesesDoAno].reverse().map((m) => (
              <option key={m} value={m}>
                {rotuloCompetencia(m)}
              </option>
            ))}
            <option value="acumulado">Acumulado do ano</option>
          </SelectNativo>
        </label>
        {ordem !== "lucro" && <input type="hidden" name="ordem" value={ordem} />}
      </Filtros>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cartao rotulo="Lucro / prejuízo" valor={moedaFin(consolidado.lucro)} tom={tom(consolidado.lucro)} nota={`${nomePeriodo}, com depreciação`} />
        <Cartao rotulo="Receita bruta" valor={moedaFin(consolidado.receitaBruta)} nota={`receita líquida ${moedaFin(consolidado.receitaLiquida)}`} />
        <Cartao rotulo="Margem de contribuição" valor={mostraPct(consolidado.margemPct)} nota={`${moedaFin(consolidado.margem)} · CMV ${mostraPct(consolidado.cmvSobreBruta)} da receita bruta`} />
        <Cartao rotulo="Filiais" valor={`${conta.lucro} com lucro`} nota={`${conta.empate} praticamente empataram (até R$ 2.000) · ${conta.prejuizo} com prejuízo`} />
      </div>

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">
            Resultado por filial · {nomePeriodo}
            {rateios.some((r) => meses.includes(r.competencia)) && <span className="ml-2 text-xs font-normal text-muted-foreground">(com o rateio por faturamento)</span>}
          </h2>
          <p className="text-xs text-muted-foreground">
            Ordenar por:{" "}
            {(Object.keys(ORDENS) as Ordem[]).map((o, i) => (
              <span key={o}>
                {i > 0 && " · "}
                <Link href={linkOrdem(o)} className={o === ordem ? "font-semibold text-foreground" : "hover:underline"}>
                  {ORDENS[o]}
                </Link>
              </span>
            ))}
          </p>
        </header>
        {linhas.length === 0 ? (
          <EstadoVazio compacto icone={ScrollText} titulo="Nenhuma filial com lançamento nesse período" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="hidden text-right md:table-cell">Part. %</TableHead>
                <TableHead className="text-right">M.C. %</TableHead>
                <TableHead className="hidden text-right lg:table-cell" title="Custo das mercadorias sobre a receita bruta">
                  CMV %
                </TableHead>
                <TableHead className="hidden text-right xl:table-cell">Impostos %</TableHead>
                <TableHead className="hidden text-right xl:table-cell">Comissões %</TableHead>
                <TableHead className="hidden text-right lg:table-cell" title="Despesas sobre a receita bruta">
                  Despesas %
                </TableHead>
                <TableHead className="hidden text-right md:table-cell">L. operacional</TableHead>
                <TableHead className="text-right">Lucro / prejuízo</TableHead>
                <TableHead className="hidden text-right sm:table-cell" title="Lucro / prejuízo sobre a receita bruta">
                  L/P %
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const sit = situacaoDoLucro(l.c.lucro);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/financeiro/dre?${query({ ...base, ver: "demonstrativo", filial: l.id })}`} className="font-medium hover:underline">
                        <span className="font-mono text-xs">{l.codigo}</span> {l.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(l.c.receitaBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{mostraPct(consolidado.receitaBruta ? l.c.receitaBruta / consolidado.receitaBruta : null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mostraPct(l.c.margemPct)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{mostraPct(l.c.cmvSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">{mostraPct(l.c.impostosSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">{mostraPct(l.c.comissoesSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{mostraPct(l.c.despesasSobreBruta)}</TableCell>
                    <TableCell className={`hidden text-right tabular-nums md:table-cell ${tom(l.c.lucroOperacional)}`}>{moedaFin(l.c.lucroOperacional)}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${tom(l.c.lucro)}`}>
                      {moedaFin(l.c.lucro)}
                      {sit === "empate" && <span className="block text-[11px] font-normal text-muted-foreground">praticamente empatou</span>}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{mostraPct(l.c.lucroSobreBruta)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Soma das filiais</TableCell>
                <TableCell className="text-right tabular-nums">{moedaFin(somaFiliais.receitaBruta)}</TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="text-right tabular-nums">{mostraPct(somaFiliais.margemPct)}</TableCell>
                <TableCell className="hidden lg:table-cell" />
                <TableCell className="hidden xl:table-cell" />
                <TableCell className="hidden xl:table-cell" />
                <TableCell className="hidden lg:table-cell" />
                <TableCell className={`hidden text-right tabular-nums md:table-cell ${tom(somaFiliais.lucroOperacional)}`}>{moedaFin(somaFiliais.lucroOperacional)}</TableCell>
                <TableCell className={`text-right tabular-nums ${tom(somaFiliais.lucro)}`}>{moedaFin(somaFiliais.lucro)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
              </TableRow>
              {daEmpresa.despesas !== 0 && (
                <TableRow>
                  <TableCell>Depreciação (da empresa)</TableCell>
                  <TableCell colSpan={8} className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums text-red-700 dark:text-red-400">{moedaFin(daEmpresa.despesas)}</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-semibold">Total com depreciação</TableCell>
                <TableCell colSpan={8} className="hidden md:table-cell" />
                <TableCell className={`text-right font-semibold tabular-nums ${tom(consolidado.lucro)}`}>{moedaFin(consolidado.lucro)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{mostraPct(consolidado.lucroSobreBruta)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </section>
    </>
  );
}

function VerDemonstrativo({ s, base, empresas, anos, mesesDoAno, mapa, rateios, filiais }: Props) {
  const filial = filiais.find((f) => f.id === s("filial"));
  const chave = filial ? filial.id : "*";
  const porMes = new Map(mesesDoAno.map((m) => [m, somar(mapa, chave, [m])]));
  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="demonstrativo">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={filial?.id ?? ""} className="w-64">
            <option value="">Consolidado da empresa</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
      </Filtros>
      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">{filial ? `${filial.codigo} ${filial.nome}` : `Consolidado da ${base.empresa}`} · {base.ano}</h2>
          {filial ? (
            <Status tom="info">sem a depreciação, que é da empresa{rateios.length ? " · com o rateio por faturamento" : ""}</Status>
          ) : (
            <Status tom="neutro">todas as filiais + depreciação</Status>
          )}
        </header>
        <Demonstrativo meses={mesesDoAno} porMes={porMes} />
      </section>
    </>
  );
}

function Rateio({ s, base, empresas, anos, mesesDoAno, mapa, rateios, filiais, podeEditar }: Props & { podeEditar: boolean }) {
  const mes = mesesDoAno.includes(s("mes")) ? s("mes") : mesesDoAno[mesesDoAno.length - 1];
  const doMes = rateios.filter((r) => r.competencia === mes);
  const distribuicao = distribuirRateios(mapa, mes, doMes);
  const comBase = filiais.map((f) => ({ ...f, base: baseDoRateio(mapa.get(f.id)?.get(mes) ?? {}) }));
  const totalBase = comBase.reduce((t, f) => t + Math.max(0, f.base), 0);
  const linhas = comBase.filter((f) => f.base > 0).sort((a, b) => b.base - a.base);
  const semFaturamento = comBase.filter((f) => f.base <= 0 && Object.values(mapa.get(f.id)?.get(mes) ?? {}).some((v) => v));
  const totalRateado = doMes.reduce((t, r) => t + r.valor, 0);

  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="rateio">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mês</span>
          <SelectNativo name="mes" defaultValue={mes} className="w-52">
            {[...mesesDoAno].reverse().map((m) => (
              <option key={m} value={m}>
                {rotuloCompetencia(m)}
              </option>
            ))}
          </SelectNativo>
        </label>
      </Filtros>

      <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
        Valores da empresa no mês (PIS/COFINS, ICMS, despesa financeira…) divididos entre as filiais pela participação de cada uma no faturamento, como a aba “FAT %” da planilha. O valor de cada filial entra na DRE dela, na conta escolhida. Lance aqui só o que a contabilidade manda como total: se a planilha já trouxer o valor rateado nas abas das filiais, ele contaria duas vezes.
      </p>

      {podeEditar && (
        <section className="mb-4 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Ratear um valor de {rotuloCompetencia(mes)}</h2>
          <RateioForm key={mes} action={salvarRateio} empresa={base.empresa} mes={mes} />
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Rateio de {rotuloCompetencia(mes)}</h2>
          <p className="text-xs text-muted-foreground">Faturamento do mês: {moedaFin(totalBase)}</p>
        </header>
        {doMes.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-5 pb-3">
            {doMes.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-xs">
                <span className="font-medium">{r.item}</span>
                <span className="text-muted-foreground">
                  · {ROTULO_LINHA[r.linha].replace(/^\(−\) /, "")} · {moedaFin(r.valor)}
                  {r.observacao ? ` · ${r.observacao}` : ""}
                </span>
                {podeEditar && (
                  <form action={excluirRateio}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Tirar ${r.item} do rateio`} title="Tirar do rateio">
                      <Trash2 />
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {linhas.length === 0 ? (
          <EstadoVazio compacto icone={ScrollText} titulo="Nenhuma filial com faturamento nesse mês" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Part. %</TableHead>
                {distribuicao.map(({ rateio }) => (
                  <TableHead key={rateio.id} className="text-right">
                    {rateio.item}
                  </TableHead>
                ))}
                {distribuicao.length > 1 && <TableHead className="text-right">Total rateado</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((f, i) => {
                const daFilial = distribuicao.map(({ porFilial }) => porFilial.get(f.id)?.valor ?? 0);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{i + 1}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{f.codigo}</span> {f.nome}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(f.base)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mostraPct(totalBase ? f.base / totalBase : null)}</TableCell>
                    {daFilial.map((v, j) => (
                      <TableCell key={j} className="text-right tabular-nums">
                        {moedaFin(v)}
                      </TableCell>
                    ))}
                    {distribuicao.length > 1 && <TableCell className="text-right font-medium tabular-nums">{moedaFin(daFilial.reduce((a, b) => a + b, 0))}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{moedaFin(totalBase)}</TableCell>
                <TableCell className="text-right tabular-nums">{mostraPct(totalBase ? 1 : null)}</TableCell>
                {distribuicao.map(({ rateio }) => (
                  <TableCell key={rateio.id} className="text-right tabular-nums">
                    {moedaFin(rateio.valor)}
                  </TableCell>
                ))}
                {distribuicao.length > 1 && <TableCell className="text-right tabular-nums">{moedaFin(totalRateado)}</TableCell>}
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {semFaturamento.length > 0 && (
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">Sem faturamento no mês, não recebem rateio: {semFaturamento.map((f) => `${f.codigo} ${f.nome}`).join(", ")}.</p>
        )}
      </section>
    </>
  );
}

function Cartao({ rotulo, valor, nota, tom: cor }: { rotulo: string; valor: string; nota?: string; tom?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="rotulo">{rotulo}</p>
      <p className={`mt-1.5 numero-sm ${cor ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
