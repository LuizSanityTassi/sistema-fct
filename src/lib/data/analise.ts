import { listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { resumoUnidades, type Escopo } from "@/lib/data/dre";
import { GRUPOS_DESPESA_ORD, GRUPOS_RECEITA_ORD } from "@/lib/financeiro/dre";
import { createClient } from "@/lib/supabase/server";

export type LinhaUnidade = { branch_id: string; competencia: string; tipo: "receber" | "pagar"; grupo: string; total: number };

/** Linhas unidade × mês × grupo de categoria do ano, com o cadastro das unidades. */
export async function dadosAnalise(escopo: Escopo, ano: string) {
  const [linhas, unidades] = await Promise.all([resumoUnidades(escopo, `${ano}-01`, `${ano}-12`), listarUnidadesFinanceiro()]);
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const meses = [...new Set(linhas.map((l) => l.competencia))].sort();
  return { linhas: linhas as LinhaUnidade[], porId, meses };
}

export async function inadimplencia() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_inadimplencia").select("tipo, ano, mes, atrasado, recebido");
  if (error) throw error;
  return data.map((r) => ({ ...r, atrasado: r.atrasado === null ? null : Number(r.atrasado), recebido: r.recebido === null ? null : Number(r.recebido) }));
}

/** Ordem dos grupos de categoria: receitas, despesas conhecidas, depois o resto. */
export function ordenarGrupos(grupos: string[]) {
  const ordem = [...GRUPOS_RECEITA_ORD, ...GRUPOS_DESPESA_ORD];
  return [...new Set(grupos)].sort((a, b) => (ordem.indexOf(a) + 1 || 99) - (ordem.indexOf(b) + 1 || 99) || a.localeCompare(b, "pt-BR"));
}
