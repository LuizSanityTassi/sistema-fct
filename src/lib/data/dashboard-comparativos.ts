// Comparativos do início: o mês até hoje × o mesmo período do mês anterior (contagens e valores) ou a última
// competência com dados × a anterior (financeiro e folha). Tudo pelo RLS de quem vê; cada cartão só aparece para
// quem abre a tela dele, e um cartão que falhar não derruba o painel.
import type { Sessao } from "@/lib/auth/session";
import { situacaoSla } from "@/lib/chamados/sla";
import { podeAcessar } from "@/lib/nav";
import { horaNoBrasil, mesmoDia, metasDoMes, porPeriodo, serieVendas, ultimoDia, ultimoDiaVendas } from "@/lib/data/vendas";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { desdeOInicio, INICIO_OPERACAO } from "@/lib/operacao";
import { createClient } from "@/lib/supabase/server";

export type Comparativo = {
  id: string;
  titulo: string;
  href: string;
  atual: number;
  /** null = sem base para comparar (módulo começou neste mês, por exemplo). */
  anterior: number | null;
  formato: "numero" | "moeda" | "pct";
  /** Para que lado a variação é boa (define a cor). */
  melhor: "maior" | "menor" | "neutro";
  periodo: string;
  comparadoCom: string;
  nota?: string | null;
  /** Valor por dia do mês até hoje (minigráfico do cartão). */
  serie?: number[];
  /** Receitas e despesas dos últimos meses (gráfico do financeiro). */
  mensal?: { competencia: string; receber: number; pagar: number }[];
  /** Meta do mês, quando existe: quanto já foi feito e onde devia estar hoje (% do mês que passou). */
  meta?: { valor: number; pct: number; ritmo: number };
};

type Cliente = Awaited<ReturnType<typeof createClient>>;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Datas do comparativo, no fuso de Brasília. */
export function periodos(agora = new Date()) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const [a, m, d] = hoje.split("-").map(Number);
  const iso = (ano: number, mes: number, dia: number) => `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  const aAnt = m === 1 ? a - 1 : a;
  const mAnt = m === 1 ? 12 : m - 1;
  const ultimoDiaAnt = new Date(Date.UTC(aAnt, mAnt, 0)).getUTCDate();
  return {
    hoje,
    inicio: iso(a, m, 1),
    inicioAnt: iso(aAnt, mAnt, 1),
    fimAnt: iso(aAnt, mAnt, Math.min(d, ultimoDiaAnt)),
    competencia: `${a}-${String(m).padStart(2, "0")}`,
    rotulo: d === 1 ? `${MESES[m - 1]}/${String(a).slice(2)} (dia 1)` : `${MESES[m - 1]}/${String(a).slice(2)} até dia ${d}`,
    rotuloAnt: `${MESES[mAnt - 1]}/${String(aAnt).slice(2)} até dia ${Math.min(d, ultimoDiaAnt)}`,
  };
}
type Periodos = ReturnType<typeof periodos>;

/** Soma por dia, do dia 1 até hoje (dias sem nada entram com zero). */
function porDia(p: Periodos, itens: { dia: string; valor: number }[]) {
  const mapa = new Map<string, number>();
  for (const { dia, valor } of itens) mapa.set(dia, (mapa.get(dia) ?? 0) + valor);
  const dias = Number(p.hoje.slice(8, 10));
  return Array.from({ length: dias }, (_, i) => r2(mapa.get(`${p.inicio.slice(0, 8)}${String(i + 1).padStart(2, "0")}`) ?? 0));
}

/** Lê todas as páginas (o PostgREST devolve no máximo 1000 por vez). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, max = 20_000) {
  const out: T[] = [];
  for (let de = 0; de < max; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

const noAtual = (dia: string, p: Periodos) => dia >= p.inicio && dia <= p.hoje;
const noAnterior = (dia: string, p: Periodos) => dia >= p.inicioAnt && dia <= p.fimAnt;
const diaDe = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(ts));

async function quebrasDeCaixa(supabase: Cliente, p: Periodos, href: string): Promise<Comparativo[]> {
  const linhas = await todas<{ dia: string; valor_quebra: number; diferenca: number }>((de, ate) =>
    supabase.from("caixa_diferencas").select("dia, valor_quebra, diferenca").eq("classe", "quebra").gte("dia", desdeOInicio(p.inicioAnt)).lte("dia", p.hoje).order("dia").range(de, ate),
  );
  // a coleta começou em out/2026: antes do 1º dia coletado não há base para comparar
  const { data: primeira } = await supabase.from("caixa_coletas").select("dia").order("dia").limit(1).maybeSingle();
  const temBase = !!primeira && primeira.dia <= p.fimAnt && p.fimAnt >= INICIO_OPERACAO;
  const soma = (f: (d: string) => boolean) => linhas.filter((l) => f(l.dia));
  const atual = soma((d) => noAtual(d, p));
  const ant = soma((d) => noAnterior(d, p));
  const faltas = atual.filter((l) => Number(l.diferenca) > 0).length;
  return [
    {
      id: "caixa",
      titulo: "Quebras de caixa",
      href,
      atual: r2(atual.reduce((s, l) => s + Number(l.valor_quebra), 0)),
      anterior: temBase ? r2(ant.reduce((s, l) => s + Number(l.valor_quebra), 0)) : null,
      formato: "moeda",
      melhor: "menor",
      periodo: p.rotulo,
      comparadoCom: p.rotuloAnt,
      nota: `${atual.length} quebra(s): ${faltas} falta(s), ${atual.length - faltas} sobra(s)${temBase ? ` · antes ${ant.length}` : ""}`,
      serie: porDia(p, atual.map((l) => ({ dia: l.dia, valor: Number(l.valor_quebra) }))),
    },
  ];
}

/** Venda do mês até o último dia lido, os mesmos dias do mês anterior e a meta das filiais (mesma conta do painel de vendas). */
async function vendas(): Promise<Comparativo[]> {
  const ultimo = await ultimoDiaVendas();
  const ate = ultimo.dia;
  const inicio = `${ate.slice(0, 7)}-01`;
  const ateAnt = mesmoDia(ate, 1);
  const [dias, mesAnt, metas] = await Promise.all([serieVendas(inicio, ate, "dia"), serieVendas(mesmoDia(inicio, 1), ateAnt, "mes"), metasDoMes(inicio)]);
  const porDiaVenda = porPeriodo(dias);
  if (!porDiaVenda.size) return [];
  const atual = r2([...porDiaVenda.values()].reduce((s, d) => s + d.venda, 0));
  const anterior = [...porPeriodo(mesAnt).values()].reduce((s, d) => s + d.venda, 0);
  const metaTotal = [...metas].reduce((s, [chave, v]) => s + (chave.startsWith("filial:") ? v : 0), 0);
  const dia = Number(ate.slice(8, 10));
  const nomeMes = (d: string) => MESES[Number(d.slice(5, 7)) - 1];
  return [
    {
      id: "venda",
      titulo: "Venda do mês",
      href: "/vendas",
      atual,
      anterior: anterior > 0 ? r2(anterior) : null,
      formato: "moeda",
      melhor: "maior",
      periodo: `${nomeMes(ate)}/${ate.slice(2, 4)} até dia ${dia}`,
      comparadoCom: `${nomeMes(ateAnt)}/${ateAnt.slice(2, 4)} até dia ${Number(ateAnt.slice(8, 10))}`,
      nota: ultimo.parcial && ultimo.lidoEm ? `hoje parcial, lido às ${horaNoBrasil(ultimo.lidoEm)}` : null,
      serie: Array.from({ length: dia }, (_, i) => r2(porDiaVenda.get(`${inicio.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)?.venda ?? 0)),
      meta: metaTotal > 0 ? { valor: metaTotal, pct: (atual / metaTotal) * 100, ritmo: (dia / ultimoDia(Number(ate.slice(0, 4)), Number(ate.slice(5, 7)))) * 100 } : undefined,
    },
  ];
}

async function chamados(supabase: Cliente, p: Periodos): Promise<Comparativo[]> {
  const linhas = await todas<{ created_at: string; resolved_at: string | null; prioridade: "baixa" | "normal" | "alta" | "critica"; status: string; primeira_resposta_em: string | null }>((de, ate) =>
    supabase.from("tickets").select("created_at, resolved_at, prioridade, status, primeira_resposta_em").gte("created_at", `${p.inicioAnt}T00:00:00-03:00`).order("created_at").range(de, ate),
  );
  const abertosAtual = linhas.filter((t) => noAtual(diaDe(t.created_at), p));
  const abertosAnt = linhas.filter((t) => noAnterior(diaDe(t.created_at), p));
  const resolvidos = linhas.filter((t) => t.resolved_at && noAtual(diaDe(t.resolved_at), p)).length;
  const pctSla = (l: typeof linhas) => {
    const avaliados = l.map((t) => situacaoSla(t as Parameters<typeof situacaoSla>[0]).estado).filter((e) => e !== "no_prazo" && e !== "perto" && e !== "encerrado");
    return avaliados.length ? (100 * avaliados.filter((e) => e === "respondido").length) / avaliados.length : null;
  };
  const slaAtual = pctSla(abertosAtual);
  const slaAnt = pctSla(abertosAnt);
  const cards: Comparativo[] = [
    {
      id: "chamados",
      titulo: "Chamados abertos",
      href: "/chamados/indicadores",
      atual: abertosAtual.length,
      anterior: abertosAnt.length,
      formato: "numero",
      melhor: "menor",
      periodo: p.rotulo,
      comparadoCom: p.rotuloAnt,
      nota: `${resolvidos} resolvido(s) no mês`,
      serie: porDia(p, abertosAtual.map((t) => ({ dia: diaDe(t.created_at), valor: 1 }))),
    },
  ];
  if (slaAtual !== null)
    cards.push({
      id: "sla",
      titulo: "1ª resposta no prazo",
      href: "/chamados/indicadores",
      atual: r2(slaAtual),
      anterior: slaAnt === null ? null : r2(slaAnt),
      formato: "pct",
      melhor: "maior",
      periodo: p.rotulo,
      comparadoCom: p.rotuloAnt,
    });
  return cards;
}

async function conciliacao(supabase: Cliente, p: Periodos): Promise<Comparativo[]> {
  const [{ data: concs }, novasPorDia, { count: abertas }, { data: primeira }] = await Promise.all([
    // só as rodadas do robô (criado_por nulo): as feitas à mão cobrem outros períodos e arquivos e distorciam o cartão
    supabase.from("conc_conciliacoes").select("pct_bateu, qtd_trier, criado_em, fil_min, fil_max").is("criado_por", null).order("criado_em", { ascending: false }).limit(40),
    supabase.rpc("conc_pendencias_novas", { p_de: `${desdeOInicio(p.inicioAnt)}T00:00:00-03:00` }),
    supabase.from("conc_pendencias").select("chave", { count: "exact", head: true }).in("status", ["pendente", "em_analise"]).gte("vencimento", INICIO_OPERACAO),
    supabase.from("conc_conciliacoes").select("criado_em").order("criado_em").limit(1).maybeSingle(),
  ]);
  if (novasPorDia.error) throw new Error(novasPorDia.error.message);
  const novas = (novasPorDia.data ?? []).map((l) => ({ dia: l.dia, valor: Number(l.qtd) }));
  const novasEm = (noPeriodo: (dia: string) => boolean) => novas.filter((x) => noPeriodo(x.dia));
  const somaNovas = (linhas: typeof novas) => linhas.reduce((s, x) => s + x.valor, 0);
  // sem conciliação antes do fim do período anterior não há base (o módulo começou depois)
  const temBase = !!primeira && diaDe(primeira.criado_em) <= p.fimAnt && p.fimAnt >= INICIO_OPERACAO;
  const cards: Comparativo[] = [];
  // o robô concilia por faixa (Varela 1–112, Itajaí 201–205, Nazário 301–504): a rede é a última de cada faixa,
  // pesada pelos títulos do Trier (pegar só a última por empresa deixava a Varela com o número de Itajaí)
  const lista = concs ?? [];
  const porFaixa = new Map<string, typeof lista>();
  for (const c of lista) {
    const k = `${c.fil_min}-${c.fil_max}`;
    porFaixa.set(k, [...(porFaixa.get(k) ?? []), c]);
  }
  const faixas = [...porFaixa.values()];
  const empresas = [
    { nome: "Varela", faixas: faixas.filter((runs) => runs[0].fil_min < 301) },
    { nome: "Nazário", faixas: faixas.filter((runs) => runs[0].fil_min >= 301) },
  ].filter((e) => e.faixas.length);
  const pesada = (xs: { pct_bateu: number | null; qtd_trier: number }[]) => {
    const titulos = xs.reduce((s, x) => s + x.qtd_trier, 0);
    return titulos ? (100 * xs.reduce((s, x) => s + Number(x.pct_bateu) * x.qtd_trier, 0)) / titulos : 0;
  };
  if (empresas.length) {
    const dataBr = (ts: string) => diaDe(ts).slice(5).split("-").reverse().join("/");
    const ultimaData = (runs: typeof faixas) => runs.map((r) => r[0].criado_em).sort().at(-1) ?? "";
    cards.push({
      id: "conc-auto",
      titulo: "Conciliação automática",
      href: "/conciliacao",
      atual: r2(pesada(faixas.map((runs) => runs[0]))),
      anterior: faixas.some((runs) => runs[1]) ? r2(pesada(faixas.map((runs) => runs[1] ?? runs[0]))) : null,
      formato: "pct",
      melhor: "maior",
      periodo: "última de cada faixa",
      comparadoCom: "as conciliações anteriores",
      nota: empresas
        .map((e) => `${e.nome} ${pesada(e.faixas.map((runs) => runs[0])).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% (${dataBr(ultimaData(e.faixas))})`)
        .join(" · "),
    });
  }
  cards.push({
    id: "conc-pend",
    titulo: "Pendências novas na conciliação",
    href: "/conciliacao/pendencias",
    atual: somaNovas(novasEm((d) => noAtual(d, p))),
    anterior: temBase ? somaNovas(novasEm((d) => noAnterior(d, p))) : null,
    formato: "numero",
    melhor: "menor",
    periodo: p.rotulo,
    comparadoCom: p.rotuloAnt,
    nota: `${abertas ?? 0} em aberto agora`,
    serie: porDia(p, novasEm((d) => noAtual(d, p))),
  });
  return cards;
}

async function financeiro(supabase: Cliente): Promise<Comparativo[]> {
  const desde = new Date();
  desde.setMonth(desde.getMonth() - 6);
  const linhas = await todas<{ competencia: string | null; tipo: "receber" | "pagar" | null; total: number | null }>((de, ate) =>
    supabase
      .from("fin_resumo_mensal")
      .select("competencia, tipo, total")
      .gte("competencia", `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}`)
      .range(de, ate),
  );
  const porMes = new Map<string, { receber: number; pagar: number }>();
  for (const l of linhas) {
    if (!l.competencia || !l.tipo) continue;
    const c = l.competencia.trim();
    const m = porMes.get(c) ?? { receber: 0, pagar: 0 };
    m[l.tipo] += Number(l.total);
    porMes.set(c, m);
  }
  const meses = [...porMes.keys()].sort().reverse();
  if (!meses.length) return [];
  const [ult, ant] = meses;
  const u = porMes.get(ult)!;
  const a = ant ? porMes.get(ant)! : null;
  return [
    {
      id: "resultado",
      titulo: "Resultado do mês",
      href: "/financeiro",
      atual: r2(u.receber - u.pagar),
      anterior: a ? r2(a.receber - a.pagar) : null,
      formato: "moeda",
      melhor: "maior",
      periodo: `${rotuloCompetencia(ult)} (último mês lançado)`,
      comparadoCom: ant ? rotuloCompetencia(ant) : "",
      nota: `receitas ${u.receber.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} · despesas ${u.pagar.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`,
      serie: [...meses].reverse().map((c) => r2(porMes.get(c)!.receber - porMes.get(c)!.pagar)),
      mensal: [...meses].reverse().map((c) => ({ competencia: c, receber: r2(porMes.get(c)!.receber), pagar: r2(porMes.get(c)!.pagar) })),
    },
  ];
}

async function folha(supabase: Cliente, p: Periodos): Promise<Comparativo[]> {
  const comps = [p.competencia, p.inicioAnt.slice(0, 7)];
  const linhas = await todas<{ competencia: string; valor_liquido: number }>((de, ate) =>
    supabase.from("payroll_records").select("competencia, valor_liquido").in("competencia", comps).range(de, ate),
  );
  const soma = (c: string) => linhas.filter((l) => l.competencia === c);
  const atual = soma(comps[0]);
  if (!atual.length) return [];
  const ant = soma(comps[1]);
  return [
    {
      id: "folha",
      titulo: "Folha líquida",
      href: `/rh/folha?competencia=${comps[0]}`,
      atual: r2(atual.reduce((s, l) => s + Number(l.valor_liquido), 0)),
      anterior: ant.length ? r2(ant.reduce((s, l) => s + Number(l.valor_liquido), 0)) : null,
      formato: "moeda",
      melhor: "neutro",
      periodo: rotuloCompetencia(comps[0]),
      comparadoCom: rotuloCompetencia(comps[1]),
      nota: `${atual.length} registro(s)`,
    },
  ];
}

async function pessoal(supabase: Cliente, p: Periodos): Promise<Comparativo[]> {
  const [adm, desl] = await Promise.all([
    todas<{ data_admissao: string | null }>((de, ate) => supabase.from("employees").select("data_admissao").gte("data_admissao", p.inicioAnt).lte("data_admissao", p.hoje).range(de, ate)),
    todas<{ data_desligamento: string | null }>((de, ate) =>
      supabase.from("employees").select("data_desligamento").gte("data_desligamento", p.inicioAnt).lte("data_desligamento", p.hoje).range(de, ate),
    ),
  ]);
  const dAtual = desl.filter((x) => x.data_desligamento && noAtual(x.data_desligamento, p)).length;
  const dAnt = desl.filter((x) => x.data_desligamento && noAnterior(x.data_desligamento, p)).length;
  return [
    {
      id: "admissoes",
      titulo: "Admissões",
      href: "/rh/funcionarios",
      atual: adm.filter((x) => x.data_admissao && noAtual(x.data_admissao, p)).length,
      anterior: adm.filter((x) => x.data_admissao && noAnterior(x.data_admissao, p)).length,
      formato: "numero",
      melhor: "neutro",
      periodo: p.rotulo,
      comparadoCom: p.rotuloAnt,
      nota: `${dAtual} desligamento(s) · antes ${dAnt}`,
    },
  ];
}

const ORDEM_CARTOES = ["venda", "caixa", "conc-auto", "resultado", "conc-pend", "chamados", "sla", "folha", "admissoes"];

export async function carregarComparativos(sessao: Sessao): Promise<Comparativo[]> {
  const supabase = await createClient();
  const p = periodos();
  const pode = (rota: string) => podeAcessar(sessao.papel, rota, sessao.telasExtras, sessao.bloqueios);
  const fontes: Promise<Comparativo[]>[] = [];
  if (pode("/vendas")) fontes.push(vendas());
  if (pode("/financeiro/diferenca-caixa")) fontes.push(quebrasDeCaixa(supabase, p, "/financeiro/diferenca-caixa"));
  else if (sessao.papel === "gerente" || sessao.papel === "coordenador") fontes.push(quebrasDeCaixa(supabase, p, "/caixa"));
  if (pode("/conciliacao")) fontes.push(conciliacao(supabase, p));
  if (pode("/financeiro")) fontes.push(financeiro(supabase));
  if (pode("/rh/folha")) fontes.push(folha(supabase, p));
  if (pode("/rh/funcionarios")) fontes.push(pessoal(supabase, p));
  if (pode("/chamados")) fontes.push(chamados(supabase, p));
  const resultados = await Promise.allSettled(fontes);
  const cards = resultados.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.error("[dashboard] comparativo:", r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });
  // o que mais pesa para quem decide vem primeiro
  const posicao = (id: string) => ORDEM_CARTOES.indexOf(id) + 1 || ORDEM_CARTOES.length + 1;
  return cards.sort((a, b) => posicao(a.id) - posicao(b.id));
}
