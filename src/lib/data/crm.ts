// CRM (índice de fidelização do Bunker) por loja e por vendedor, somado no período. A regra de leitura da tabela vale
// (admin, financeiro, coordenador; gerente só a filial dele).
import { createClient } from "@/lib/supabase/server";

export type LinhaCrmVendedor = {
  filial: string;
  branchId: string | null;
  vendedorCodigo: string | null;
  vendedorNome: string;
  vendas: number;
  avulsas: number;
  fidelizadas: number;
  valorVendas: number;
  valorFidelizado: number;
  funcionario: number;
  inativo: number;
};

export type LinhaCrmLoja = Omit<LinhaCrmVendedor, "vendedorCodigo" | "vendedorNome"> & { nome: string; regional: string | null; vendedores: number };

/** Índice de fidelização (%): vendas fidelizadas ÷ vendas. */
export const indiceCrm = (l: { vendas: number; fidelizadas: number }) => (l.vendas > 0 ? (l.fidelizadas / l.vendas) * 100 : null);
/** Parte do faturamento que foi para cliente identificado (%). */
export const pctFaturamentoCrm = (l: { valorVendas: number; valorFidelizado: number }) => (l.valorVendas > 0 ? (l.valorFidelizado / l.valorVendas) * 100 : null);

const SOMAR = ["vendas", "avulsas", "fidelizadas", "valorVendas", "valorFidelizado", "funcionario", "inativo"] as const;

export function somarCrm<T extends Pick<LinhaCrmVendedor, (typeof SOMAR)[number]>>(linhas: T[]) {
  const t = { vendas: 0, avulsas: 0, fidelizadas: 0, valorVendas: 0, valorFidelizado: 0, funcionario: 0, inativo: 0 };
  for (const l of linhas) for (const k of SOMAR) t[k] += l[k];
  t.valorVendas = Math.round(t.valorVendas * 100) / 100;
  t.valorFidelizado = Math.round(t.valorFidelizado * 100) / 100;
  return t;
}

/** Vendedores (de todas as lojas que a pessoa vê) com o CRM somado no período. */
export async function crmPorVendedor(de: string, ate: string): Promise<LinhaCrmVendedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_fidelizacao_resumo", { p_de: de, p_ate: ate });
  if (error) throw new Error(`Não consegui ler o CRM: ${error.message}`);
  return (data ?? []).map((r) => ({
    filial: r.filial_codigo,
    branchId: r.branch_id,
    vendedorCodigo: r.vendedor_codigo,
    vendedorNome: (r.vendedor_nome ?? "").trim() || (r.vendedor_codigo ? `Vendedor ${r.vendedor_codigo}` : "Sem vendedor"),
    vendas: Number(r.qtd_vendas),
    avulsas: Number(r.qtd_avulsas),
    fidelizadas: Number(r.qtd_fidelizadas),
    valorVendas: Number(r.valor_vendas),
    valorFidelizado: Number(r.valor_fidelizado),
    funcionario: Number(r.qtd_funcionario),
    inativo: Number(r.qtd_inativo),
  }));
}

/** Lojas: soma dos vendedores de cada filial, com nome e regional do cadastro. */
export async function crmPorLoja(vendedores: LinhaCrmVendedor[]): Promise<LinhaCrmLoja[]> {
  const supabase = await createClient();
  const { data: filiais } = await supabase.from("branches").select("codigo, nome, regional");
  const cad = new Map((filiais ?? []).map((f) => [f.codigo.toUpperCase(), f]));
  const porFilial = new Map<string, LinhaCrmVendedor[]>();
  for (const v of vendedores) porFilial.set(v.filial, [...(porFilial.get(v.filial) ?? []), v]);
  return [...porFilial.entries()].map(([filial, vs]) => ({
    filial,
    branchId: vs.find((v) => v.branchId)?.branchId ?? null,
    nome: cad.get(filial)?.nome ?? filial,
    regional: cad.get(filial)?.regional ?? null,
    vendedores: vs.filter((v) => v.vendas > 0).length,
    ...somarCrm(vs),
  }));
}

/** Dias do período que já têm CRM. */
export async function diasComCrm(de: string, ate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_dias", { p_de: de, p_ate: ate });
  if (error) throw new Error(`Não consegui ler os dias do CRM: ${error.message}`);
  return new Set((data ?? []).map((d) => String(d)));
}

/** Últimos envios (só admin e financeiro leem). */
export async function ultimasImportacoesCrm(limite = 8) {
  const supabase = await createClient();
  const { data } = await supabase.from("crm_importacoes").select("id, arquivo, dias, linhas, criado_por_nome, criado_em, resumo").order("criado_em", { ascending: false }).limit(limite);
  return data ?? [];
}

/** Último dia com CRM (para o período padrão da tela). */
export async function ultimoDiaCrm() {
  const supabase = await createClient();
  const { data } = await supabase.from("crm_fidelizacao_dia").select("data").order("data", { ascending: false }).limit(1).maybeSingle();
  return data?.data ?? null;
}
