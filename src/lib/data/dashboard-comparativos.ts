// Comparativos do início: o mês até hoje × o mesmo período do mês anterior (contagens e valores) ou a última
// competência com dados × a anterior (financeiro e folha). Tudo pelo RLS de quem vê; cada cartão só aparece para
// quem abre a tela dele, e um cartão que falhar não derruba o painel.
import type { Sessao } from "@/lib/auth/session";
import { situacaoSla } from "@/lib/chamados/sla";
import { podeAcessar } from "@/lib/nav";
import { rotuloCompetencia } from "@/lib/rh/competencia";
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
    supabase.from("caixa_diferencas").select("dia, valor_quebra, diferenca").eq("classe", "quebra").gte("dia", p.inicioAnt).lte("dia", p.hoje).order("dia").range(de, ate),
  );
  // a coleta começou em out/2026: antes do 1º dia coletado não há base para comparar
  const { data: primeira } = await supabase.from("caixa_coletas").select("dia").order("dia").limit(1).maybeSingle();
  const temBase = !!primeira && primeira.dia <= p.fimAnt;
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
  const [{ data: concs }, novas, { count: abertas }, { data: primeira }] = await Promise.all([
    supabase.from("conc_conciliacoes").select("pct_bateu, criado_em, fil_min, fil_max").order("criado_em", { ascending: false }).limit(2),
    todas<{ criado_em: string }>((de, ate) => supabase.from("conc_pendencias").select("criado_em").gte("criado_em", `${p.inicioAnt}T00:00:00-03:00`).order("criado_em").range(de, ate)),
    supabase.from("conc_pendencias").select("chave", { count: "exact", head: true }).in("status", ["pendente", "em_analise"]),
    supabase.from("conc_conciliacoes").select("criado_em").order("criado_em").limit(1).maybeSingle(),
  ]);
  // sem conciliação antes do fim do período anterior não há base (o módulo começou depois)
  const temBase = !!primeira && diaDe(primeira.criado_em) <= p.fimAnt;
  const cards: Comparativo[] = [];
  const [ult, ant] = concs ?? [];
  if (ult)
    cards.push({
      id: "conc-auto",
      titulo: "Conciliação automática",
      href: "/conciliacao",
      atual: r2(Number(ult.pct_bateu) * 100),
      anterior: ant ? r2(Number(ant.pct_bateu) * 100) : null,
      formato: "pct",
      melhor: "maior",
      periodo: `última (${diaDe(ult.criado_em).split("-").reverse().join("/")}, filiais ${ult.fil_min}–${ult.fil_max})`,
      comparadoCom: "a conciliação anterior",
      nota: "títulos do Trier que bateram com o banco",
    });
  cards.push({
    id: "conc-pend",
    titulo: "Pendências novas na conciliação",
    href: "/conciliacao/pendencias",
    atual: novas.filter((x) => noAtual(diaDe(x.criado_em), p)).length,
    anterior: temBase ? novas.filter((x) => noAnterior(diaDe(x.criado_em), p)).length : null,
    formato: "numero",
    melhor: "menor",
    periodo: p.rotulo,
    comparadoCom: p.rotuloAnt,
    nota: `${abertas ?? 0} em aberto agora`,
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

export async function carregarComparativos(sessao: Sessao): Promise<Comparativo[]> {
  const supabase = await createClient();
  const p = periodos();
  const pode = (rota: string) => podeAcessar(sessao.papel, rota);
  const fontes: Promise<Comparativo[]>[] = [];
  if (pode("/financeiro/diferenca-caixa")) fontes.push(quebrasDeCaixa(supabase, p, "/financeiro/diferenca-caixa"));
  else if (sessao.papel === "gerente" || sessao.papel === "coordenador") fontes.push(quebrasDeCaixa(supabase, p, "/caixa"));
  if (pode("/conciliacao")) fontes.push(conciliacao(supabase, p));
  if (pode("/financeiro")) fontes.push(financeiro(supabase));
  if (pode("/rh/folha")) fontes.push(folha(supabase, p));
  if (pode("/rh/funcionarios")) fontes.push(pessoal(supabase, p));
  if (pode("/chamados")) fontes.push(chamados(supabase, p));
  const resultados = await Promise.allSettled(fontes);
  return resultados.flatMap((r) => {
    if (r.status === "fulfilled") return r.value;
    console.error("[dashboard] comparativo:", r.reason instanceof Error ? r.reason.message : r.reason);
    return [];
  });
}
