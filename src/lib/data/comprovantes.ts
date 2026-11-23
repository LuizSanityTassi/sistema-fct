// Consultas dos comprovantes de venda (servidor). O RLS decide o que cada um vê: a loja vê os dela; financeiro,
// contador e administrador veem todos; o coordenador, os da regional.
import { ehSituacaoComprovante, ehTipoVenda, limparBusca, type SituacaoComprovante, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const TAMANHO_PAGINA_COMPROVANTES = 50;
/** Limite da planilha (o período longo demais vira aviso na tela). */
export const MAX_LINHAS_PLANILHA = 20000;

export type FiltrosComprovantes = {
  rede?: string;
  filial?: string;
  de: string;
  ate: string;
  tipo?: TipoVenda;
  /** ausente = todos (ativos e cancelados) */
  situacao?: SituacaoComprovante;
  busca?: string;
  pagina: number;
};

const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

export function lerFiltrosComprovantes(sp: Record<string, string | string[] | undefined>): FiltrosComprovantes {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const hoje = hojeBrasil();
  const pagina = Number.parseInt(s("pagina"), 10);
  const de = DATA.test(s("de")) ? s("de") : `${hoje.slice(0, 8)}01`;
  const ate = DATA.test(s("ate")) ? s("ate") : hoje;
  const situacao = s("situacao");
  const busca = limparBusca(s("busca"));
  return {
    rede: UUID.test(s("rede")) ? s("rede") : undefined,
    filial: UUID.test(s("filial")) ? s("filial") : undefined,
    // padrão: do dia 1 do mês até hoje, pela data da compra (de > até vira o mesmo dia)
    de: de > ate ? ate : de,
    ate,
    tipo: ehTipoVenda(s("tipo")) ? (s("tipo") as TipoVenda) : undefined,
    // padrão: só os ativos; "todos" mostra os cancelados junto
    situacao: situacao === "todos" ? undefined : ehSituacaoComprovante(situacao) ? situacao : "ativo",
    busca: busca.length >= 2 ? busca : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Parâmetros da URL dos filtros (para paginação, cartões e planilha). */
export function paramsDosFiltros(f: FiltrosComprovantes): Record<string, string | undefined> {
  return { rede: f.rede, filial: f.filial, de: f.de, ate: f.ate, tipo: f.tipo, situacao: f.situacao ?? "todos", busca: f.busca };
}

const COLUNAS =
  "id, branch_id, tipo, empresa, cliente, valor, parcelas, data_compra, numero_venda, observacao, situacao, criada_por, criada_por_nome, criada_em, cancelada_por_nome, cancelada_em, motivo_cancelamento, filial:branches!inner(codigo, nome, cnpj, organization_id, rede:organizations(nome_fantasia))";

type Filtravel<Q> = {
  eq: (c: string, v: string) => Q;
  gte: (c: string, v: string) => Q;
  lte: (c: string, v: string) => Q;
  or: (f: string) => Q;
};

function filtrar<Q extends Filtravel<Q>>(q: Q, f: FiltrosComprovantes): Q {
  let c = q.gte("data_compra", f.de).lte("data_compra", f.ate);
  if (f.rede) c = c.eq("filial.organization_id", f.rede);
  if (f.filial) c = c.eq("branch_id", f.filial);
  if (f.tipo) c = c.eq("tipo", f.tipo);
  if (f.situacao) c = c.eq("situacao", f.situacao);
  // entre aspas: ponto e dois-pontos no texto não quebram o filtro
  if (f.busca) c = c.or(`cliente.ilike."%${f.busca}%",empresa.ilike."%${f.busca}%",numero_venda.ilike."%${f.busca}%"`);
  return c;
}

export type TotaisComprovantes = Record<TipoVenda, { qtd: number; valor: number }> & { total: { qtd: number; valor: number } };

async function totais(f: FiltrosComprovantes): Promise<TotaisComprovantes> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("comprovantes_totais", {
    p_de: f.de,
    p_ate: f.ate,
    p_rede: f.rede,
    p_filial: f.filial,
    p_tipo: f.tipo,
    p_situacao: f.situacao,
    p_busca: f.busca,
  });
  if (error) throw new Error(error.message);
  const t: TotaisComprovantes = { convenio: { qtd: 0, valor: 0 }, crediario: { qtd: 0, valor: 0 }, total: { qtd: 0, valor: 0 } };
  for (const l of data ?? []) {
    if (!ehTipoVenda(l.tipo)) continue;
    t[l.tipo] = { qtd: Number(l.qtd), valor: Number(l.valor) };
    t.total.qtd += Number(l.qtd);
    t.total.valor = Math.round((t.total.valor + Number(l.valor)) * 100) / 100;
  }
  return t;
}

export type AnexoResumo = { id: string; nome: string; mime: string | null };

export async function listarComprovantes(f: FiltrosComprovantes) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA_COMPROVANTES;
  const [lista, somas] = await Promise.all([
    filtrar(supabase.from("venda_comprovantes").select(COLUNAS, { count: "exact" }), f)
      .order("data_compra", { ascending: false })
      .order("criada_em", { ascending: false })
      .range(de, de + TAMANHO_PAGINA_COMPROVANTES - 1),
    totais(f),
  ]);
  if (lista.error) throw new Error(lista.error.message);
  const itens = lista.data ?? [];
  const anexos = await anexosDe(itens.map((c) => c.id));
  return { itens, total: lista.count ?? 0, somas, anexos };
}

/** Anexos de cada comprovante (para os ícones de baixar da lista). */
async function anexosDe(ids: string[]) {
  const porComprovante = new Map<string, AnexoResumo[]>();
  if (!ids.length) return porComprovante;
  const supabase = await createClient();
  const { data } = await supabase.from("venda_comprovante_anexos").select("id, comprovante_id, nome, mime").in("comprovante_id", ids).order("criado_em");
  for (const a of data ?? []) {
    const l = porComprovante.get(a.comprovante_id) ?? [];
    l.push({ id: a.id, nome: a.nome, mime: a.mime });
    porComprovante.set(a.comprovante_id, l);
  }
  return porComprovante;
}

/** Todas as linhas do filtro (sem paginar), de 1.000 em 1.000, para a planilha. */
export async function linhasDaPlanilha(f: FiltrosComprovantes) {
  const supabase = await createClient();
  const linhas = [];
  for (let de = 0; de < MAX_LINHAS_PLANILHA; de += 1000) {
    const { data, error } = await filtrar(supabase.from("venda_comprovantes").select(COLUNAS), f)
      .order("data_compra")
      .order("criada_em")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const anexos = new Map<string, AnexoResumo[]>();
  for (let i = 0; i < linhas.length; i += 200) {
    for (const [k, v] of await anexosDe(linhas.slice(i, i + 200).map((c) => c.id))) anexos.set(k, v);
  }
  return { linhas, anexos };
}

export async function obterComprovante(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const [{ data }, { data: anexos }] = await Promise.all([
    supabase.from("venda_comprovantes").select(COLUNAS).eq("id", id).maybeSingle(),
    supabase.from("venda_comprovante_anexos").select("id, nome, mime, tamanho, enviado_por_nome, criado_em, storage_path").eq("comprovante_id", id).order("criado_em"),
  ]);
  return data ? { ...data, anexos: anexos ?? [] } : null;
}

/** Redes (empresas do grupo) e filiais para os filtros; a loja escolhe só as dela. */
export async function opcoesDeFiltro(verTodas: boolean) {
  const supabase = await createClient();
  const [{ data: redes }, filiais, { data: lojas }] = await Promise.all([
    supabase.from("organizations").select("id, nome_fantasia").order("nome_fantasia"),
    verTodas ? supabase.from("branches").select("id, codigo, nome, organization_id").eq("ativo", true).order("codigo") : Promise.resolve({ data: null }),
    supabase.rpc("lojas_para_comprovante"),
  ]);
  const listaFiliais = verTodas
    ? (filiais.data ?? []).map((b) => ({ id: b.id, codigo: b.codigo, nome: b.nome, rede: b.organization_id }))
    : (lojas ?? []).map((l) => ({ id: l.id, codigo: l.codigo, nome: l.nome, rede: redes?.find((r) => r.nome_fantasia === l.rede)?.id ?? null }));
  return {
    redes: (redes ?? []).map((r) => ({ id: r.id, nome: r.nome_fantasia ?? "" })),
    filiais: listaFiliais,
    lojasDeCadastro: lojas ?? [],
  };
}

/** Já existe um comprovante ativo igual (mesma loja, data, cliente e valor)? Devolve o id para a pessoa conferir. */
export async function comprovanteParecido(c: { branch_id: string; data_compra: string; cliente: string; valor: number }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("venda_comprovantes")
    .select("id")
    .eq("branch_id", c.branch_id)
    .eq("data_compra", c.data_compra)
    .eq("valor", c.valor)
    .eq("situacao", "ativo")
    .ilike("cliente", limparBusca(c.cliente).replace(/ /g, "%") || "-")
    .limit(1);
  return data?.[0]?.id ?? null;
}
