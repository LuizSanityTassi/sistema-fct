import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { acessoFluxo, categoriasDespesaOmie, compartilhamentosFluxo, feriadosDoPeriodo, fluxoDoPeriodo, notasFluxo, realizadoPorCategoria, regrasFluxo, ROTA_FLUXO, ultimasImportacoesPagar, type DiaFluxo } from "@/lib/data/fluxo-caixa";
import { classificador, corBloco, FORA, LUGARES, NAO_CLASSIFICADA, ROTULO_BLOCO, rotuloLugar } from "@/lib/fluxo-caixa/classes";
import { EMPRESAS_FLUXO, ehEmpresaFluxo, type EmpresaFluxo } from "@/lib/fluxo-caixa/omie-pivot";
import { ddmm, ddmmaaaa, diasEntre, fimDeSemana, mesesDoAno, nomeDiaSemana, nomeMes, segunda, semanasDoMes, somaDias, ultimoDia } from "@/lib/fluxo-caixa/periodos";
import { Anotacoes } from "./anotacoes";
import { CategoriasLugar } from "./categorias-lugar";
import { GradePrevisoes, type DiaPrevisao } from "./grade-previsoes";
import { Compartilhar } from "./compartilhar";
import { ImportarPagar } from "./importar-pagar";
import { TabelaCategorias, type LinhaCategoria } from "./tabela-categorias";
import { TabelaDiaria, type LinhaDia } from "./tabela-diaria";

export const metadata = { title: "Fluxo de caixa" };

/** A pagar do dia a partir disto fica em vermelho forte (na planilha, os dias de ~R$ 600 mil para cima). */
const DIA_PESADO = 500_000;
const VISOES = [
  { chave: "diario", rotulo: "Diário" },
  { chave: "semanal", rotulo: "Semanal" },
  { chave: "mensal", rotulo: "Mensal" },
  { chave: "previsoes", rotulo: "Previsões" },
] as const;

const moeda = (v: number) => `${v < 0 ? "-" : ""}R$ ${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tom = (v: number) => (v < 0 ? "text-red-700" : "text-emerald-700");
const mesVizinho = (mes: string, n: number) => {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

type Soma = { receber: number; pagar: number; cartao: number; negativos: number; semPrevisao: number; maior: { data: string; valor: number } | null; motivos: string[] };

/** Soma dos dias de um período (semana ou mês). */
function somar(dias: string[], fluxo: Map<string, DiaFluxo>, feriados: Map<string, string>): Soma {
  const s: Soma = { receber: 0, pagar: 0, cartao: 0, negativos: 0, semPrevisao: 0, maior: null, motivos: [] };
  for (const d of dias) {
    const x = fluxo.get(d);
    if (!fimDeSemana(d) && !feriados.has(d) && x?.receber == null) s.semPrevisao++;
    if (!x) continue;
    s.receber += x.receber ?? 0;
    s.pagar += x.pagar;
    s.cartao += x.cartao ?? 0;
    if ((x.receber ?? 0) - x.pagar < 0) s.negativos++;
    if (x.pagar && (!s.maior || x.pagar > s.maior.valor)) s.maior = { data: d, valor: x.pagar };
    if (x.motivo) s.motivos.push(`${ddmm(d)}: ${x.motivo}`);
  }
  return s;
}

export default async function FluxoCaixaPage({ searchParams }: PageProps<"/financeiro/fluxo-caixa">) {
  const [sessao, sp] = await Promise.all([exigirAcesso(ROTA_FLUXO), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const visao = ["semanal", "mensal", "previsoes"].includes(s("visao")) ? s("visao") : "diario";
  const pedida = s("empresa");
  const empresa: EmpresaFluxo | null = pedida === "TODAS" ? null : ehEmpresaFluxo(pedida) ? pedida : "VARELA";
  const empresas = empresa ? [empresa] : EMPRESAS_FLUXO;
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  // semanal: a semana (segunda) escolhida; o mês dela dá o resumo das semanas
  const semana = segunda(/^\d{4}-\d{2}-\d{2}$/.test(s("semana")) ? s("semana") : hoje);
  const mes = visao === "semanal" ? semana.slice(0, 7) : /^\d{4}-\d{2}$/.test(s("mes")) ? s("mes") : hoje.slice(0, 7);
  const ano = /^\d{4}$/.test(s("ano")) ? s("ano") : mes.slice(0, 4);

  const semanas = semanasDoMes(mes);
  // período em foco (cartões e tabela de categorias) e período carregado (o semanal carrega as semanas do mês)
  const [de, ate] = visao === "semanal" ? [semana, somaDias(semana, 6)] : visao === "mensal" ? [`${ano}-01-01`, `${ano}-12-31`] : [`${mes}-01`, ultimoDia(mes)];
  const [deCarga, ateCarga] = visao === "semanal" ? [semanas[0].de, semanas[semanas.length - 1].ate] : [de, ate];
  const [fluxo, feriados, acesso, notas, importacoes, regras, categoriasOmie] = await Promise.all([
    fluxoDoPeriodo(empresas, deCarga, ateCarga),
    feriadosDoPeriodo(deCarga, ateCarga),
    acessoFluxo(sessao.id, sessao.papel),
    notasFluxo(empresas),
    ultimasImportacoesPagar(),
    regrasFluxo(),
    categoriasDespesaOmie(),
  ]);
  // mensal: o pago de verdade, para o quadro "realizado" (lançamentos do Omie já importados no sistema)
  const realizado = visao === "mensal" ? await realizadoPorCategoria(empresas, `${ano}-01`, `${ano}-12`) : [];
  // previsões: as tabelas do financeiro das duas empresas lado a lado
  const porEmpresa = visao === "previsoes" ? await Promise.all(EMPRESAS_FLUXO.map((e) => fluxoDoPeriodo([e], de, ate))) : [];
  const classifica = classificador(regras);
  const comp = acesso.compartilhar ? await compartilhamentosFluxo() : null;

  const total = somar(diasEntre(de, ate), fluxo, feriados);
  // rodapé da tabela de semanas/meses: tudo o que ela mostra
  const totalTabela = visao === "semanal" ? somar(diasEntre(deCarga, ateCarga), fluxo, feriados) : total;
  const piorDia = diasEntre(de, ate)
    .map((d) => ({ d, b: (fluxo.get(d)?.receber ?? 0) - (fluxo.get(d)?.pagar ?? 0) }))
    .reduce<{ d: string; b: number } | null>((p, x) => (!p || x.b < p.b ? x : p), null);
  const link = (extra: Record<string, string>) => {
    const q = new URLSearchParams({ visao, empresa: empresa ?? "TODAS", mes, ano, semana, ...extra });
    return `${ROTA_FLUXO}?${q}`;
  };
  const chip = (ativo: boolean) => `rounded-full border px-3 py-1 text-sm ${ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`;

  const linhasDia: LinhaDia[] = (visao === "semanal" ? diasEntre(semana, somaDias(semana, 6)) : diasEntre(`${mes}-01`, ultimoDia(mes))).map((d) => {
    const x = fluxo.get(d);
    return {
      data: d,
      rotulo: ddmmaaaa(d),
      semana: nomeDiaSemana(d),
      especial: feriados.get(d) ? `Feriado · ${feriados.get(d)}` : fimDeSemana(d) ? nomeDiaSemana(d) : null,
      hoje: d === hoje,
      receber: x?.receber ?? null,
      cartao: x?.cartao ?? null,
      pagar: x?.pagar ?? 0,
      pagarLugares: (x?.pagarCats ?? []).reduce<Record<string, number>>((t, c) => {
        const l = rotuloLugar(classifica(c.grupo, c.categoria).lugar);
        t[l] = (t[l] ?? 0) + c.valor;
        return t;
      }, {}),
      motivo: x?.motivo ?? null,
    };
  });

  const periodos =
    visao === "semanal"
      ? semanas.map((w) => ({ chave: w.de, rotulo: `${ddmm(w.de)} a ${ddmm(w.ate)}`, atual: w.de === semana, href: link({ semana: w.de }) as string | null, soma: somar(diasEntre(w.de, w.ate), fluxo, feriados) }))
      : mesesDoAno(ano).map((m) => ({ chave: m, rotulo: nomeMes(m), atual: hoje.startsWith(m), href: link({ visao: "diario", mes: m }), soma: somar(diasEntre(`${m}-01`, ultimoDia(m)), fluxo, feriados) }));
  const acumulados = periodos.reduce<number[]>((a, p) => [...a, (a.at(-1) ?? 0) + p.soma.receber - p.soma.pagar], []);

  // a pagar por lugar do relatório × coluna (dia, semana ou mês, conforme a visão)
  const colunasCat =
    visao === "mensal"
      ? periodos.map((p) => ({ rotulo: p.rotulo.replace(/ \d{4}$/, ""), atual: p.atual, dias: diasEntre(`${p.chave}-01`, ultimoDia(p.chave)) }))
      : diasEntre(de, ate).map((d) => ({ rotulo: visao === "semanal" ? `${nomeDiaSemana(d).slice(0, 3)} ${ddmm(d)}` : ddmm(d), atual: d === hoje, dias: [d] }));
  const previstoCols = colunasCat.map((c) => c.dias.flatMap((d) => fluxo.get(d)?.pagarCats ?? []));
  const linhasCat = montarCategorias(previstoCols, classifica, categoriasOmie);
  const totalCat = previstoCols.map((itens) => itens.reduce((t, x) => t + x.valor, 0));
  const realizadoCols = mesesDoAno(ano).map((m) => realizado.filter((r) => r.competencia === m));
  const linhasReal = montarCategorias(realizadoCols, classifica, categoriasOmie);
  const totalReal = realizadoCols.map((itens) => itens.reduce((t, x) => t + x.valor, 0));
  const nomeEmpresa = empresa ?? "VARELA e NAZÁRIO";
  const itensCategoria = categoriasOmie.map((c) => ({ ...c, ...classifica(c.grupo, c.categoria) }));
  const colunasPrev = EMPRESAS_FLUXO.flatMap((e) => [
    { chave: `${e}|receber`, empresa: e, campo: "receber" as const, titulo: `A receber ${e}`, sub: "Dinheiro + PIX + Débito" },
    { chave: `${e}|cartao`, empresa: e, campo: "cartao" as const, titulo: `Cartão ${e}`, sub: "Cartões de crédito" },
  ]);
  const diasPrev: DiaPrevisao[] = diasEntre(de, ate).map((d) => ({
    data: d,
    rotulo: `${ddmmaaaa(d)} ${nomeDiaSemana(d).slice(0, 3).toLowerCase()}`,
    especial: feriados.get(d) ? `Feriado · ${feriados.get(d)}` : fimDeSemana(d) ? nomeDiaSemana(d) : null,
    hoje: d === hoje,
    valores: Object.fromEntries(EMPRESAS_FLUXO.flatMap((e, i) => [[`${e}|receber`, porEmpresa[i]?.get(d)?.receber ?? null], [`${e}|cartao`, porEmpresa[i]?.get(d)?.cartao ?? null]])),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Fluxo de caixa"
        descricao="A receber (previsão do financeiro) × a pagar (Omie), balanço, previsão de cartão e os motivos de cada dia. VARELA inclui Itajaí; NAZÁRIO inclui Blumenau."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VISOES.map((v) => (
          <Link key={v.chave} href={link({ visao: v.chave })} className={chip(visao === v.chave)} aria-current={visao === v.chave ? "page" : undefined}>
            {v.chave === "previsoes" ? "Previsões (a receber e cartão)" : `Fluxo de caixa ${v.rotulo.toLowerCase()}`}
          </Link>
        ))}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        {[...EMPRESAS_FLUXO, "TODAS"].map((e) => (
          <Link key={e} href={link({ empresa: e })} className={chip((empresa ?? "TODAS") === e)}>
            {e === "TODAS" ? "As duas" : e}
          </Link>
        ))}
        <span className="ml-auto flex items-center gap-1 text-sm">
          {visao === "mensal" ? (
            <>
              <Link href={link({ ano: String(Number(ano) - 1) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Ano anterior">
                ‹
              </Link>
              <span className="min-w-20 text-center font-semibold">{ano}</span>
              <Link href={link({ ano: String(Number(ano) + 1) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Próximo ano">
                ›
              </Link>
            </>
          ) : visao === "semanal" ? (
            <>
              <Link href={link({ semana: somaDias(semana, -7) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Semana anterior">
                ‹
              </Link>
              <span className="min-w-40 text-center font-semibold">
                {ddmm(semana)} a {ddmmaaaa(somaDias(semana, 6))}
              </span>
              <Link href={link({ semana: somaDias(semana, 7) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Próxima semana">
                ›
              </Link>
            </>
          ) : (
            <>
              <Link href={link({ mes: mesVizinho(mes, -1) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Mês anterior">
                ‹
              </Link>
              <span className="min-w-36 text-center font-semibold capitalize">{nomeMes(mes)}</span>
              <Link href={link({ mes: mesVizinho(mes, 1) })} className="rounded border px-2 py-1 hover:bg-muted" aria-label="Próximo mês">
                ›
              </Link>
            </>
          )}
          <Link href={link({ mes: hoje.slice(0, 7), ano: hoje.slice(0, 4), semana: segunda(hoje) })} className="ml-1 rounded border px-2 py-1 text-xs hover:bg-muted">
            hoje
          </Link>
        </span>
      </div>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["A receber", moeda(total.receber), "text-emerald-700", total.semPrevisao ? `${total.semPrevisao} dia(s) útil(eis) sem previsão` : "previsão completa"],
          ["A pagar", moeda(total.pagar), "text-red-700", total.maior ? `maior: ${ddmm(total.maior.data)} · ${moeda(total.maior.valor)}` : "—"],
          ["Balanço", moeda(total.receber - total.pagar), tom(total.receber - total.pagar), `${total.negativos} dia(s) no vermelho`],
          ["Previsão de cartão", moeda(total.cartao), "text-amber-700", "cartões de crédito"],
          ["Pior dia", piorDia && piorDia.b < 0 ? moeda(piorDia.b) : "—", "text-red-700", piorDia && piorDia.b < 0 ? `${nomeDiaSemana(piorDia.d)}, ${ddmm(piorDia.d)}` : "nenhum dia negativo"],
        ].map(([r, v, t, d]) => (
          <div key={r} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{r}</p>
            <p className={`mt-1 numero-sm ${t}`}>{v}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <ImportarPagar importacoes={importacoes} podeEditar={acesso.editar} />
          {comp && <Compartilhar acessos={comp.acessos} disponiveis={comp.disponiveis} />}

          {visao !== "previsoes" && <CategoriasLugar itens={itensCategoria} podeEditar={acesso.editar} />}

          {visao === "previsoes" && <GradePrevisoes dias={diasPrev} colunas={colunasPrev} podeEditar={acesso.editar} tituloMes={nomeMes(mes)} />}

          {visao === "mensal" && (
            <>
              <TabelaCategorias
                faixa={{ texto: `PREVISÃO · ${nomeEmpresa} · ${ano}`, tom: "previsao" }}
                colunas={colunasCat.map(({ rotulo, atual }) => ({ rotulo, atual }))}
                linhas={linhasCat}
                totalGeral={totalCat}
                rotuloTotal="TOTAL DO MÊS"
                centavos
                nivelInicial={1}
                rodape="Previsão = contas a pagar do Omie (relatório Contas por Período) pela data de previsão."
              />
              <TabelaCategorias
                faixa={{ texto: `REALIZADO · ${nomeEmpresa} · ${ano}`, tom: "realizado" }}
                colunas={colunasCat.map(({ rotulo, atual }) => ({ rotulo, atual }))}
                linhas={linhasReal}
                totalGeral={totalReal}
                rotuloTotal="TOTAL DO MÊS"
                centavos
                nivelInicial={1}
                rodape={`Realizado = pagamentos do Omie já importados no sistema (Caixa contábil → Importar novo mês), por mês de competência${empresa === "VARELA" ? "; VARELA inclui Itajaí" : empresa === "NAZÁRIO" ? "; NAZÁRIO inclui Blumenau" : ""}.`}
              />
            </>
          )}

          {(visao === "diario" || visao === "semanal") && (
            <TabelaDiaria linhas={linhasDia} empresa={empresa} podeEditar={acesso.editar} tituloMes={visao === "semanal" ? `Semana ${ddmm(semana)} a ${ddmm(somaDias(semana, 6))}` : nomeMes(mes)} diaPesado={DIA_PESADO} />
          )}
          {(visao === "semanal" || visao === "mensal") && (
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="text-xs font-semibold text-white">
                  <tr>
                    <th className="bg-neutral-800 px-2 py-2 text-left">{visao === "semanal" ? `Semanas de ${nomeMes(mes)}` : "Mês"}</th>
                    <th className="bg-red-900 px-2 py-2 text-right">A receber</th>
                    <th className="bg-red-800 px-2 py-2 text-right">A pagar</th>
                    <th className="bg-red-700 px-2 py-2 text-right">Balanço</th>
                    <th className="bg-red-600 px-2 py-2 text-right">Acumulado</th>
                    <th className="bg-amber-400 px-2 py-2 text-right text-neutral-900">Previsão de cartão</th>
                    <th className="bg-neutral-700 px-2 py-2 text-right">Dias no vermelho</th>
                    <th className="bg-emerald-100 px-2 py-2 text-left text-neutral-900">Maior a pagar · motivos</th>
                  </tr>
                </thead>
                <tbody>
                  {periodos.map((p, i) => {
                    const balanco = p.soma.receber - p.soma.pagar;
                    const acumulado = acumulados[i];
                    return (
                      <tr key={p.chave} className={`border-b align-top last:border-0 ${p.atual ? "bg-primary/5 font-medium" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-1.5 capitalize">
                          {p.href ? (
                            <Link href={p.href} className="underline-offset-2 hover:underline">
                              {p.rotulo}
                            </Link>
                          ) : (
                            p.rotulo
                          )}
                          {p.soma.semPrevisao > 0 && <span className="ml-2 text-[11px] normal-case text-amber-700">{p.soma.semPrevisao} sem previsão</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{moeda(p.soma.receber)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums text-red-700`}>{p.soma.pagar ? `(${moeda(p.soma.pagar).replace("R$ ", "")})` : "—"}</td>
                        <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${tom(balanco)}`}>{moeda(balanco)}</td>
                        <td className={`px-2 py-1.5 text-right text-xs tabular-nums ${tom(acumulado)}`}>{moeda(acumulado)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{moeda(p.soma.cartao)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${p.soma.negativos ? "text-red-700" : "text-muted-foreground"}`}>{p.soma.negativos}</td>
                        <td className="max-w-md px-2 py-1.5 text-xs">
                          {p.soma.maior && (
                            <p className="font-medium">
                              {ddmm(p.soma.maior.data)} · {moeda(p.soma.maior.valor)}
                            </p>
                          )}
                          {p.soma.motivos.slice(0, 4).map((m) => (
                            <p key={m} className="text-muted-foreground">
                              {m}
                            </p>
                          ))}
                          {p.soma.motivos.length > 4 && <p className="text-muted-foreground">+{p.soma.motivos.length - 4}</p>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-rose-50 text-sm font-semibold">
                    <td className="px-2 py-1.5">Total</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{moeda(totalTabela.receber)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-red-700">{moeda(totalTabela.pagar)}</td>
                    <td className={`px-2 py-1.5 text-right tabular-nums ${tom(totalTabela.receber - totalTabela.pagar)}`}>{moeda(totalTabela.receber - totalTabela.pagar)}</td>
                    <td />
                    <td className="px-2 py-1.5 text-right tabular-nums">{moeda(totalTabela.cartao)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{totalTabela.negativos}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                {visao === "semanal" ? `Semanas de segunda a domingo que tocam ${nomeMes(mes)} (de ${ddmm(deCarga)} a ${ddmm(ateCarga)}); clique na semana para abrir o dia a dia.` : "Clique no mês para abrir o dia a dia."} Acumulado = balanço somado desde o 1º período da tabela.
              </p>
            </div>
          )}
          {(visao === "diario" || visao === "semanal") && <TabelaCategorias colunas={colunasCat.map(({ rotulo, atual }) => ({ rotulo, atual }))} linhas={linhasCat} totalGeral={totalCat} />}
        </div>
        <Anotacoes notas={notas} empresa={empresa} meuId={sessao.id} souAdmin={sessao.papel === "admin"} podeEditar={acesso.editar} />
      </div>
    </>
  );
}

/**
 * Linhas da tabela "A pagar por categoria": bloco → grupo → categoria, na ordem da planilha de categorias do fluxo;
 * as categorias do Omie sem valor também entram (a tabela esconde ou mostra). Sem lugar = "NÃO CLASSIFICADAS".
 */
function montarCategorias(
  colunas: { grupo: string; categoria: string; valor: number }[][],
  classifica: ReturnType<typeof classificador>,
  conhecidas: { grupo: string; categoria: string }[],
): LinhaCategoria[] {
  type Cat = { rotulo: string; dica: string; ordem: number; valores: number[] };
  const porLugar = new Map<string, Map<string, Cat>>();
  const cat = (grupo: string, categoria: string) => {
    const c = classifica(grupo, categoria);
    const nome = categoria || grupo || "(sem categoria)";
    const k = `${grupo}|${categoria}`;
    let m = porLugar.get(c.lugar);
    if (!m) porLugar.set(c.lugar, (m = new Map()));
    let x = m.get(k);
    if (!x) m.set(k, (x = { rotulo: nome, dica: `Omie: ${grupo || "—"} › ${categoria || "—"}`, ordem: c.ordem, valores: colunas.map(() => 0) }));
    return x;
  };
  for (const c of conhecidas) cat(c.grupo, c.categoria);
  colunas.forEach((itens, i) => {
    for (const pc of itens) cat(pc.grupo, pc.categoria).valores[i] += pc.valor;
  });
  const soma = (vs: number[][]) => colunas.map((_, i) => vs.reduce((t, v) => t + v[i], 0));
  const total = (v: number[]) => v.reduce((t, x) => t + x, 0);
  const cats = (lugar: string) => [...(porLugar.get(lugar)?.values() ?? [])].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const linhas: LinhaCategoria[] = [];
  const blocos = [...new Set(LUGARES.map((l) => l.bloco))];
  for (const bloco of blocos) {
    const lugares = LUGARES.filter((l) => l.bloco === bloco);
    const doBloco = lugares.flatMap((l) => cats(l.chave));
    const vb = soma(doBloco.map((c) => c.valores));
    linhas.push({ nivel: 1, rotulo: ROTULO_BLOCO[bloco] ?? bloco, valores: vb, total: total(vb), cor: corBloco(bloco) });
    for (const l of lugares) {
      const cs = cats(l.chave);
      if (l.subgrupo) {
        const vs = soma(cs.map((c) => c.valores));
        linhas.push({ nivel: 2, rotulo: l.subgrupo, valores: vs, total: total(vs) });
      }
      for (const c of cs) linhas.push({ nivel: 3, rotulo: c.rotulo, dica: c.dica, valores: c.valores, total: total(c.valores) });
    }
  }
  // fora do relatório (não é despesa): só aparece se veio valor, para o total continuar batendo
  const fora = cats(FORA).filter((c) => total(c.valores) !== 0);
  if (fora.length) {
    const vf = soma(fora.map((c) => c.valores));
    linhas.push({ nivel: 1, rotulo: FORA, valores: vf, total: total(vf), cor: "amarelo" });
    for (const c of fora) linhas.push({ nivel: 3, rotulo: c.rotulo, dica: c.dica, valores: c.valores, total: total(c.valores) });
  }
  const sem = cats(NAO_CLASSIFICADA);
  if (sem.length) {
    const vs = soma(sem.map((c) => c.valores));
    linhas.push({ nivel: 1, rotulo: `${NAO_CLASSIFICADA} (${sem.length}) — escolha o lugar em “Categorias do Omie no relatório”`, valores: vs, total: total(vs), alerta: true });
    for (const c of sem) linhas.push({ nivel: 3, rotulo: c.rotulo, dica: c.dica, valores: c.valores, total: total(c.valores), alerta: true });
  }
  return linhas;
}
