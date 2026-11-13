import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { dadosAnalise } from "@/lib/data/analise";
import { anosFinanceiro, dreDoPeriodo, GRUPOS_ESCOPO, GRUPOS_JUNTOS, lerEscopo } from "@/lib/data/dre";
import { listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { moedaSemRs } from "@/lib/financeiro/formatos";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { ordemGrupo } from "@/lib/financeiro/rotulos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { AbasCaixaContabil, lerAbaCaixa } from "./abas";
import { salvarAjusteDre, salvarAjusteLinhaDre, salvarSaldoDre } from "./actions";
import { ComparativoView, MesSelect, MetricaSelect, PeriodoSelect, periodoEscolhido, RankingView, ResumoLojasView } from "./analise-lojas";
import { DreTabela } from "./dre-tabela";
import { TravaContabil } from "../trava-contabil";

export const metadata = { title: "Caixa contábil" };

/** Valores do Caixa contábil sem "R$" (pedido do usuário; só nesta tela — o resto do financeiro continua com R$). */
const semRs = moedaSemRs;

/**
 * Caixa contábil: o demonstrativo (com os ajustes do contador) e, nas outras abas com o mesmo recorte de grupo, unidade
 * e ano, o ranking de lojas, o resumo por loja (mês ou ano inteiro, com o consolidado) e o comparativo mês a mês.
 */
export default async function DrePage({ searchParams }: PageProps<"/financeiro/caixa-contabil">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/caixa-contabil"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const aba = lerAbaCaixa(s("aba"));
  const escopo = lerEscopo(sp);
  const vazias = sp.vazias === "1";
  // cada aba busca só o que usa: demonstrativo e comparativo = o caixa contábil (ajustes incluídos); ranking e resumo =
  // linhas unidade × mês × grupo (fin_resumo_unidades)
  const [anos, unidades, dre, dados] = await Promise.all([
    anosFinanceiro(),
    listarUnidadesFinanceiro(),
    aba === "demonstrativo" ? dreDoPeriodo(escopo, escopo.ano, escopo.de, { vazias }) : aba === "comparativo" ? dreDoPeriodo(escopo, escopo.ano) : null,
    aba === "ranking" || aba === "resumo" ? dadosAnalise(escopo, escopo.ano) : null,
  ]);
  // recorte (grupo, unidade, ano) que as abas e os links mantêm
  const recorte = new URLSearchParams();
  for (const k of ["grupo", "filial", "ano"]) if (s(k)) recorte.set(k, s(k));
  const link = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams(recorte);
    if (aba !== "demonstrativo") u.set("aba", aba);
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v);
    const q = u.toString();
    return `/financeiro/caixa-contabil${q ? `?${q}` : ""}`;
  };
  // liga/desliga "mostrar contas sem valor" mantendo o recorte
  const hrefVazias = link({ de: escopo.de, vazias: vazias ? undefined : "1" });
  const unidadesDoGrupo = unidades.filter((u) => escopo.grupo === "TODOS" || (escopo.grupos ?? [escopo.grupo]).includes(u.grupo));
  const gruposUnid = new Map<string, typeof unidades>();
  for (const u of unidadesDoGrupo) gruposUnid.set(u.grupo, [...(gruposUnid.get(u.grupo) ?? []), u]);
  const filialSel = escopo.filial ? unidades.find((u) => u.id === escopo.filial) : undefined;
  const podeEditar = podeLancar(sessao.papel);
  // visão somada (VARELA + ITAJAÍ…) é só para ver: o ajuste fica no grupo ou na filial
  const somada = !!escopo.grupos;
  const ultimo = dre?.mesesTotal[dre.mesesTotal.length - 1];
  const mes = s("mes") || undefined;
  const metrica = s("metrica") || undefined;
  const periodo = periodoEscolhido(dados?.meses ?? [], s("periodo") || undefined);
  const textoRecorte = `${escopo.grupo === "TODOS" ? "do grupo" : `· ${escopo.grupo}`}${filialSel ? ` · ${filialSel.codigo} ${filialSel.nome}` : ""} · ${escopo.ano}`;
  const descricao =
    aba === "ranking"
      ? `Ranking das lojas ${textoRecorte}: resultado, despesa ou receita, no mês ou no acumulado do ano.`
      : aba === "resumo"
        ? `Resumo por loja ${textoRecorte}: receitas, despesas e resultado de cada loja num mês ou no ano inteiro, com o consolidado do período no fim.`
        : aba === "comparativo"
          ? `Comparativo mês a mês ${textoRecorte}, com os mesmos números do demonstrativo (ajustes do contador incluídos).`
          : `Demonstrativo contábil ${textoRecorte}. Receitas, custo e despesas por mês, com ajustes do contador e cadeia de caixa.`;

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Caixa contábil" descricao={descricao} />
      <AbasCaixaContabil ativa={aba} recorte={recorte.toString()} podeImportar={podeEditar} />
      <TravaContabil papel={sessao.papel} />

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
        {aba !== "demonstrativo" && <input type="hidden" name="aba" value={aba} />}
        <SelectNativo name="grupo" defaultValue={escopo.grupo} aria-label="Grupo" className="lg:w-44">
          {[...GRUPOS_ESCOPO, ...Object.keys(GRUPOS_JUNTOS)].map((g) => (
            <option key={g} value={g}>
              {g === "TODOS" ? "Todas (grupo)" : g}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="filial" defaultValue={escopo.filial ?? ""} aria-label="Unidade" className="lg:w-72">
          <option value="">Todas as unidades</option>
          {[...gruposUnid.keys()].sort(ordemGrupo).map((g) => (
            <optgroup key={g} label={g}>
              {gruposUnid.get(g)!.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} — {u.nome}
                  {u.ativo ? "" : " (inativa)"}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <SelectNativo name="ano" defaultValue={escopo.ano} aria-label="Ano" className="lg:w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
        {aba === "demonstrativo" && dre && (
          <SelectNativo name="de" defaultValue={escopo.de ?? ""} aria-label="Totais a partir de" className="lg:w-48" title="Meses anteriores aparecem, mas não entram no total">
            <option value="">Totais desde o 1º mês</option>
            {dre.meses.map((m) => (
              <option key={m} value={m}>
                Totais a partir de {rotuloCompetencia(m)}
              </option>
            ))}
          </SelectNativo>
        )}
        {aba === "demonstrativo" && vazias && <input type="hidden" name="vazias" value="1" />}
        {aba === "ranking" && dados && <MetricaSelect metrica={metrica ?? ""} />}
        {aba === "ranking" && dados && dados.meses.length > 0 && <MesSelect meses={dados.meses} mes={mes} />}
        {aba === "resumo" && dados && dados.meses.length > 0 && <PeriodoSelect meses={dados.meses} periodo={periodo} ano={escopo.ano} />}
        {aba === "resumo" && s("ordem") && <input type="hidden" name="ordem" value={s("ordem")} />}
        {aba === "resumo" && s("dir") && <input type="hidden" name="dir" value={s("dir")} />}
        {aba === "comparativo" && dre && dre.mesesTotal.length > 1 && <MesSelect meses={dre.mesesTotal.slice(1)} mes={mes} />}
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={aba === "demonstrativo" ? "/financeiro/caixa-contabil" : `/financeiro/caixa-contabil?aba=${aba}`} />}>
          Limpar
        </Button>
      </form>

      {aba === "ranking" && dados && <RankingView dados={dados} escopo={escopo} metrica={metrica ?? ""} mes={mes} />}
      {aba === "resumo" && dados && (
        <ResumoLojasView dados={dados} escopo={escopo} periodo={periodo} ordem={s("ordem") || undefined} dir={s("dir") || undefined} link={(p) => link({ periodo: s("periodo") || undefined, ...p })} />
      )}
      {aba === "comparativo" && dre && <ComparativoView dre={dre} mes={mes} link={link} />}

      {aba === "demonstrativo" && dre && (
        dre.meses.length === 0 ? (
          <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sem lançamentos para este recorte em {escopo.ano}.</section>
        ) : (
          <>
            <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Receitas", semRs(dre.receitas.total), "text-emerald-700"],
                ["Saídas", semRs(dre.saidas.total), "text-red-700"],
                ["Resultado", semRs(dre.resultado.total), dre.resultado.total < 0 ? "text-red-700" : "text-emerald-700"],
                ["Caixa acumulado", semRs(ultimo ? (dre.acumulado[ultimo] ?? 0) : 0), (ultimo ? (dre.acumulado[ultimo] ?? 0) : 0) < 0 ? "text-red-700" : "text-emerald-700"],
              ].map(([r, v, t]) => (
                <div key={r} className="rounded-xl border bg-card p-4">
                  <p className="rotulo">{r}</p>
                  <p className={`mt-1 numero-sm ${t}`}>{v}</p>
                </div>
              ))}
            </section>
            {somada && (
              <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Visão somada de {escopo.grupos!.join(" e ")}: só para ver. Para ajustar um valor, escolha {escopo.grupos!.join(" ou ")} (ou a filial).
              </p>
            )}
            <DreTabela
              dre={dre}
              escopo={{ grupo: escopo.grupo, filial: escopo.filial ?? "" }}
              podeEditar={podeEditar && !somada}
              destacarAjustes={sessao.papel === "admin"}
              salvarAjuste={salvarAjusteDre}
              salvarSaldo={salvarSaldoDre}
              salvarLinha={salvarAjusteLinhaDre}
              contas={dre.contasProprias}
              ajustesDeBaixo={dre.ajustesDeBaixo}
              vazias={{ ligado: vazias, href: hrefVazias }}
            />
          </>
        )
      )}
    </>
  );
}
