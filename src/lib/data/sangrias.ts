// Consultas das sangrias (servidor). O RLS decide o que cada um vê: loja vê as suas; financeiro, contador e
// administrador veem todas.
import { createClient } from "@/lib/supabase/server";
import { ehSituacaoSangria, type SituacaoSangria } from "@/lib/sangrias/rotulos";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const TAMANHO_PAGINA_SANGRIAS = 50;

export type FiltrosSangrias = { filial?: string; conta?: string; de: string; ate: string; situacao?: SituacaoSangria; pagina: number };

const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function lerFiltrosSangrias(sp: Record<string, string | string[] | undefined>): FiltrosSangrias {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const hoje = hojeBrasil();
  const pagina = Number.parseInt(s("pagina"), 10);
  return {
    filial: UUID.test(s("filial")) ? s("filial") : undefined,
    conta: UUID.test(s("conta")) ? s("conta") : undefined,
    // padrão: do dia 1 do mês até hoje (pela data do depósito)
    de: DATA.test(s("de")) ? s("de") : `${hoje.slice(0, 8)}01`,
    ate: DATA.test(s("ate")) ? s("ate") : hoje,
    situacao: ehSituacaoSangria(s("situacao")) ? (s("situacao") as SituacaoSangria) : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

const COLUNAS =
  "id, branch_id, conta_id, conta_apelido, data_retirada, data_deposito, numero_deposito, valor, observacao, situacao, criada_por, criada_por_nome, criada_em, conferida_por_nome, conferida_em, conferencia_obs, cancelada_por_nome, cancelada_em, motivo_cancelamento, filial:branches!caixa_sangrias_branch_id_fkey(codigo, nome)";

export async function listarSangrias(f: FiltrosSangrias) {
  const supabase = await createClient();
  const aplicar = <Q extends { eq: (c: string, v: string) => Q; gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(q: Q) => {
    let c = q.gte("data_deposito", f.de).lte("data_deposito", f.ate);
    if (f.filial) c = c.eq("branch_id", f.filial);
    if (f.conta) c = c.eq("conta_id", f.conta);
    if (f.situacao) c = c.eq("situacao", f.situacao);
    return c;
  };
  const de = (f.pagina - 1) * TAMANHO_PAGINA_SANGRIAS;
  const [lista, totais] = await Promise.all([
    aplicar(supabase.from("caixa_sangrias").select(COLUNAS, { count: "exact" }))
      .order("data_deposito", { ascending: false })
      .order("criada_em", { ascending: false })
      .range(de, de + TAMANHO_PAGINA_SANGRIAS - 1),
    // totais do período (sem paginar): só o necessário para somar
    aplicar(supabase.from("caixa_sangrias").select("valor, situacao")).limit(20000),
  ]);
  if (lista.error) throw new Error(lista.error.message);
  const somas = { pendente: { qtd: 0, valor: 0 }, conferida: { qtd: 0, valor: 0 }, cancelada: { qtd: 0, valor: 0 } };
  for (const t of totais.data ?? []) {
    const k = t.situacao as SituacaoSangria;
    if (!somas[k]) continue;
    somas[k].qtd += 1;
    somas[k].valor = Math.round((somas[k].valor + Number(t.valor)) * 100) / 100;
  }
  const itens = lista.data ?? [];
  // quantos comprovantes cada uma tem (para o ícone da lista)
  const ids = itens.map((s) => s.id);
  const qtdAnexos = new Map<string, number>();
  if (ids.length) {
    const { data } = await supabase.from("sangria_anexos").select("sangria_id").in("sangria_id", ids);
    for (const a of data ?? []) qtdAnexos.set(a.sangria_id, (qtdAnexos.get(a.sangria_id) ?? 0) + 1);
  }
  return { itens, total: lista.count ?? 0, somas, qtdAnexos };
}

export async function obterSangria(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [{ data }, { data: anexos }] = await Promise.all([
    supabase.from("caixa_sangrias").select(COLUNAS).eq("id", id).maybeSingle(),
    supabase.from("sangria_anexos").select("id, nome, mime, tamanho, enviado_por_nome, criado_em, storage_path").eq("sangria_id", id).order("criado_em"),
  ]);
  return data ? { ...data, anexos: anexos ?? [] } : null;
}

/** Lojas em que a pessoa pode cadastrar e contas da Carteira para escolher (pelas funções do banco). */
export async function opcoesDeCadastro() {
  const supabase = await createClient();
  const [{ data: lojas }, { data: contas }] = await Promise.all([supabase.rpc("lojas_para_sangria"), supabase.rpc("contas_para_deposito")]);
  return { lojas: lojas ?? [], contas: contas ?? [] };
}
