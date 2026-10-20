// Retiradas de caixa × depósitos declarados (servidor) — a tela "Pesquisar Retirada de Caixa" da Zanini.
// Retirada = o "informado" do dinheiro de cada caixa no Relatório de Diferenças do Trier (caixa_diferencas), na data
// de fechamento do caixa (é quando a loja retira para depositar; conferido com a Zanini: F015 caixas 2390–2392).
// Declarado = as sangrias da loja (não canceladas) pela data do depósito. Diferença = retirada − declarado.
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

const diaBrasil = (diasAtras = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - diasAtras * 86_400_000));
const centavos = (v: number) => Math.round(v * 100) / 100;

export type FiltrosRetiradas = { filial?: string; conta?: string; retDe: string; retAte: string; depDe: string; depAte: string };

/** Padrão: retiradas dos últimos 7 dias (até ontem) × depósitos um dia depois (o depósito sai no dia seguinte). */
export function lerFiltrosRetiradas(sp: Record<string, string | string[] | undefined>): FiltrosRetiradas {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const data = (k: string, padrao: string) => (DATA.test(s(k)) ? s(k) : padrao);
  const ordem = (a: string, b: string) => (a <= b ? [a, b] : [b, a]);
  const [retDe, retAte] = ordem(data("ret_de", diaBrasil(7)), data("ret_ate", diaBrasil(1)));
  const [depDe, depAte] = ordem(data("dep_de", diaBrasil(6)), data("dep_ate", diaBrasil(0)));
  return { filial: UUID.test(s("filial")) ? s("filial") : undefined, conta: UUID.test(s("conta")) ? s("conta") : undefined, retDe, retAte, depDe, depAte };
}

export const paramsRetiradas = (f: FiltrosRetiradas) => ({ filial: f.filial, conta: f.conta, ret_de: f.retDe, ret_ate: f.retAte, dep_de: f.depDe, dep_ate: f.depAte });

export type Retirada = { id: string; branchId: string; caixa: number | null; data: string; operador: string; valor: number };
export type Declarado = { id: string; branchId: string; deposito: string; retirada: string; banco: string; numero: string | null; valor: number; situacao: string; observacao: string | null };

async function buscarRetiradas(f: FiltrosRetiradas, filial?: string): Promise<Retirada[]> {
  const supabase = await createClient();
  let q = supabase
    .from("caixa_diferencas")
    .select("id, branch_id, numero_caixa, dia, fechamento, nome_operador, informado")
    .eq("origem", "trier")
    .gt("informado", 0)
    .or(`and(fechamento.gte.${f.retDe},fechamento.lte.${f.retAte}),and(fechamento.is.null,dia.gte.${f.retDe},dia.lte.${f.retAte})`)
    .order("fechamento")
    .order("numero_caixa")
    .limit(10000);
  if (filial) q = q.eq("branch_id", filial);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ id: c.id, branchId: c.branch_id, caixa: c.numero_caixa, data: c.fechamento ?? c.dia, operador: c.nome_operador ?? "—", valor: Number(c.informado) }));
}

async function buscarDeclarado(f: FiltrosRetiradas, filial?: string): Promise<Declarado[]> {
  const supabase = await createClient();
  let q = supabase
    .from("caixa_sangrias")
    .select("id, branch_id, data_deposito, data_retirada, conta_apelido, numero_deposito, valor, situacao, observacao")
    .neq("situacao", "cancelada")
    .gte("data_deposito", f.depDe)
    .lte("data_deposito", f.depAte)
    .order("data_deposito")
    .order("criada_em")
    .limit(10000);
  if (filial) q = q.eq("branch_id", filial);
  if (f.conta) q = q.eq("conta_id", f.conta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((s) => ({
    id: s.id,
    branchId: s.branch_id,
    deposito: s.data_deposito,
    retirada: s.data_retirada,
    banco: s.conta_apelido,
    numero: s.numero_deposito,
    valor: Number(s.valor),
    situacao: s.situacao,
    observacao: s.observacao,
  }));
}

/** Até que dia os caixas já foram buscados no Trier (sem isso a retirada sai menor que a real). */
export async function caixasColetadosAte() {
  const supabase = await createClient();
  const { data } = await supabase.from("caixa_diferencas").select("dia").eq("origem", "trier").order("dia", { ascending: false }).limit(1).maybeSingle();
  return data?.dia ?? null;
}

const COLUNAS_CONF = "id, branch_id, retirada_de, retirada_ate, deposito_de, deposito_ate, conta_id, total_retirada, total_declarado, diferenca, conferido, comentario, criado_por_nome, criado_em";

/** Totais da filial no período (recalculados no servidor na hora de salvar a conferência). */
export async function totaisRetiradas(f: FiltrosRetiradas, filial: string) {
  const [retiradas, declarados] = await Promise.all([buscarRetiradas(f, filial), buscarDeclarado(f, filial)]);
  const totalRetirada = centavos(retiradas.reduce((a, r) => a + r.valor, 0));
  const totalDeclarado = centavos(declarados.reduce((a, d) => a + d.valor, 0));
  return { retiradas, declarados, totalRetirada, totalDeclarado, diferenca: centavos(totalRetirada - totalDeclarado) };
}

/** Uma filial: as retiradas de cada caixa, os depósitos declarados, os totais e o histórico de conferências. */
export async function detalheRetiradas(f: FiltrosRetiradas, filial: string) {
  const supabase = await createClient();
  const [totais, { data: conferencias, error }] = await Promise.all([
    totaisRetiradas(f, filial),
    supabase.from("caixa_retirada_conferencias").select(COLUNAS_CONF).eq("branch_id", filial).order("criado_em", { ascending: false }).limit(30),
  ]);
  if (error) throw new Error(error.message);
  return { ...totais, conferencias: conferencias ?? [] };
}

export type LinhaResumoRetiradas = { branchId: string; retirada: number; declarado: number; diferenca: number; caixas: number; depositos: number; conferido: boolean; comentarios: number };

/** Todas as filiais: retirada × declarado × diferença de cada uma, e se este mesmo período já foi conferido. */
export async function resumoRetiradas(f: FiltrosRetiradas) {
  const supabase = await createClient();
  let qConf = supabase
    .from("caixa_retirada_conferencias")
    .select("branch_id, conferido")
    .eq("retirada_de", f.retDe)
    .eq("retirada_ate", f.retAte)
    .eq("deposito_de", f.depDe)
    .eq("deposito_ate", f.depAte)
    .limit(5000);
  qConf = f.conta ? qConf.eq("conta_id", f.conta) : qConf.is("conta_id", null);
  const [retiradas, declarados, { data: conferencias, error }] = await Promise.all([buscarRetiradas(f), buscarDeclarado(f), qConf]);
  if (error) throw new Error(error.message);
  const linhas = new Map<string, LinhaResumoRetiradas>();
  const linha = (id: string) => {
    let l = linhas.get(id);
    if (!l) {
      l = { branchId: id, retirada: 0, declarado: 0, diferenca: 0, caixas: 0, depositos: 0, conferido: false, comentarios: 0 };
      linhas.set(id, l);
    }
    return l;
  };
  for (const r of retiradas) {
    const l = linha(r.branchId);
    l.retirada = centavos(l.retirada + r.valor);
    l.caixas += 1;
  }
  for (const d of declarados) {
    const l = linha(d.branchId);
    l.declarado = centavos(l.declarado + d.valor);
    l.depositos += 1;
  }
  for (const c of conferencias ?? []) {
    const l = linhas.get(c.branch_id);
    if (!l) continue;
    l.comentarios += 1;
    if (c.conferido) l.conferido = true;
  }
  for (const l of linhas.values()) l.diferenca = centavos(l.retirada - l.declarado);
  const lista = [...linhas.values()];
  const soma = (k: "retirada" | "declarado") => centavos(lista.reduce((a, l) => a + l[k], 0));
  return { linhas: lista, totalRetirada: soma("retirada"), totalDeclarado: soma("declarado"), diferenca: centavos(soma("retirada") - soma("declarado")) };
}
