import { cache } from "react";
import { ehUuid } from "@/lib/data/filiais";
import { listarCategorias, listarCompetenciasFinanceiro, listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { montarDre, type CategoriaDre, type EstruturaDre } from "@/lib/financeiro/dre";
import { ehGrupoFinanceiro, type FinTipo } from "@/lib/financeiro/rotulos";
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

export async function dreDoPeriodo(e: Escopo, ano: string, de?: string) {
  const supabase = await createClient();
  const branches = await unidadesDoEscopo(e);
  const [categorias, estrutura, valores, { data: ajustes, error: eAj }, { data: saldos, error: eSal }] = await Promise.all([
    listarCategorias(),
    estruturaDre(),
    rpcPaginado((a, b) => supabase.rpc("fin_dre", { p_de: `${ano}-01`, p_ate: `${ano}-12`, p_branches: branches }).range(a, b)),
    supabase.from("fin_dre_ajustes").select("categoria_id, competencia, valor").eq("grupo", e.grupo).filter("branch_id", e.filial ? "eq" : "is", e.filial ?? null).gte("competencia", `${ano}-01`).lte("competencia", `${ano}-12`),
    supabase.from("fin_dre_saldos").select("campo, competencia, valor").eq("grupo", e.grupo).filter("branch_id", e.filial ? "eq" : "is", e.filial ?? null).gte("competencia", `${ano}-01`).lte("competencia", `${ano}-12`),
  ]);
  if (eAj) throw eAj;
  if (eSal) throw eSal;
  if (branches && branches.length === 0) return montarDre({ categorias: [], estrutura, valores: new Map(), ajustes: new Map(), saldos: new Map(), mesesComDados: [] });

  const mapaValores = new Map<string, number>();
  const mesesComDados = new Set<string>();
  for (const v of valores) {
    const comp = v.competencia.trim();
    mesesComDados.add(comp);
    mapaValores.set(`${v.categoria_id}|${comp}`, (mapaValores.get(`${v.categoria_id}|${comp}`) ?? 0) + Number(v.total));
  }
  const cats: CategoriaDre[] = categorias.map((c) => ({ id: c.id, nome: c.nome, grupo: c.grupo, tipo: c.tipo as FinTipo, dre_familia: c.dre_familia, dre_grupo: c.dre_grupo, dre_sinal: c.dre_sinal }));
  return montarDre({
    categorias: cats,
    estrutura,
    valores: mapaValores,
    ajustes: new Map((ajustes ?? []).map((a) => [`${a.categoria_id}|${a.competencia.trim()}`, Number(a.valor)])),
    saldos: new Map((saldos ?? []).map((s) => [`${s.campo}|${s.competencia.trim()}`, Number(s.valor)])),
    mesesComDados: [...mesesComDados],
    de,
  });
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
