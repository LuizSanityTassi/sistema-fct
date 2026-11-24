// Consultas de Compras (servidor): pré-pedidos × notas do Trier. O RLS deixa só administrador e compras (e o diretor
// de compras, em consulta).
import { ehSituacaoPedido, JANELA_MAXIMA, JANELA_PADRAO, SITUACOES_PEDIDO, type SituacaoPedido } from "@/lib/compras/rotulos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const TAMANHO_PAGINA_COMPRAS = 50;

export const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const diasAtras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86_400_000));

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
const pagina = (sp: Record<string, string | string[] | undefined>) => {
  const n = Number.parseInt(texto(sp, "pagina"), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
};

// ---------- pré-pedidos × notas ----------

export type FiltrosPedidos = { de: string; ate: string; janela: number; filial?: string; laboratorio?: string; situacao?: SituacaoPedido; pagina: number };

export function lerFiltrosPedidos(sp: Record<string, string | string[] | undefined>): FiltrosPedidos {
  const ate = DATA.test(texto(sp, "ate")) ? texto(sp, "ate") : hojeBrasil();
  const de = DATA.test(texto(sp, "de")) ? texto(sp, "de") : diasAtras(7);
  const janela = Number.parseInt(texto(sp, "janela"), 10);
  const situacao = texto(sp, "situacao");
  return {
    de: de > ate ? ate : de,
    ate,
    janela: Number.isInteger(janela) && janela >= 0 && janela <= JANELA_MAXIMA ? janela : JANELA_PADRAO,
    filial: /^[\w-]{1,20}$/.test(texto(sp, "filial")) ? texto(sp, "filial") : undefined,
    laboratorio: texto(sp, "laboratorio").slice(0, 120) || undefined,
    situacao: ehSituacaoPedido(situacao) ? situacao : undefined,
    pagina: pagina(sp),
  };
}

export const paramsPedidos = (f: FiltrosPedidos) => ({ de: f.de, ate: f.ate, janela: String(f.janela), filial: f.filial, laboratorio: f.laboratorio, situacao: f.situacao });

const argsPedidos = (f: FiltrosPedidos) => ({ p_de: f.de, p_ate: f.ate, p_janela: f.janela, p_filial: f.filial, p_laboratorio: f.laboratorio, p_hoje: hojeBrasil() });

export async function listarPedidos(f: FiltrosPedidos) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA_COMPRAS;
  let q = supabase.rpc("cmp_pedidos_resumo", argsPedidos(f), { count: "exact" });
  if (f.situacao) q = q.eq("situacao", f.situacao);
  const [lista, totais] = await Promise.all([
    q.order("data_pedido", { ascending: false }).order("filial_codigo").order("numero").range(de, de + TAMANHO_PAGINA_COMPRAS - 1),
    supabase.rpc("cmp_pedidos_totais", argsPedidos(f)),
  ]);
  if (lista.error) throw new Error(lista.error.message);
  if (totais.error) throw new Error(totais.error.message);
  const porSituacao = Object.fromEntries(Object.keys(SITUACOES_PEDIDO).map((s) => [s, { pedidos: 0, itens: 0, pedida: 0, recebida: 0, excedente: 0 }])) as Record<
    SituacaoPedido,
    { pedidos: number; itens: number; pedida: number; recebida: number; excedente: number }
  >;
  for (const t of totais.data ?? []) {
    if (!ehSituacaoPedido(t.situacao)) continue;
    porSituacao[t.situacao] = { pedidos: Number(t.pedidos), itens: Number(t.itens), pedida: Number(t.qtd_pedida), recebida: Number(t.qtd_recebida), excedente: Number(t.qtd_excedente) };
  }
  return { pedidos: lista.data ?? [], total: lista.count ?? 0, porSituacao };
}

export async function obterPedido(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cmp_pedidos")
    .select("id, numero, filial_codigo, laboratorio, data_pedido, qtd_itens, qtd_total, arquivo, criado_em, importacao_id, filial:branches!cmp_pedidos_branch_id_fkey(nome)")
    .eq("id", id)
    .maybeSingle();
  return data;
}

/** Itens do pedido com o recebido (mesma fila e janela da lista). */
export async function itensDoPedido(p: { id: string; data_pedido: string; filial_codigo: string }, janela: number) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("cmp_cruzamento", { p_de: p.data_pedido, p_ate: p.data_pedido, p_janela: janela, p_filial: p.filial_codigo, p_pedido: p.id })
    .order("produto")
    .limit(2000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Opções dos filtros: filiais com pedido ou nota e laboratórios dos pedidos. */
export async function opcoesCompras() {
  const supabase = await createClient();
  const [{ data: filiais }, { data: labs }] = await Promise.all([
    supabase.from("branches").select("codigo, nome").eq("ativo", true).order("codigo"),
    supabase.from("cmp_pedidos").select("laboratorio").order("laboratorio").limit(5000),
  ]);
  return {
    filiais: (filiais ?? []).map((f) => ({ codigo: f.codigo, nome: f.nome })),
    laboratorios: [...new Set((labs ?? []).map((l) => l.laboratorio).filter((l): l is string => !!l))],
  };
}

// ---------- notas do Trier ----------

export type FiltrosNotas = { de: string; ate: string; filial?: string; busca?: string; transferencias: boolean; pagina: number };

export function lerFiltrosNotas(sp: Record<string, string | string[] | undefined>): FiltrosNotas {
  const ate = DATA.test(texto(sp, "ate")) ? texto(sp, "ate") : hojeBrasil();
  const de = DATA.test(texto(sp, "de")) ? texto(sp, "de") : diasAtras(3);
  const busca = texto(sp, "busca")
    .replace(/[,()%_*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return {
    de: de > ate ? ate : de,
    ate,
    filial: /^[\w-]{1,20}$/.test(texto(sp, "filial")) ? texto(sp, "filial") : undefined,
    busca: busca.length >= 2 ? busca : undefined,
    transferencias: texto(sp, "transferencias") === "1",
    pagina: pagina(sp),
  };
}

export const paramsNotas = (f: FiltrosNotas) => ({ de: f.de, ate: f.ate, filial: f.filial, busca: f.busca, transferencias: f.transferencias ? "1" : undefined });

export async function listarNotas(f: FiltrosNotas) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA_COMPRAS;
  let q = supabase
    .from("cmp_notas")
    .select("id, filial_codigo, fornecedor_codigo, fornecedor_nome, transferencia, numero, serie, data_entrada, data_emissao, estoque_atualizado, total_nota, qtd_itens", { count: "exact" })
    .gte("data_entrada", f.de)
    .lte("data_entrada", f.ate);
  if (f.filial) q = q.eq("filial_codigo", f.filial);
  if (!f.transferencias) q = q.eq("transferencia", false);
  if (f.busca) q = q.or(`numero.ilike."%${f.busca}%",fornecedor_nome.ilike."%${f.busca}%"`);
  const { data, count, error } = await q.order("data_entrada", { ascending: false }).order("filial_codigo").order("numero").range(de, de + TAMANHO_PAGINA_COMPRAS - 1);
  if (error) throw new Error(error.message);
  return { notas: data ?? [], total: count ?? 0 };
}

export async function obterNota(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [{ data: nota }, { data: itens }] = await Promise.all([
    supabase.from("cmp_notas").select("*, filial:branches!cmp_notas_branch_id_fkey(nome)").eq("id", id).maybeSingle(),
    supabase.from("cmp_nota_itens").select("*").eq("nota_id", id).order("id"),
  ]);
  return nota ? { ...nota, itens: itens ?? [] } : null;
}

export async function importacoesRecentes(limite = 20) {
  const supabase = await createClient();
  const { data } = await supabase.from("cmp_importacoes").select("id, tipo, arquivo, resumo, criado_por_nome, criado_em").order("criado_em", { ascending: false }).limit(limite);
  return data ?? [];
}
