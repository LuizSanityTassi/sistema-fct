import { listarCategorias } from "@/lib/data/financeiro";
import { rpcPaginado, unidadesDoEscopo, type Escopo } from "@/lib/data/dre";
import { familiaFinanceira, ordemFamiliaFin } from "@/lib/financeiro/dre";
import type { FinTipo } from "@/lib/financeiro/rotulos";
import { createClient } from "@/lib/supabase/server";

export type LinhaOrcamento = {
  id: string;
  nome: string;
  grupo: string;
  familia: string;
  porMes: Record<string, { realizado: number; orcado: number | null; realizadoInformado: number | null }>;
};

/** Categorias de despesa com orçado ou realizado no ano, agrupadas por família financeira. */
export async function dadosOrcamento(escopo: Escopo, ano: string) {
  const supabase = await createClient();
  const branches = await unidadesDoEscopo(escopo);
  const vazio = branches !== undefined && branches.length === 0;
  const [categorias, realizado, { data: orcados, error }] = await Promise.all([
    listarCategorias(),
    vazio ? Promise.resolve([]) : rpcPaginado((a, b) => supabase.rpc("fin_dre", { p_de: `${ano}-01`, p_ate: `${ano}-12`, p_branches: branches }).range(a, b)),
    supabase.from("fin_orcamentos").select("categoria_id, competencia, valor, realizado_informado").eq("grupo", escopo.grupo).gte("competencia", `${ano}-01`).lte("competencia", `${ano}-12`),
  ]);
  if (error) throw error;
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const linhas = new Map<string, LinhaOrcamento>();
  const garantir = (id: string) => {
    let l = linhas.get(id);
    if (!l) {
      const c = porId.get(id);
      if (!c) return null;
      const fam = familiaFinanceira({ tipo: c.tipo as FinTipo, nome: c.nome, grupo: c.grupo, fin_familia: c.fin_familia, fin_grupo: c.fin_grupo });
      l = { id, nome: c.nome, grupo: c.grupo, familia: fam.familia, porMes: {} };
      linhas.set(id, l);
    }
    return l;
  };
  const celula = (l: LinhaOrcamento, m: string) => (l.porMes[m] ??= { realizado: 0, orcado: null, realizadoInformado: null });
  for (const r of realizado) {
    if (r.tipo !== "pagar") continue;
    const l = garantir(r.categoria_id);
    if (l) celula(l, r.competencia.trim()).realizado += Number(r.total);
  }
  for (const o of orcados ?? []) {
    const l = garantir(o.categoria_id);
    if (!l) continue;
    const c = celula(l, o.competencia.trim());
    c.orcado = o.valor === null ? null : Number(o.valor);
    c.realizadoInformado = o.realizado_informado === null ? null : Number(o.realizado_informado);
  }
  const meses = [...new Set([...linhas.values()].flatMap((l) => Object.keys(l.porMes)))].sort();
  const lista = [...linhas.values()].sort((a, b) => ordemFamiliaFin(a.familia, b.familia) || a.nome.localeCompare(b.nome, "pt-BR"));
  return { linhas: lista, meses };
}

export const realizadoEfetivo = (c: { realizado: number; realizadoInformado: number | null } | undefined) => (c ? (c.realizadoInformado ?? c.realizado) : 0);
