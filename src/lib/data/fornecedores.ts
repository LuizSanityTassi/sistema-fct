// Ficha e histórico por fornecedor (raiz do CNPJ), em cima da view conc_boletos_vistos e das funções da migração 0022.
import { INICIO_OPERACAO } from "@/lib/operacao";
import { createClient } from "@/lib/supabase/server";

export const ehRaiz = (v: string) => /^\d{8}$/.test(v);
export const formatarRaiz = (r: string) => `${r.slice(0, 2)}.${r.slice(2, 5)}.${r.slice(5, 8)}`;
export const formatarCnpj = (c: string) => (c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c);

export const BANCO_LABEL: Record<string, string> = {
  "001": "Banco do Brasil",
  "033": "Santander",
  "041": "Banrisul",
  "070": "BRB",
  "077": "Inter",
  "104": "Caixa",
  "208": "BTG Pactual",
  "212": "Original",
  "237": "Bradesco",
  "260": "Nubank",
  "336": "C6",
  "341": "Itaú",
  "389": "Mercantil",
  "422": "Safra",
  "604": "Industrial",
  "655": "Votorantim",
  "707": "Daycoval",
  "745": "Citibank",
  "748": "Sicredi",
  "756": "Sicoob",
};
export const nomeBanco = (c: string | null | undefined) => (c ? `${c} ${BANCO_LABEL[c] ?? ""}`.trim() : "—");

const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function listarFornecedores(q?: string, limite = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conc_fornecedores_lista", { p_q: q ?? "", p_limite: limite });
  if (error) throw error;
  return data.map((r) => ({ ...r, qtd: n(r.qtd), total: n(r.total), cnpjs: n(r.cnpjs), bancos: n(r.bancos), exatos: n(r.exatos), divergencias: n(r.divergencias), fora_padrao: n(r.fora_padrao) }));
}
export type FornecedorLista = Awaited<ReturnType<typeof listarFornecedores>>[number];

export async function fichaFornecedor(raiz: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("conc_fornecedor_ficha", { p_raiz: raiz });
  if (error) throw error;
  const f = data[0];
  if (!f) return null;
  return {
    ...f,
    cnpjs: f.cnpjs ?? [],
    bancos: f.bancos ?? [],
    fornecedores: f.fornecedores ?? [],
    boletos: n(f.boletos),
    total: n(f.total),
    exatos: n(f.exatos),
    divergencias: n(f.divergencias),
    fora_padrao: n(f.fora_padrao),
    minimo: n(f.minimo),
    p10: n(f.p10),
    mediana: n(f.mediana),
    p90: n(f.p90),
    maximo: n(f.maximo),
  };
}

export async function boletosFornecedor(raiz: string, limite = 300) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_boletos_vistos").select("*").eq("raiz", raiz).order("vencimento", { ascending: false, nullsFirst: false }).limit(limite);
  if (error) throw error;
  return data;
}

export async function aprendizadoDaRaiz(raiz: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_aprendizado").select("fornecedor, beneficiario, vezes, confirmado, bloqueado, taxas").eq("raiz", raiz).order("vezes", { ascending: false });
  if (error) throw error;
  return data;
}

/** Pendências abertas de boletos dessa raiz (o CNPJ fica formatado em conc_pendencias). */
export async function pendenciasDaRaiz(raiz: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conc_pendencias")
    .select("chave, problema, status, valor, vencimento, filial, detalhe, beneficiario")
    .ilike("cnpj", `${formatarRaiz(raiz)}/%`)
    .in("status", ["pendente", "em_analise"])
    .gte("vencimento", INICIO_OPERACAO)
    .order("vencimento", { ascending: true })
    .limit(100);
  if (error) throw error;
  return data;
}
