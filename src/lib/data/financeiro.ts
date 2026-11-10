import { cache } from "react";
import { mesTravadoContabil } from "@/lib/data/contabil-trava";
import { ehUuid } from "@/lib/data/filiais";
import { grupoFinanceiro } from "@/lib/financeiro/formatos";
import {
  ehGrupoFinanceiro,
  ehOrigemFin,
  ehTipoFin,
  ordemGrupo,
  type FinOrigem,
  type FinTipo,
  type GrupoFinanceiro,
} from "@/lib/financeiro/rotulos";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 50;
/** O PostgREST devolve no máximo 1000 linhas por requisição; as views são lidas em lotes. */
const LOTE_VIEW = 1000;
const UUID_NULO = "00000000-0000-0000-0000-000000000000";

// ---------- unidades e grupos financeiros ----------

/** Todas as unidades (inclusive inativas: há histórico nelas) com o grupo financeiro já resolvido. */
export const listarUnidadesFinanceiro = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, codigo, nome, ativo, regional, organizations(nome_fantasia)")
    .order("codigo");
  if (error) throw error;
  return data.map((b) => ({
    id: b.id,
    codigo: b.codigo,
    nome: b.nome,
    ativo: b.ativo,
    regional: b.regional,
    empresa: b.organizations?.nome_fantasia ?? "",
    grupo: grupoFinanceiro(b.organizations?.nome_fantasia, b.regional),
  }));
});
export type UnidadeFinanceiro = Awaited<ReturnType<typeof listarUnidadesFinanceiro>>[number];

// ---------- categorias ----------

export const listarCategorias = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_categorias").select("*").order("tipo").order("grupo").order("nome");
  if (error) throw error;
  return data;
});
export type Categoria = Awaited<ReturnType<typeof listarCategorias>>[number];

export const obterCategoria = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_categorias").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
});

export type FiltrosCategorias = { q?: string; tipo?: FinTipo; inativas: boolean };

export function lerFiltrosCategorias(sp: Record<string, string | string[] | undefined>): FiltrosCategorias {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const tipo = s("tipo");
  return { q: s("q") || undefined, tipo: ehTipoFin(tipo) ? tipo : undefined, inativas: s("inativas") === "1" };
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtro em memória: são ~200 categorias, já carregadas para os selects. */
export function filtrarCategorias(categorias: Categoria[], f: FiltrosCategorias) {
  const termo = f.q ? semAcento(f.q) : "";
  return categorias.filter((c) => {
    if (!f.inativas && !c.ativo) return false;
    if (f.tipo && c.tipo !== f.tipo) return false;
    if (termo && !semAcento(`${c.grupo} ${c.nome} ${c.dre_familia ?? ""} ${c.dre_grupo ?? ""} ${c.fin_familia ?? ""} ${c.fin_grupo ?? ""}`).includes(termo)) return false;
    return true;
  });
}

/** Valores já usados nas classificações, para sugerir no formulário (datalist). */
export function opcoesClassificacao(categorias: Categoria[]) {
  const unicos = (chave: "grupo" | "dre_familia" | "dre_grupo" | "fin_familia" | "fin_grupo") =>
    [...new Set(categorias.map((c) => c[chave]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return {
    grupos: unicos("grupo"),
    dreFamilias: unicos("dre_familia"),
    dreGrupos: unicos("dre_grupo"),
    finFamilias: unicos("fin_familia"),
    finGrupos: unicos("fin_grupo"),
  };
}

// ---------- meses fechados ----------

export const listarMesesFechados = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_meses_fechados")
    .select("competencia, fechado_em, quem:profiles(nome)")
    .order("competencia", { ascending: false });
  if (error) throw error;
  return data.map((m) => ({ ...m, competencia: m.competencia.trim() }));
});

/** Fechado pelo financeiro OU travado pelo contador (trava contábil, que vale até para o administrador). */
export async function mesFechado(competencia: string) {
  const [meses, travado] = await Promise.all([listarMesesFechados(), mesTravadoContabil(competencia)]);
  return travado || meses.some((m) => m.competencia === competencia);
}

// ---------- filtros da listagem ----------

export type FiltrosLancamentos = {
  /** "AAAA-MM": quando presente, vale sobre de/até. */
  competencia?: string;
  de?: string;
  ate?: string;
  filial?: string;
  grupo?: GrupoFinanceiro;
  tipo?: FinTipo;
  categoria?: string;
  origem?: FinOrigem;
  q?: string;
  pagina: number;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function lerFiltrosLancamentos(sp: Record<string, string | string[] | undefined>): FiltrosLancamentos {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const competencia = s("competencia");
  const grupo = s("grupo");
  const tipo = s("tipo");
  const origem = s("origem");
  return {
    competencia: competenciaValida(competencia) ? competencia : undefined,
    de: DATA_RE.test(s("de")) ? s("de") : undefined,
    ate: DATA_RE.test(s("ate")) ? s("ate") : undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    grupo: ehGrupoFinanceiro(grupo) ? grupo : undefined,
    tipo: ehTipoFin(tipo) ? tipo : undefined,
    categoria: ehUuid(s("categoria")) ? s("categoria") : undefined,
    origem: ehOrigemFin(origem) ? origem : undefined,
    q: s("q") || undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Parâmetros de URL equivalentes aos filtros (para paginação e links). */
export function paramsDosFiltros(f: FiltrosLancamentos): Record<string, string | undefined> {
  return { competencia: f.competencia, de: f.de, ate: f.ate, filial: f.filial, grupo: f.grupo, tipo: f.tipo, categoria: f.categoria, origem: f.origem, q: f.q };
}

export function temFiltro(f: FiltrosLancamentos) {
  return Boolean(f.competencia || f.de || f.ate || f.filial || f.grupo || f.tipo || f.categoria || f.origem || f.q);
}

function ultimoDia(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10); // dia 0 do mês seguinte
}

/** Intervalo de datas do filtro (competência tem prioridade sobre de/até). */
export function periodoDoFiltro(f: FiltrosLancamentos) {
  if (f.competencia) return { de: `${f.competencia}-01`, ate: ultimoDia(f.competencia) };
  return { de: f.de, ate: f.ate };
}

/** Termo de busca sem os caracteres com significado na sintaxe do PostgREST. */
function termoBusca(q?: string) {
  const t = q?.replace(/[%_,().\\]/g, " ").trim();
  return t || undefined;
}

/** Unidades que entram na consulta: undefined = sem restrição. Lista vazia = grupo sem unidades. */
async function filiaisDoFiltro(f: FiltrosLancamentos): Promise<string[] | undefined> {
  if (f.filial) return [f.filial];
  if (f.grupo) {
    const unidades = await listarUnidadesFinanceiro();
    return unidades.filter((u) => u.grupo === f.grupo).map((u) => u.id);
  }
  return undefined;
}

// ---------- lançamentos ----------

export async function listarLancamentos(f: FiltrosLancamentos) {
  const supabase = await createClient();
  const { de, ate } = periodoDoFiltro(f);
  const branches = await filiaisDoFiltro(f);
  const inicio = (f.pagina - 1) * TAMANHO_PAGINA;

  let consulta = supabase
    .from("fin_lancamentos")
    .select(
      "id, data, competencia, tipo, valor, descricao, origem, legado_id, branch_id, categoria_id, created_at, unidade:branches(id, codigo, nome, regional, organizations(nome_fantasia)), categoria:fin_categorias(id, grupo, nome)",
      { count: "exact" },
    );
  if (de) consulta = consulta.gte("data", de);
  if (ate) consulta = consulta.lte("data", ate);
  if (branches) consulta = consulta.in("branch_id", branches.length === 0 ? [UUID_NULO] : branches);
  if (f.tipo) consulta = consulta.eq("tipo", f.tipo);
  if (f.categoria) consulta = consulta.eq("categoria_id", f.categoria);
  if (f.origem) consulta = consulta.eq("origem", f.origem);
  const termo = termoBusca(f.q);
  if (termo) consulta = consulta.ilike("descricao", `%${termo}%`);

  const { data, error, count } = await consulta
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .range(inicio, inicio + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}
export type LancamentoLista = Awaited<ReturnType<typeof listarLancamentos>>["itens"][number];

export type Totais = {
  receber: { qtd: number; total: number };
  pagar: { qtd: number; total: number };
  resultado: number;
  qtd: number;
};

/** Soma receber/pagar com os mesmos filtros da listagem (função SQL fin_totais, respeita o RLS). */
export async function totaisLancamentos(f: FiltrosLancamentos): Promise<Totais> {
  const zero: Totais = { receber: { qtd: 0, total: 0 }, pagar: { qtd: 0, total: 0 }, resultado: 0, qtd: 0 };
  const branches = await filiaisDoFiltro(f);
  if (branches && branches.length === 0) return zero;
  const { de, ate } = periodoDoFiltro(f);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fin_totais", {
    p_de: de,
    p_ate: ate,
    p_branches: branches,
    p_tipo: f.tipo,
    p_categoria: f.categoria,
    p_origem: f.origem,
    p_q: termoBusca(f.q),
  });
  if (error) throw error;
  const t = zero;
  for (const r of data) t[r.tipo] = { qtd: Number(r.qtd), total: Number(r.total) };
  t.resultado = t.receber.total - t.pagar.total;
  t.qtd = t.receber.qtd + t.pagar.qtd;
  return t;
}

export const obterLancamento = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_lancamentos")
    .select("*, unidade:branches(id, codigo, nome), categoria:fin_categorias(id, grupo, nome, tipo), autor:profiles(nome)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

// ---------- lotes de importação (view fin_lotes) ----------

export async function listarLotes(limite = 50) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_lotes").select("*").order("criado_em", { ascending: false }).limit(limite);
  if (error) throw error;
  const ids = [...new Set(data.map((l) => l.created_by).filter((v): v is string => !!v))];
  const nomes = new Map<string, string>();
  if (ids.length) {
    const { data: perfis } = await supabase.from("profiles").select("id, nome").in("id", ids);
    for (const p of perfis ?? []) nomes.set(p.id, p.nome);
  }
  return data
    .filter((l): l is typeof l & { lote_id: string; origem: FinOrigem; criado_em: string; qtd: number; total: number; de: string; ate: string; unidades: number } => !!l.lote_id && !!l.origem && !!l.criado_em)
    .map((l) => ({ ...l, quem: l.created_by ? (nomes.get(l.created_by) ?? null) : null }));
}

// ---------- resumos (view fin_resumo_mensal) ----------

type LinhaResumo = { branch_id: string | null; competencia: string | null; tipo: FinTipo | null; qtd: number | null; total: number | null };

async function linhasResumo(deComp?: string, ateComp?: string) {
  const supabase = await createClient();
  const linhas: LinhaResumo[] = [];
  for (let inicio = 0; ; inicio += LOTE_VIEW) {
    let consulta = supabase
      .from("fin_resumo_mensal")
      .select("branch_id, competencia, tipo, qtd, total")
      .order("competencia")
      .order("branch_id")
      .order("tipo");
    if (deComp) consulta = consulta.gte("competencia", deComp);
    if (ateComp) consulta = consulta.lte("competencia", ateComp);
    const { data, error } = await consulta.range(inicio, inicio + LOTE_VIEW - 1);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < LOTE_VIEW) break;
  }
  return linhas;
}

/** Competências com movimento, da mais recente para a mais antiga. */
export const listarCompetenciasFinanceiro = cache(async () => {
  const linhas = await linhasResumo();
  const conjunto = new Set<string>();
  for (const l of linhas) if (l.competencia) conjunto.add(l.competencia.trim());
  return [...conjunto].sort().reverse();
});

export type Agregado = { receber: number; pagar: number; qtd: number; resultado: number };
const novoAgregado = (): Agregado => ({ receber: 0, pagar: 0, qtd: 0, resultado: 0 });

function somar(a: Agregado, tipo: FinTipo, total: number, qtd: number) {
  a[tipo] += total;
  a.qtd += qtd;
  a.resultado = a.receber - a.pagar;
}

function obter<K>(mapa: Map<K, Agregado>, chave: K) {
  let a = mapa.get(chave);
  if (!a) {
    a = novoAgregado();
    mapa.set(chave, a);
  }
  return a;
}

/** Receitas, despesas e resultado entre duas competências, por grupo, mês e unidade. */
export async function resumoPeriodo(deComp: string, ateComp: string) {
  const [linhas, unidades] = await Promise.all([linhasResumo(deComp, ateComp), listarUnidadesFinanceiro()]);
  const porId = new Map(unidades.map((u) => [u.id, u]));
  const total = novoAgregado();
  const porGrupo = new Map<string, Agregado>();
  const porMes = new Map<string, Agregado>();
  const porUnidade = new Map<string, Agregado>();

  for (const l of linhas) {
    if (!l.tipo || !l.branch_id || !l.competencia) continue;
    const valor = Number(l.total ?? 0);
    const qtd = Number(l.qtd ?? 0);
    somar(total, l.tipo, valor, qtd);
    somar(obter(porGrupo, porId.get(l.branch_id)?.grupo ?? "OUTROS"), l.tipo, valor, qtd);
    somar(obter(porMes, l.competencia.trim()), l.tipo, valor, qtd);
    somar(obter(porUnidade, l.branch_id), l.tipo, valor, qtd);
  }

  return {
    total,
    porGrupo: [...porGrupo.entries()].map(([grupo, a]) => ({ grupo, ...a })).sort((a, b) => ordemGrupo(a.grupo, b.grupo)),
    porMes: [...porMes.entries()].map(([competencia, a]) => ({ competencia, ...a })).sort((a, b) => a.competencia.localeCompare(b.competencia)),
    porUnidade: [...porUnidade.entries()]
      .flatMap(([id, a]) => {
        const unidade = porId.get(id);
        return unidade ? [{ unidade, ...a }] : [];
      })
      .sort((a, b) => ordemGrupo(a.unidade.grupo, b.unidade.grupo) || a.unidade.codigo.localeCompare(b.unidade.codigo)),
    unidadesComMovimento: porUnidade.size,
  };
}
