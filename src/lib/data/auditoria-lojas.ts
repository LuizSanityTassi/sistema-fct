// Auditoria de lojas (checklist e precificação): leitura. Quem vê o quê fica com a RLS (quem audita a loja — admin,
// financeiro, coordenador da regional —, quem fez e o gerente da loja).
import { diaBrasil } from "@/lib/auditoria/checklist";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA_AUDITORIA = 30;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type FiltrosAuditoria = { modo: "regional" | "filial"; regional?: string; filial?: string; de: string; ate: string; pagina: number };

/** Filtros da pesquisa: Regional ou Filial, De/Até (padrão: os últimos 7 dias). */
export function lerFiltrosAuditoria(sp: Record<string, string | string[] | undefined>): FiltrosAuditoria {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  let de = DATA.test(s("de")) ? s("de") : diaBrasil(-6);
  let ate = DATA.test(s("ate")) ? s("ate") : diaBrasil();
  if (de > ate) [de, ate] = [ate, de];
  const modo = s("modo") === "filial" ? "filial" : "regional";
  return {
    modo,
    regional: modo === "regional" && s("regional") ? s("regional").slice(0, 60) : undefined,
    filial: modo === "filial" && ehUuid(s("filial")) ? s("filial") : undefined,
    de,
    ate,
    pagina: Math.max(1, Number(s("pagina")) || 1),
  };
}

export const paramsDosFiltros = (f: FiltrosAuditoria): Record<string, string | undefined> => ({ modo: f.modo, regional: f.regional, filial: f.filial, de: f.de, ate: f.ate });

/** Início e fim do período no horário de Brasília. */
const inicioDia = (d: string) => `${d}T00:00:00-03:00`;
const fimDia = (d: string) => `${d}T23:59:59.999-03:00`;

/** Lojas que a pessoa pode auditar (com regional, CNPJ e o gerente do cadastro da filial). */
export async function lojasAuditaveis() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("aud_lojas");
  if (error) throw error;
  return data ?? [];
}

export const regionaisDe = (lojas: { regional: string | null }[]) => [...new Set(lojas.map((l) => l.regional).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, "pt-BR"));

// ---------------------------------------------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------------------------------------------
const COLUNAS_CHECKLIST = "id, numero, branch_id, gerente_nome, auditor_id, auditor_nome, aberto_em, finalizado_em, situacao, respostas, filial:branches!inner(codigo, nome, regional)";

export async function listarChecklistsAuditoria(f: FiltrosAuditoria) {
  const supabase = await createClient();
  let q = supabase.from("aud_checklists").select(COLUNAS_CHECKLIST, { count: "exact" }).gte("finalizado_em", inicioDia(f.de)).lte("finalizado_em", fimDia(f.ate));
  if (f.filial) q = q.eq("branch_id", f.filial);
  if (f.regional) q = q.eq("filial.regional", f.regional);
  const ini = (f.pagina - 1) * TAMANHO_PAGINA_AUDITORIA;
  const { data, count, error } = await q.order("finalizado_em", { ascending: false }).range(ini, ini + TAMANHO_PAGINA_AUDITORIA - 1);
  if (error) throw error;
  return { itens: data ?? [], total: count ?? 0 };
}

export async function obterChecklistAuditoria(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aud_checklists")
    .select("*, filial:branches(codigo, nome, cnpj, razao_social, regional, endereco, cidade, estado)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------------------------------------------------
// Precificação
// ---------------------------------------------------------------------------------------------------------------
const COLUNAS_PREC = "id, numero, branch_id, auditor_id, auditor_nome, aberto_em, finalizado_em, situacao, qtd_verificada, qtd_divergente, observacao, filial:branches!inner(codigo, nome, regional)";

/** Auditorias finalizadas ou canceladas no período (pela data em que foram abertas). */
export async function listarPrecificacoes(f: FiltrosAuditoria) {
  const supabase = await createClient();
  let q = supabase
    .from("aud_precificacoes")
    .select(COLUNAS_PREC, { count: "exact" })
    .neq("situacao", "em_andamento")
    .gte("aberto_em", inicioDia(f.de))
    .lte("aberto_em", fimDia(f.ate));
  if (f.filial) q = q.eq("branch_id", f.filial);
  if (f.regional) q = q.eq("filial.regional", f.regional);
  const ini = (f.pagina - 1) * TAMANHO_PAGINA_AUDITORIA;
  const { data, count, error } = await q.order("aberto_em", { ascending: false }).range(ini, ini + TAMANHO_PAGINA_AUDITORIA - 1);
  if (error) throw error;
  return { itens: data ?? [], total: count ?? 0 };
}

/** Auditorias de precificação abertas (para continuar). */
export async function precificacoesEmAndamento() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("aud_precificacoes").select(COLUNAS_PREC).eq("situacao", "em_andamento").order("aberto_em", { ascending: false }).limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function obterPrecificacao(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const [{ data, error }, { data: itens, error: e2 }] = await Promise.all([
    supabase.from("aud_precificacoes").select("*, filial:branches(codigo, nome, regional)").eq("id", id).maybeSingle(),
    supabase.from("aud_precificacao_itens").select("*").eq("precificacao_id", id).order("criado_em"),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  return data ? { ...data, itens: itens ?? [] } : null;
}

/** Relatório: auditorias finalizadas no período (pela finalização), com os produtos, por filial. Com `id`, só aquela. */
export async function relatorioPrecificacao(f: FiltrosAuditoria, id?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("aud_precificacoes")
    .select(`${COLUNAS_PREC}, itens:aud_precificacao_itens(codigo, produto, valor_sistema, valor_etiqueta, diferenca, criado_em)`)
    .eq("situacao", "finalizada");
  if (id && ehUuid(id)) q = q.eq("id", id);
  else {
    q = q.gte("finalizado_em", inicioDia(f.de)).lte("finalizado_em", fimDia(f.ate));
    if (f.filial) q = q.eq("branch_id", f.filial);
    if (f.regional) q = q.eq("filial.regional", f.regional);
  }
  const { data, error } = await q.order("finalizado_em").limit(500);
  if (error) throw error;
  return (data ?? [])
    .map((a) => ({ ...a, itens: [...(a.itens ?? [])].sort((x, y) => x.criado_em.localeCompare(y.criado_em)) }))
    .sort((a, b) => (a.filial?.codigo ?? "").localeCompare(b.filial?.codigo ?? "") || (a.finalizado_em ?? "").localeCompare(b.finalizado_em ?? ""));
}

// ---------------------------------------------------------------------------------------------------------------
// Base de preços
// ---------------------------------------------------------------------------------------------------------------
export async function resumoBasePrecos() {
  const supabase = await createClient();
  const [{ count }, { data: ultimo }] = await Promise.all([
    supabase.from("aud_precos").select("codigo", { count: "exact", head: true }),
    supabase.from("aud_precos").select("atualizado_em").order("atualizado_em", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return { total: count ?? 0, atualizadoEm: ultimo?.atualizado_em ?? null };
}
