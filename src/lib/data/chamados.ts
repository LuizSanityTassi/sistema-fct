import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";
import type { CategoriaChamado, PrioridadeChamado, StatusChamado } from "@/lib/chamados/rotulos";
import { STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";

export const TAMANHO_PAGINA = 25;

export type VisaoChamados = "todos" | "meus" | "atendo";
export type StatusFiltro = "abertos" | "encerrados" | "todos" | StatusChamado;
export type FiltrosChamados = {
  q?: string;
  visao: VisaoChamados;
  status: StatusFiltro;
  categoria?: CategoriaChamado;
  prioridade?: PrioridadeChamado;
  filial?: string;
  pagina: number;
};

export function lerFiltrosChamados(sp: Record<string, string | string[] | undefined>): FiltrosChamados {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const visao = s("visao");
  const status = s("status");
  const categoria = s("categoria");
  const prioridade = s("prioridade");
  return {
    q: s("q") || undefined,
    visao: visao === "meus" || visao === "atendo" ? visao : "todos",
    status:
      status === "encerrados" || status === "todos" || status in STATUS_CHAMADO_LABEL
        ? (status as StatusFiltro)
        : "abertos",
    categoria: categoria ? (categoria as CategoriaChamado) : undefined,
    prioridade: prioridade ? (prioridade as PrioridadeChamado) : undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

const SELECAO_LISTA =
  "id, numero, titulo, categoria, prioridade, status, created_at, updated_at, resolved_at, branch_id, solicitante, responsavel, unidade:branches(id, codigo, nome), quem_abriu:profiles!tickets_solicitante_fkey(id, nome), quem_atende:profiles!tickets_responsavel_fkey(id, nome)";

export async function listarChamados(f: FiltrosChamados, usuarioId: string) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase.from("tickets").select(SELECAO_LISTA, { count: "exact" });
  if (f.visao === "meus") consulta = consulta.eq("solicitante", usuarioId);
  if (f.visao === "atendo") consulta = consulta.eq("responsavel", usuarioId);
  if (f.status === "abertos") consulta = consulta.not("status", "in", "(resolvido,cancelado)");
  else if (f.status === "encerrados") consulta = consulta.in("status", ["resolvido", "cancelado"]);
  else if (f.status !== "todos") consulta = consulta.eq("status", f.status);
  if (f.categoria) consulta = consulta.eq("categoria", f.categoria);
  if (f.prioridade) consulta = consulta.eq("prioridade", f.prioridade);
  if (f.filial) consulta = consulta.eq("branch_id", f.filial);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) {
      const numero = Number.parseInt(termo, 10);
      consulta = Number.isFinite(numero) && String(numero) === termo
        ? consulta.eq("numero", numero)
        : consulta.ilike("titulo", `%${termo}%`);
    }
  }
  const { data, error, count } = await consulta
    .order("updated_at", { ascending: false })
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

export type ChamadoLista = Awaited<ReturnType<typeof listarChamados>>["itens"][number];

/** Contadores do topo (só o que o usuário enxerga pelo RLS). */
export async function resumoChamados() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tickets").select("status, responsavel, resolved_at");
  if (error) throw error;
  const limite = Date.now() - 30 * 86_400_000;
  const r = { semResponsavel: 0, emAndamento: 0, aguardando: 0, resolvidos30: 0 };
  for (const t of data) {
    if (t.status === "aberto" && !t.responsavel) r.semResponsavel += 1;
    if (t.status === "em_analise" || t.status === "em_atendimento" || (t.status === "aberto" && t.responsavel)) r.emAndamento += 1;
    if (t.status === "aguardando_usuario" || t.status === "aguardando_terceiro") r.aguardando += 1;
    if (t.status === "resolvido" && t.resolved_at && Date.parse(t.resolved_at) >= limite) r.resolvidos30 += 1;
  }
  return r;
}

export async function obterChamado(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select(`${SELECAO_LISTA}, descricao, subcategoria`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type ChamadoDetalhe = NonNullable<Awaited<ReturnType<typeof obterChamado>>>;

export type ItemLinhaDoTempo = {
  id: string;
  tipo: "comentario" | "historico" | "anexo";
  quando: string;
  autor: string | null;
  texto?: string;
  acao?: string;
  de?: string | null;
  para?: string | null;
  anexo?: { id: string; nome: string };
};

/** Comentários, mudanças e anexos do chamado em ordem cronológica. */
export async function linhaDoTempo(ticketId: string): Promise<ItemLinhaDoTempo[]> {
  const supabase = await createClient();
  const [c, h, a] = await Promise.all([
    supabase
      .from("ticket_comments")
      .select("id, comentario, created_at, autor:profiles(nome)")
      .eq("ticket_id", ticketId),
    supabase
      .from("ticket_history")
      .select("id, acao, de, para, created_at, autor:profiles(nome)")
      .eq("ticket_id", ticketId),
    supabase
      .from("ticket_attachments")
      .select("id, nome, created_at, autor:profiles(nome)")
      .eq("ticket_id", ticketId),
  ]);
  if (c.error) throw c.error;
  if (h.error) throw h.error;
  if (a.error) throw a.error;
  const itens: ItemLinhaDoTempo[] = [
    ...c.data.map((x) => ({ id: x.id, tipo: "comentario" as const, quando: x.created_at, autor: x.autor?.nome ?? null, texto: x.comentario })),
    ...h.data.map((x) => ({ id: x.id, tipo: "historico" as const, quando: x.created_at, autor: x.autor?.nome ?? null, acao: x.acao, de: x.de, para: x.para })),
    ...a.data.map((x) => ({ id: x.id, tipo: "anexo" as const, quando: x.created_at, autor: x.autor?.nome ?? null, anexo: { id: x.id, nome: x.nome } })),
  ];
  return itens.sort((x, y) => x.quando.localeCompare(y.quando));
}

/** Pessoas que podem atender (admin/TI/RH/Financeiro). Vazio para quem não enxerga os perfis. */
export async function listarAtendentes() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, papel")
    .in("papel", ["admin", "ti", "rh", "financeiro"])
    .eq("ativo", true)
    .order("nome");
  if (error) return [];
  return data;
}

export async function obterAnexo(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("ticket_attachments").select("id, nome, storage_path").eq("id", id).maybeSingle();
  return data ? { nome: data.nome, storage_path: data.storage_path } : null;
}
