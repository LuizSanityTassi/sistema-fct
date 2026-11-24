import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ehUuid } from "@/lib/data/filiais";
import type { Database } from "@/lib/supabase/types";
import {
  codigoNumerico,
  ehProblema,
  ehStatusPendencia,
  pendenciaAberta,
  prioridadePendencia,
  type GrupoItem,
  type Prioridade,
  type StatusPendencia,
  type TipoArquivoConc,
} from "@/lib/conciliacao/rotulos";
import { CONCILIACOES_DESDE, INICIO_OPERACAO, vencimentoMinimoPendencias } from "@/lib/operacao";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA_ITENS = 100;
/** Igual ao máximo que as ações em lote da central aplicam de uma vez. */
export const TAMANHO_PAGINA_PENDENCIAS = 200;
const LOTE = 1000;

// ---------- filiais (código Trier ↔ unidade) ----------

/** Unidades com código numérico (F301 → 301) e CNPJ, para ligar boleto/título à unidade do sistema. */
export const mapaFiliais = cache(async () => montarMapaFiliais(await createClient()));

/** Mesmo mapa, com um client qualquer (o agente de arquivos não tem sessão de usuário). */
export async function montarMapaFiliais(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase.from("branches").select("id, codigo, nome, cnpj, ativo").order("codigo");
  if (error) throw error;
  const porFilial = new Map<number, { id: string; codigo: string; nome: string }>();
  const porCnpj = new Map<string, number>();
  for (const b of data) {
    const n = codigoNumerico(b.codigo);
    if (n === null) continue;
    porFilial.set(n, { id: b.id, codigo: b.codigo, nome: b.nome });
    const cnpj = (b.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length === 14) porCnpj.set(cnpj, n);
  }
  return { porFilial, porCnpj, codigos: [...porFilial.keys()].sort((a, b) => a - b) };
}

// ---------- arquivos ----------

export type FiltrosArquivos = { tipo?: TipoArquivoConc; q?: string; filial?: number; arquivados: boolean };

export function lerFiltrosArquivos(sp: Record<string, string | string[] | undefined>): FiltrosArquivos {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const tipo = s("tipo");
  const filial = Number.parseInt(s("filial"), 10);
  return {
    tipo: tipo === "dda_ret" || tipo === "dda_planilha" || tipo === "trier" || tipo === "omie" ? tipo : undefined,
    q: s("q") || undefined,
    filial: Number.isFinite(filial) ? filial : undefined,
    arquivados: s("arquivados") === "1",
  };
}

export async function listarArquivos(f: FiltrosArquivos) {
  const supabase = await createClient();
  let consulta = supabase
    .from("conc_arquivos")
    .select("id, tipo, nome, extensao, tamanho, meta, filial, origem, enviado_em, vezes, arquivado_em, motivo_arquivo, quem:profiles!conc_arquivos_enviado_por_fkey(nome)")
    .order("enviado_em", { ascending: false })
    .limit(500);
  consulta = f.arquivados ? consulta.not("arquivado_em", "is", null) : consulta.is("arquivado_em", null);
  if (f.tipo) consulta = consulta.eq("tipo", f.tipo);
  if (f.filial !== undefined) consulta = consulta.eq("filial", f.filial);
  if (f.q) {
    const termo = f.q.replace(/[%_,().\\]/g, " ").trim();
    if (termo) consulta = consulta.ilike("nome", `%${termo}%`);
  }
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}
export type ArquivoLista = Awaited<ReturnType<typeof listarArquivos>>[number];

export const obterArquivo = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_arquivos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
});

/** Arquivos ativos de DDA e do Trier para montar uma nova conciliação. */
export async function arquivosParaConciliar() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conc_arquivos")
    .select("id, tipo, nome, meta, filial, enviado_em, origem")
    .is("arquivado_em", null)
    .in("tipo", ["dda_ret", "dda_planilha", "trier"])
    .order("enviado_em", { ascending: false })
    .limit(400);
  if (error) throw error;
  return { dda: data.filter((a) => a.tipo !== "trier"), trier: data.filter((a) => a.tipo === "trier") };
}

/** Em quantas conciliações cada um destes arquivos entrou (aviso antes de arquivar; arquivar não muda as conciliações já feitas). */
export async function usosDeArquivos(ids: string[]) {
  const usos = new Map<string, number>();
  if (!ids.length) return usos;
  const supabase = await createClient();
  // só as conciliações que tocam esses arquivos, em lotes (a API corta em 1000 linhas sem avisar)
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await supabase.from("conc_conciliacoes").select("arquivos").overlaps("arquivos", ids).order("id").range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    for (const c of data) for (const id of c.arquivos) usos.set(id, (usos.get(id) ?? 0) + 1);
    if (data.length < LOTE) break;
  }
  return usos;
}

// ---------- conciliações ----------

/** Números do que vence de hoje em diante: o resumo gravado na conciliação é a foto inteira, de quando ela foi criada. */
export async function resumoDoPeriodo(conciliacaoId: string) {
  const supabase = await createClient();
  const [{ data, error }, { data: comDesconto }, { count: anomalias }] = await Promise.all([
    supabase.rpc("conc_resumo_periodo", { p_conciliacao: conciliacaoId }),
    supabase.from("conc_itens").select("desconto").eq("conciliacao_id", conciliacaoId).gte("vencimento", INICIO_OPERACAO).not("desconto", "is", null),
    supabase.from("conc_itens").select("id", { count: "exact", head: true }).eq("conciliacao_id", conciliacaoId).gte("vencimento", INICIO_OPERACAO).not("dados->anomalias", "is", null),
  ]);
  if (error) throw error;
  const linhas = data ?? [];
  const total = (grupo: string, campo: "qtd" | "valor" | "qtd_aberto" | "valor_aberto") => linhas.filter((l) => l.grupo === grupo).reduce((s, l) => s + Number(l[campo]), 0);
  const bateu = total("exato", "qtd");
  const conferir = total("aproximado", "qtd");
  const soTrier = total("so_trier", "qtd");
  const soDDA = total("so_dda", "qtd");
  const valorBateu = total("exato", "valor");
  const valorConferir = total("aproximado", "valor");
  const valorSoTrier = total("so_trier", "valor");
  const valorSoDDA = total("so_dda", "valor");
  const qtdTrier = bateu + conferir + soTrier;
  const totalTrier = valorBateu + valorConferir + valorSoTrier;
  const desconto = { noVencimento: { qtd: 0, valor: 0 }, soAntecipado: { qtd: 0, valor: 0 } };
  for (const { desconto: d } of comDesconto ?? []) {
    const item = d as { valor?: number; noVencimento?: boolean | null } | null;
    const alvo = item?.noVencimento ? desconto.noVencimento : item?.noVencimento === false ? desconto.soAntecipado : null;
    if (alvo) {
      alvo.qtd += 1;
      alvo.valor += Number(item?.valor ?? 0);
    }
  }
  const filiais = new Map<string, { filial: string; titulos: number; boletos: number; exatos: number; conferir: number; soTrier: number; soDDA: number; valorSoTrier: number; valorSoDDA: number }>();
  for (const l of linhas) {
    const chave = l.filial == null ? "—" : String(l.filial);
    const f = filiais.get(chave) ?? { filial: chave, titulos: 0, boletos: 0, exatos: 0, conferir: 0, soTrier: 0, soDDA: 0, valorSoTrier: 0, valorSoDDA: 0 };
    const qtd = Number(l.qtd);
    const aberto = Number(l.qtd_aberto);
    if (l.grupo !== "so_dda") f.titulos += qtd;
    if (l.grupo !== "so_trier") f.boletos += qtd;
    // títulos, boletos e exatos são o retrato do período; o resto é o que falta tratar, como nas abas
    if (l.grupo === "exato") f.exatos += qtd;
    else if (l.grupo === "aproximado") f.conferir += aberto;
    else if (l.grupo === "so_trier") {
      f.soTrier += aberto;
      f.valorSoTrier += Number(l.valor_aberto);
    } else {
      f.soDDA += aberto;
      f.valorSoDDA += Number(l.valor_aberto);
    }
    filiais.set(chave, f);
  }
  return {
    bateu,
    conferir,
    soTrier,
    soDDA,
    valorSoTrier,
    valorSoDDA,
    /** O que falta tratar: sem o que já foi enviado ao Omie. É o mesmo número das abas. */
    aberto: {
      conferir: total("aproximado", "qtd_aberto"),
      soTrier: total("so_trier", "qtd_aberto"),
      soDDA: total("so_dda", "qtd_aberto"),
      valorSoTrier: total("so_trier", "valor_aberto"),
      valorSoDDA: total("so_dda", "valor_aberto"),
    },
    qtdTrier,
    totalTrier,
    qtdDda: bateu + conferir + soDDA,
    totalDda: valorBateu + valorConferir + valorSoDDA,
    pctBateu: qtdTrier ? bateu / qtdTrier : 0,
    pctValorBateu: totalTrier ? valorBateu / totalTrier : 0,
    desconto,
    anomalias: anomalias ?? 0,
    porFilial: [...filiais.values()].sort((a, b) => (a.filial === "—" ? 1 : b.filial === "—" ? -1 : Number(a.filial) - Number(b.filial))),
  };
}

export async function listarConciliacoes(limite = 30) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conc_conciliacoes")
    .select("id, titulo, criado_em, fil_min, fil_max, qtd_trier, qtd_dda, total_trier, total_dda, total_so_dda, pct_bateu, pct_valor_bateu, venc_ini, venc_fim, resumo, quem:profiles!conc_conciliacoes_criado_por_fkey(nome)")
    .gte("criado_em", CONCILIACOES_DESDE)
    .order("criado_em", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}
export type ConciliacaoLista = Awaited<ReturnType<typeof listarConciliacoes>>[number];

export const obterConciliacao = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conc_conciliacoes")
    .select("*, quem:profiles!conc_conciliacoes_criado_por_fkey(nome)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

/** Data (aaaa-mm-dd) vinda do endereço; o resto é ignorado. */
const diaDoParametro = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export type FiltrosItens = { grupo: GrupoItem | "descontos" | "enviados"; q?: string; filial?: number; categoria?: string; anomalias?: boolean; vencDe?: string; vencAte?: string; pagina: number };

export function lerFiltrosItens(sp: Record<string, string | string[] | undefined>): FiltrosItens {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const grupo = s("aba");
  const filial = Number.parseInt(s("filial"), 10);
  const pagina = Number.parseInt(s("pagina"), 10);
  return {
    grupo: grupo === "aproximado" || grupo === "so_trier" || grupo === "so_dda" || grupo === "descontos" || grupo === "enviados" ? grupo : "exato",
    q: s("q") || undefined,
    filial: Number.isFinite(filial) ? filial : undefined,
    categoria: s("categoria") || undefined,
    anomalias: s("anomalias") === "1" || undefined,
    vencDe: diaDoParametro(s("venc_de")),
    vencAte: diaDoParametro(s("venc_ate")),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

function consultaItens<C extends string>(supabase: Awaited<ReturnType<typeof createClient>>, conciliacaoId: string, f: FiltrosItens, colunas: C, opcoes?: { count: "exact" }) {
  let consulta = supabase.from("conc_itens").select(colunas, opcoes).eq("conciliacao_id", conciliacaoId).gte("vencimento", INICIO_OPERACAO);
  // o que já foi enviado ao Omie sai das listas e fica só na aba Enviados
  consulta = f.grupo === "enviados" ? consulta.not("enviado_em", "is", null) : consulta.is("enviado_em", null);
  if (f.grupo === "descontos") consulta = consulta.not("desconto", "is", null);
  else if (f.grupo !== "enviados") consulta = consulta.eq("grupo", f.grupo);
  if (f.filial !== undefined) consulta = consulta.eq("filial", f.filial);
  if (f.categoria) consulta = consulta.eq("categoria", f.categoria);
  if (f.anomalias) consulta = consulta.not("dados->anomalias", "is", null);
  if (f.vencDe) consulta = consulta.gte("vencimento", f.vencDe);
  if (f.vencAte) consulta = consulta.lte("vencimento", f.vencAte);
  if (f.q) {
    const termo = f.q.replace(/[%_,().\\]/g, " ").trim();
    if (termo) {
      const like = `%${termo}%`;
      consulta = consulta.or(`beneficiario.ilike.${like},fornecedor.ilike.${like},documento.ilike.${like},numdoc.ilike.${like},cnpj.ilike.${like}`);
    }
  }
  return consulta;
}

/** Todas as contas que a lista mostra com estes filtros, de todas as páginas ("marcar todos desta lista"). */
export async function chavesDoFiltro(conciliacaoId: string, f: FiltrosItens) {
  const supabase = await createClient();
  const chaves = new Set<string>();
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await consultaItens(supabase, conciliacaoId, f, "chave").order("id").range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    for (const l of data) chaves.add(l.chave);
    if (data.length < LOTE) break;
  }
  return [...chaves];
}

type ContagemAbas = Record<GrupoItem | "descontos" | "enviados", number>;

/** Quantas contas cada aba mostra agora, descontando as já enviadas ao Omie. Com datas de vencimento no filtro, conta
 *  só esse período — o mesmo que a lista mostra (antes o número da aba ficava parado no total). */
export async function contagemAbas(conciliacaoId: string, datas: { vencDe?: string; vencAte?: string } = {}): Promise<ContagemAbas> {
  const supabase = await createClient();
  if (!datas.vencDe && !datas.vencAte) {
    const { data, error } = await supabase.rpc("conc_contagem_abas", { p_conciliacao: conciliacaoId });
    if (error) throw error;
    return data as ContagemAbas;
  }
  const abas = ["exato", "aproximado", "so_trier", "so_dda", "descontos", "enviados"] as const;
  const contagens = await Promise.all(
    abas.map(async (grupo) => {
      const { count, error } = await consultaItens(supabase, conciliacaoId, { grupo, vencDe: datas.vencDe, vencAte: datas.vencAte, pagina: 1 }, "id", { count: "exact" }).limit(1);
      if (error) throw error;
      return [grupo, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(contagens) as ContagemAbas;
}

export async function listarItens(conciliacaoId: string, f: FiltrosItens) {
  const supabase = await createClient();
  const inicio = (f.pagina - 1) * TAMANHO_PAGINA_ITENS;
  const { data, error, count } = await consultaItens(supabase, conciliacaoId, f, "*", { count: "exact" })
    .order("vencimento", { ascending: true })
    .order("beneficiario", { ascending: true })
    .range(inicio, inicio + TAMANHO_PAGINA_ITENS - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA_ITENS)) };
}
export type ItemConciliacao = Awaited<ReturnType<typeof listarItens>>["itens"][number];

/** Todas as linhas de uma conciliação (para exportar/agrupar), lidas em lotes. */
export async function todosItens(conciliacaoId: string) {
  const supabase = await createClient();
  const linhas: ItemConciliacao[] = [];
  for (let inicio = 0; ; inicio += LOTE) {
    const { data, error } = await supabase
      .from("conc_itens")
      .select("*")
      .eq("conciliacao_id", conciliacaoId)
      .order("vencimento")
      .order("id")
      .range(inicio, inicio + LOTE - 1);
    if (error) throw error;
    linhas.push(...data);
    if (data.length < LOTE) break;
  }
  return linhas;
}

// ---------- pendências ----------

export type FiltrosPendencias = {
  status: "abertas" | "todas" | StatusPendencia;
  prioridade?: Prioridade;
  problema?: string;
  filial?: number;
  responsavel?: string; // uuid | "sem" | "eu"
  q?: string;
  /** Vencimento entre estas datas (aaaa-mm-dd). */
  vencDe?: string;
  vencAte?: string;
  /** Varela (filiais abaixo de 300) ou Nazário (300 em diante). */
  empresa?: "varela" | "nazario";
  /** Beneficiários que saem da lista (nome exato, sem diferença de maiúsculas), como o filtro de coluna do Omie. */
  semBeneficiarios: string[];
  ordem: "prioridade" | "vencimento" | "valor" | "filial" | "antigas";
};

/** Chave para comparar nomes de beneficiário (maiúsculas, espaços únicos). */
export const chaveBeneficiario = (nome: string | null | undefined) => (nome ?? "").trim().replace(/\s+/g, " ").toUpperCase();

export function lerFiltrosPendencias(sp: Record<string, string | string[] | undefined>): FiltrosPendencias {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const status = s("status");
  const pri = Number.parseInt(s("prioridade"), 10);
  const filial = Number.parseInt(s("filial"), 10);
  const ordem = s("ordem");
  const problema = s("problema");
  const empresa = s("empresa");
  // vários nomes num parâmetro só, separados por "|" (cabe na paginação e no "voltar")
  const sem = [sp.sem].flat().flatMap((v) => (typeof v === "string" ? v.split("|") : [])).map((v) => v.trim()).filter(Boolean);
  return {
    empresa: empresa === "varela" || empresa === "nazario" ? empresa : undefined,
    semBeneficiarios: [...new Set(sem)].slice(0, 300),
    vencDe: diaDoParametro(s("venc_de")),
    vencAte: diaDoParametro(s("venc_ate")),
    status: status === "todas" || ehStatusPendencia(status) ? status : "abertas",
    prioridade: pri === 1 || pri === 2 || pri === 3 ? pri : undefined,
    problema: ehProblema(problema) ? problema : undefined,
    filial: Number.isFinite(filial) ? filial : undefined,
    responsavel: s("responsavel") || undefined,
    q: s("q") || undefined,
    ordem: ordem === "vencimento" || ordem === "valor" || ordem === "filial" || ordem === "antigas" ? ordem : "prioridade",
  };
}

/** Todas as pendências com os filtros: a busca e a prioridade são calculadas aqui, então a leitura não pode parar no limite de linhas da API. */
export async function listarPendencias(f: FiltrosPendencias, usuarioId: string) {
  const supabase = await createClient();
  const lerLote = (inicio: number) => {
    let consulta = supabase
      .from("conc_pendencias")
      .select(
        "chave, problema, filial, beneficiario, cnpj, documento, valor, vencimento, detalhe, status, auto, motivo, decidido_em, criado_em, quem_resp:profiles!conc_pendencias_responsavel_fkey(nome), quem_dec:profiles!conc_pendencias_decidido_por_fkey(nome)",
        // só o primeiro lote precisa contar: contar em todos deixava a tela bem mais lenta
        { count: inicio === 0 ? "exact" : undefined },
      );
    // em aberto: só o que vence de hoje em diante (o vencido até ontem sai da lista); resolvidas, ignoradas e "Todas" mostram tudo
    const emAberto = f.status === "abertas" || f.status === "pendente" || f.status === "em_analise";
    consulta = consulta.gte("vencimento", emAberto ? vencimentoMinimoPendencias() : INICIO_OPERACAO);
    if (f.status === "abertas") consulta = consulta.in("status", ["pendente", "em_analise"]);
    else if (f.status !== "todas") consulta = consulta.eq("status", f.status);
    if (f.problema) consulta = consulta.eq("problema", f.problema);
    if (f.filial !== undefined) consulta = consulta.eq("filial", f.filial);
    if (f.empresa === "varela") consulta = consulta.lt("filial", 300);
    else if (f.empresa === "nazario") consulta = consulta.gte("filial", 300);
    if (f.responsavel === "sem") consulta = consulta.is("responsavel", null);
    else if (f.responsavel === "eu") consulta = consulta.eq("responsavel", usuarioId);
    else if (f.responsavel && ehUuid(f.responsavel)) consulta = consulta.eq("responsavel", f.responsavel);
    if (f.vencDe) consulta = consulta.gte("vencimento", f.vencDe);
    if (f.vencAte) consulta = consulta.lte("vencimento", f.vencAte);
    return consulta.order("chave").range(inicio, inicio + LOTE - 1);
  };
  const primeiro = await lerLote(0);
  if (primeiro.error) throw primeiro.error;
  const faltam = Math.max(0, Math.ceil((primeiro.count ?? 0) / LOTE) - 1);
  const resto = await Promise.all(Array.from({ length: faltam }, (_, i) => lerLote((i + 1) * LOTE)));
  const data = [...primeiro.data];
  for (const r of resto) {
    if (r.error) throw r.error;
    data.push(...r.data);
  }

  const termo = f.q ? f.q.toUpperCase() : "";
  const filtradas = data
    .map((p) => ({ ...p, prioridade: prioridadePendencia(p) }))
    .filter((p) => !f.prioridade || p.prioridade === f.prioridade)
    .filter((p) => !termo || [p.beneficiario, p.cnpj, p.documento, p.detalhe, p.motivo, String(p.valor)].join(" ").toUpperCase().includes(termo));
  // a lista de beneficiários (para tirar) sai do que os outros filtros mostram, antes de tirar: o que foi tirado continua marcável
  const porBenef = new Map<string, { nome: string; qtd: number; valor: number }>();
  for (const p of filtradas) {
    const k = chaveBeneficiario(p.beneficiario);
    const b = porBenef.get(k) ?? { nome: (p.beneficiario ?? "").trim() || "(sem beneficiário)", qtd: 0, valor: 0 };
    b.qtd += 1;
    b.valor += Number(p.valor);
    porBenef.set(k, b);
  }
  const tirar = new Set(f.semBeneficiarios.map(chaveBeneficiario));
  const lista = tirar.size ? filtradas.filter((p) => !tirar.has(chaveBeneficiario(p.beneficiario))) : filtradas;
  const beneficiarios = [...porBenef.entries()].map(([chave, b]) => ({ chave, ...b, tirado: tirar.has(chave) })).sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome));
  const venc = (p: { vencimento: string | null }) => p.vencimento ?? "9999-12-31";
  const cmp: Record<FiltrosPendencias["ordem"], (a: (typeof lista)[number], b: (typeof lista)[number]) => number> = {
    prioridade: (a, b) => b.prioridade - a.prioridade || venc(a).localeCompare(venc(b)) || Number(b.valor) - Number(a.valor),
    vencimento: (a, b) => venc(a).localeCompare(venc(b)) || b.prioridade - a.prioridade,
    valor: (a, b) => Number(b.valor) - Number(a.valor),
    filial: (a, b) => (a.filial ?? 9999) - (b.filial ?? 9999) || b.prioridade - a.prioridade,
    antigas: (a, b) => a.criado_em.localeCompare(b.criado_em),
  };
  return { lista: lista.sort(cmp[f.ordem]), beneficiarios };
}
export type PendenciaLista = Awaited<ReturnType<typeof listarPendencias>>["lista"][number];
export type BeneficiarioPendencia = Awaited<ReturnType<typeof listarPendencias>>["beneficiarios"][number];

/** Código de barras das pendências: fica no boleto gravado nos itens da conciliação. A mesma conta aparece em várias conciliações, daí os lotes pequenos. */
export async function barrasDasPendencias(chaves: string[]) {
  const supabase = await createClient();
  const lotes = Array.from({ length: Math.ceil(chaves.length / 100) }, (_, i) => chaves.slice(i * 100, (i + 1) * 100));
  const respostas = await Promise.all(lotes.map((lote) => supabase.from("conc_itens").select("chave, barra").in("chave", lote).not("barra", "is", null)));
  const mapa = new Map<string, string>();
  for (const { data, error } of respostas) {
    if (error) throw error;
    for (const l of data) if (l.barra) mapa.set(l.chave, l.barra);
  }
  return mapa;
}

export async function resumoPendencias() {
  const supabase = await createClient();
  // lida em lotes: a API corta em 1.000 linhas e o quadro somava só as primeiras 1.000 pendências
  const lerLote = (inicio: number) =>
    supabase
      .from("conc_pendencias")
      .select("chave, status, problema, valor, vencimento, filial", { count: inicio === 0 ? "exact" : undefined })
      .in("status", ["pendente", "em_analise"])
      .gte("vencimento", vencimentoMinimoPendencias())
      .order("chave")
      .range(inicio, inicio + LOTE - 1);
  const primeiro = await lerLote(0);
  if (primeiro.error) throw primeiro.error;
  const faltam = Math.max(0, Math.ceil((primeiro.count ?? 0) / LOTE) - 1);
  const resto = await Promise.all(Array.from({ length: faltam }, (_, i) => lerLote((i + 1) * LOTE)));
  const data = [...primeiro.data];
  for (const r of resto) {
    if (r.error) throw r.error;
    data.push(...r.data);
  }
  const porPrioridade: Record<Prioridade, { qtd: number; valor: number }> = { 3: { qtd: 0, valor: 0 }, 2: { qtd: 0, valor: 0 }, 1: { qtd: 0, valor: 0 } };
  const porFilial = new Map<number | null, { qtd: number; valor: number }>();
  let valorTotal = 0;
  for (const p of data) {
    if (!pendenciaAberta(p.status)) continue;
    const pri = prioridadePendencia(p);
    porPrioridade[pri].qtd += 1;
    porPrioridade[pri].valor += Number(p.valor);
    valorTotal += Number(p.valor);
    const f = porFilial.get(p.filial) ?? { qtd: 0, valor: 0 };
    f.qtd += 1;
    f.valor += Number(p.valor);
    porFilial.set(p.filial, f);
  }
  return {
    abertas: data.length,
    valorTotal,
    porPrioridade,
    porFilial: [...porFilial.entries()].map(([filial, v]) => ({ filial, ...v })).sort((a, b) => b.qtd - a.qtd),
  };
}

/** Quem pode cuidar de pendência (admin e financeiro ativos). */
export async function listarResponsaveis() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, nome, papel").eq("ativo", true).or("papel.in.(admin,financeiro),admin_sistema.eq.true").order("nome");
  if (error) throw error;
  return data;
}

// ---------- de-para, aprendizado, config, enviados ----------

export const listarDePara = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_depara").select("*").order("dda");
  if (error) throw error;
  return data;
});

export const listarAprendizado = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_aprendizado").select("*").order("fornecedor");
  if (error) throw error;
  return data;
});

export const obterConfig = cache(async <T,>(chave: string, padrao: T): Promise<T> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_config").select("valor").eq("chave", chave).maybeSingle();
  if (error) throw error;
  return (data?.valor as T | undefined) ?? padrao;
});

/** Chaves já enviadas ao Omie (e não desfeitas). */
export async function chavesEnviadas(chaves: string[]) {
  if (chaves.length === 0) return new Map<string, { enviado_em: string; via: string }>();
  const supabase = await createClient();
  const mapa = new Map<string, { enviado_em: string; via: string }>();
  for (let i = 0; i < chaves.length; i += 500) {
    const { data, error } = await supabase
      .from("conc_enviados_omie")
      .select("chave, enviado_em, via")
      .in("chave", chaves.slice(i, i + 500))
      .is("desfeito_em", null);
    if (error) throw error;
    for (const e of data) mapa.set(e.chave, { enviado_em: e.enviado_em, via: e.via });
  }
  return mapa;
}

// ---------- painel ----------

export async function painelConciliacao() {
  const supabase = await createClient();
  const [ultimas, pendencias, { data: arquivos, error }] = await Promise.all([
    listarConciliacoes(8),
    resumoPendencias(),
    supabase.from("conc_arquivos").select("tipo, enviado_em, origem").is("arquivado_em", null).order("enviado_em", { ascending: false }).limit(1000),
  ]);
  if (error) throw error;
  const porTipo: Record<string, number> = {};
  for (const a of arquivos) porTipo[a.tipo] = (porTipo[a.tipo] ?? 0) + 1;
  const periodo = ultimas[0] ? await resumoDoPeriodo(ultimas[0].id) : null;
  return { ultimas, periodo, pendencias, arquivos: { total: arquivos.length, porTipo, ultimo: arquivos[0]?.enviado_em ?? null } };
}
