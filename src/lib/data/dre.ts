import { cache } from "react";
import { ehUuid } from "@/lib/data/filiais";
import { listarCategorias, listarCompetenciasFinanceiro, listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { montarDre, type CategoriaDre, type Dre, type EstruturaDre } from "@/lib/financeiro/dre";
import { ehGrupoFinanceiro, GRUPOS_FINANCEIROS, type FinTipo } from "@/lib/financeiro/rotulos";
import { createClient } from "@/lib/supabase/server";

export const GRUPOS_ESCOPO = ["TODOS", "VARELA", "ITAJAÍ", "NAZÁRIO", "BLUMENAU"] as const;
export type Escopo = { grupo: string; filial?: string; grupos?: readonly string[] };

export function lerEscopo(sp: Record<string, string | string[] | undefined>): Escopo & { ano: string; de?: string } {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const grupo = s("grupo");
  const ano = /^\d{4}$/.test(s("ano")) ? s("ano") : String(new Date().getFullYear());
  const de = /^\d{4}-\d{2}$/.test(s("de")) ? s("de") : undefined;
  return { grupo: ehGrupoFinanceiro(grupo) ? grupo : "TODOS", filial: ehUuid(s("filial")) ? s("filial") : undefined, ano, de };
}

/** Unidades do recorte (undefined = todas). */
export async function unidadesDoEscopo(e: Escopo) {
  if (e.filial) return [e.filial];
  if (e.grupos) {
    const unidades = await listarUnidadesFinanceiro();
    return unidades.filter((u) => e.grupos!.includes(u.grupo)).map((u) => u.id);
  }
  if (e.grupo === "TODOS") return undefined;
  const unidades = await listarUnidadesFinanceiro();
  return unidades.filter((u) => u.grupo === e.grupo).map((u) => u.id);
}

/** Chama uma função SQL que devolve muitas linhas, paginando (PostgREST corta em 1000). */
export async function rpcPaginado<T>(consulta: (inicio: number, fim: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const linhas: T[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await consulta(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return linhas;
}

export const estruturaDre = cache(async (): Promise<EstruturaDre[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_dre_estrutura").select("*").order("ordem_familia").order("ordem_grupo");
  if (error) throw error;
  return data;
});

/** Anos com movimento (do mais recente). */
export async function anosFinanceiro() {
  const comps = await listarCompetenciasFinanceiro();
  const anos = [...new Set(comps.map((c) => c.slice(0, 4)))];
  const atual = String(new Date().getFullYear());
  if (!anos.includes(atual)) anos.push(atual);
  return anos.sort().reverse();
}

type LinhaAjusteDre = { grupo: string; branch_id: string | null; categoria_id: string; competencia: string; valor: number; atualizado_em: string };
type LinhaSaldoDre = { grupo: string; branch_id: string | null; campo: string; competencia: string; valor: number; atualizado_em: string };
/** Nós do caixa contábil: todas → grupos → filiais. */
type NoDre = { tipo: "filial"; branch: string } | { tipo: "grupo"; grupo: string } | { tipo: "todos"; branches?: string[] };
type ResultadoNoDre = { dre: Dre; delta: Map<string, number>; saldosMes: Map<string, number> };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Uma linha por chave, a mais recente (a mesma filial pode ter sido ajustada vista de grupos diferentes). */
function maisRecente<T extends { atualizado_em: string }>(linhas: T[], chave: (l: T) => string) {
  const porChave = new Map<string, T>();
  for (const l of linhas) {
    const k = chave(l);
    const atual = porChave.get(k);
    if (!atual || l.atualizado_em > atual.atualizado_em) porChave.set(k, l);
  }
  return [...porChave.values()];
}

/** Valor de uma série em degrau no mês (o do último mês com valor até ele). */
function noDegrau(serie: Record<string, number>, m: string) {
  let v = 0;
  for (const k of Object.keys(serie).sort()) {
    if (k > m) break;
    v = serie[k];
  }
  return v;
}

/**
 * Caixa contábil do recorte. O que se ajusta numa filial (célula categoria × mês, saldos) também vale no total do grupo
 * e no de todas: o total soma as filiais com os ajustes delas, e um ajuste digitado no próprio total tem prioridade
 * sobre essa soma. Mesma coisa dos grupos para "todas".
 */
export async function dreDoPeriodo(e: Escopo, ano: string, de?: string): Promise<Dre & { ajustesProprios: Record<string, number> }> {
  const supabase = await createClient();
  const periodo = { de: `${ano}-01`, ate: `${ano}-12` };
  const [branchesEscopo, unidades, categorias, estrutura, ajustes, saldos] = await Promise.all([
    unidadesDoEscopo(e),
    listarUnidadesFinanceiro(),
    listarCategorias(),
    estruturaDre(),
    rpcPaginado<LinhaAjusteDre>((a, b) =>
      supabase.from("fin_dre_ajustes").select("grupo, branch_id, categoria_id, competencia, valor, atualizado_em").gte("competencia", periodo.de).lte("competencia", periodo.ate).order("id").range(a, b),
    ),
    rpcPaginado<LinhaSaldoDre>((a, b) =>
      supabase.from("fin_dre_saldos").select("grupo, branch_id, campo, competencia, valor, atualizado_em").gte("competencia", periodo.de).lte("competencia", periodo.ate).order("id").range(a, b),
    ),
  ]);
  const cats: CategoriaDre[] = categorias.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, tipo: c.tipo as FinTipo, dre_familia: c.dre_familia, dre_grupo: c.dre_grupo, dre_sinal: c.dre_sinal }));
  const vazio = () => ({ ...montarDre({ categorias: [], estrutura, valores: new Map(), ajustes: new Map(), saldos: new Map(), mesesComDados: [] }), ajustesProprios: {} });
  if (branchesEscopo && branchesEscopo.length === 0) return vazio();

  const comp = (c: string) => c.trim();
  const ajFilial = maisRecente(ajustes.filter((l) => l.branch_id), (l) => `${l.branch_id}|${l.categoria_id}|${comp(l.competencia)}`);
  const ajTotal = ajustes.filter((l) => !l.branch_id);
  const salFilial = maisRecente(saldos.filter((l) => l.branch_id), (l) => `${l.branch_id}|${l.campo}|${comp(l.competencia)}`);
  const salTotal = saldos.filter((l) => !l.branch_id);
  const daFilial = (b: string) => ajFilial.some((l) => l.branch_id === b) || salFilial.some((l) => l.branch_id === b);
  const doGrupo = (g: string) => unidades.filter((u) => u.grupo === g).map((u) => u.id);
  const temNoGrupo = (g: string) => ajTotal.some((l) => l.grupo === g) || salTotal.some((l) => l.grupo === g) || doGrupo(g).some(daFilial);

  const calcular = async (no: NoDre): Promise<ResultadoNoDre> => {
    const branches = no.tipo === "filial" ? [no.branch] : no.tipo === "grupo" ? doGrupo(no.grupo) : no.branches;
    const filhos: NoDre[] =
      no.tipo === "filial"
        ? []
        : no.tipo === "grupo"
          ? doGrupo(no.grupo)
              .filter(daFilial)
              .map((b) => ({ tipo: "filial", branch: b }))
          : [
              ...GRUPOS_FINANCEIROS.filter((g) => (!e.grupos || e.grupos.includes(g)) && temNoGrupo(g)).map((g): NoDre => ({ tipo: "grupo", grupo: g })),
              ...unidades.filter((u) => !ehGrupoFinanceiro(u.grupo) && (!no.branches || no.branches.includes(u.id)) && daFilial(u.id)).map((u): NoDre => ({ tipo: "filial", branch: u.id })),
            ];
    const [valores, deBaixo] = await Promise.all([
      branches && branches.length === 0 ? Promise.resolve([]) : rpcPaginado((a, b) => supabase.rpc("fin_dre", { p_de: periodo.de, p_ate: periodo.ate, p_branches: branches }).range(a, b)),
      Promise.all(filhos.map(calcular)),
    ]);

    // automático = lançamentos + o que as filiais/grupos de baixo ajustaram
    const bruto = new Map<string, number>();
    const mesesComDados = new Set<string>();
    for (const v of valores) {
      const k = `${v.categoria_id}|${comp(v.competencia)}`;
      mesesComDados.add(comp(v.competencia));
      bruto.set(k, (bruto.get(k) ?? 0) + Number(v.total));
    }
    const automatico = new Map(bruto);
    for (const f of deBaixo)
      for (const [k, d] of f.delta) {
        automatico.set(k, r2((automatico.get(k) ?? 0) + d));
        mesesComDados.add(k.split("|")[1]);
      }

    const grupoTotal = no.tipo === "grupo" ? no.grupo : "TODOS";
    const ajProprios = no.tipo === "filial" ? ajFilial.filter((l) => l.branch_id === no.branch) : ajTotal.filter((l) => l.grupo === grupoTotal);
    const ajustesNo = new Map(ajProprios.map((l) => [`${l.categoria_id}|${comp(l.competencia)}`, Number(l.valor)]));
    const delta = new Map<string, number>();
    for (const k of new Set([...automatico.keys(), ...ajustesNo.keys()])) {
      const d = r2((ajustesNo.get(k) ?? automatico.get(k) ?? 0) - (bruto.get(k) ?? 0));
      if (d) delta.set(k, d);
    }

    // saldos: os digitados aqui; caixinha/contas/limites sem valor aqui = soma dos de baixo; saldo inicial de baixo entra como correção
    const salProprios = no.tipo === "filial" ? salFilial.filter((l) => l.branch_id === no.branch) : salTotal.filter((l) => l.grupo === grupoTotal);
    const saldosProprios = new Map(salProprios.map((l) => [`${l.campo}|${comp(l.competencia)}`, Number(l.valor)]));
    const saldosNo = new Map(saldosProprios);
    const somaDeBaixo = new Map<string, number>();
    for (const f of deBaixo) for (const [k, v] of f.saldosMes) somaDeBaixo.set(k, r2((somaDeBaixo.get(k) ?? 0) + v));
    for (const [k, v] of somaDeBaixo) if (!saldosNo.has(k)) saldosNo.set(k, v);
    const meses = [...new Set([...mesesComDados, ...[...ajustesNo.keys()].map((k) => k.split("|")[1])])].sort();
    const correcoes = new Map(meses.map((m) => [m, r2(deBaixo.reduce((s, f) => s + noDegrau(f.dre.correcao, m), 0))]));

    const dre = montarDre({
      categorias: cats,
      estrutura,
      valores: automatico,
      ajustes: ajustesNo,
      saldos: saldosNo,
      saldosProprios,
      mesesComDados: [...mesesComDados],
      de,
      correcoes,
      eventos: deBaixo.flatMap((f) => f.dre.eventos),
    });
    return { dre, delta, saldosMes: new Map([...saldosNo].filter(([k]) => !k.startsWith("saldo_inicial|"))) };
  };

  const topo: NoDre = e.filial ? { tipo: "filial", branch: e.filial } : e.grupo === "TODOS" || e.grupos ? { tipo: "todos", branches: branchesEscopo } : { tipo: "grupo", grupo: e.grupo };
  const { dre } = await calcular(topo);
  const proprios = e.filial ? ajFilial.filter((l) => l.branch_id === e.filial) : ajTotal.filter((l) => l.grupo === (topo.tipo === "grupo" ? topo.grupo : "TODOS"));
  return { ...dre, ajustesProprios: Object.fromEntries(proprios.map((l) => [`${l.categoria_id}|${comp(l.competencia)}`, Number(l.valor)])) };
}

/** Resumo por unidade × mês × grupo de categoria (para ranking, resumo por loja e comparativo). */
export async function resumoUnidades(e: Escopo, de: string, ate: string) {
  const supabase = await createClient();
  const branches = await unidadesDoEscopo(e);
  if (branches && branches.length === 0) return [];
  const linhas = await rpcPaginado((a, b) => supabase.rpc("fin_resumo_unidades", { p_de: de, p_ate: ate, p_branches: branches }).range(a, b));
  return linhas.map((l) => ({ ...l, competencia: l.competencia.trim(), total: Number(l.total) }));
}

/** Movimento dia a dia (fluxo semanal) de um mês. */
export async function movimentoDiario(e: Escopo, competencia: string) {
  const supabase = await createClient();
  const branches = await unidadesDoEscopo(e);
  if (branches && branches.length === 0) return [];
  const [ano, mes] = competencia.split("-").map(Number);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const linhas = await rpcPaginado((a, b) => supabase.rpc("fin_diario", { p_de: `${competencia}-01`, p_ate: `${competencia}-${String(ultimo).padStart(2, "0")}`, p_branches: branches }).range(a, b));
  return linhas.map((l) => ({ ...l, total: Number(l.total) }));
}
