// Checklist da loja (Coordenação): leitura. Quem vê o quê fica com a RLS (admin, quem fez, o gerente escolhido e o
// coordenador da regional da loja).
import { SITUACOES_CHECKLIST, type SituacaoChecklist } from "@/lib/coordenacao/checklist";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA_CHECKLISTS = 30;
const COLUNAS = "id, branch_id, data, coordenador_id, coordenador_nome, gerente_id, gerente_nome, media, situacao, criado_em, respondido_em, filial:branches(codigo, nome)";

export type FiltrosChecklist = { filial?: string; situacao?: SituacaoChecklist; pagina: number };

export function lerFiltrosChecklist(sp: Record<string, string | string[] | undefined>): FiltrosChecklist {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const situacao = s("situacao") in SITUACOES_CHECKLIST ? (s("situacao") as SituacaoChecklist) : undefined;
  return { filial: ehUuid(s("filial")) ? s("filial") : undefined, situacao, pagina: Math.max(1, Number(s("pagina")) || 1) };
}

export async function listarChecklists(f: FiltrosChecklist) {
  const supabase = await createClient();
  let q = supabase.from("coord_checklists").select(COLUNAS, { count: "exact" });
  if (f.filial) q = q.eq("branch_id", f.filial);
  if (f.situacao) q = q.eq("situacao", f.situacao);
  const ini = (f.pagina - 1) * TAMANHO_PAGINA_CHECKLISTS;
  const contar = (sit: SituacaoChecklist) => {
    let c = supabase.from("coord_checklists").select("id", { count: "exact", head: true }).eq("situacao", sit);
    if (f.filial) c = c.eq("branch_id", f.filial);
    return c;
  };
  const [{ data, count, error }, ...contagens] = await Promise.all([
    q.order("data", { ascending: false }).order("criado_em", { ascending: false }).range(ini, ini + TAMANHO_PAGINA_CHECKLISTS - 1),
    ...(Object.keys(SITUACOES_CHECKLIST) as SituacaoChecklist[]).map(contar),
  ]);
  if (error) throw error;
  const qtd = Object.fromEntries((Object.keys(SITUACOES_CHECKLIST) as SituacaoChecklist[]).map((s, i) => [s, contagens[i].count ?? 0])) as Record<SituacaoChecklist, number>;
  return { itens: data ?? [], total: count ?? 0, qtd };
}

export async function obterChecklist(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("coord_checklists").select("*, filial:branches(codigo, nome)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Lojas que a pessoa pode avaliar e os gerentes com usuário (com as lojas de cada um). */
export async function opcoesChecklist() {
  const supabase = await createClient();
  const [{ data: lojas }, { data: gerentes }] = await Promise.all([supabase.rpc("coord_lojas"), supabase.rpc("coord_gerentes")]);
  return { lojas: lojas ?? [], gerentes: gerentes ?? [] };
}

/** Ranking das lojas: média dos checklists (sem os cancelados) no período, por loja, com a regional. */
export async function rankingLojas(de: string, ate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("coord_ranking", { p_de: de, p_ate: ate });
  if (error) throw error;
  return (data ?? []).map((l) => ({
    ...l,
    media: l.media === null ? null : Number(l.media),
    ultima_media: l.ultima_media === null ? null : Number(l.ultima_media),
    anterior_media: l.anterior_media === null ? null : Number(l.anterior_media),
    pior_nota: l.pior_nota === null ? null : Number(l.pior_nota),
  }));
}

/** Checklists esperando a resposta deste gerente (para a central de pendências). */
export async function checklistsParaConfirmar(userId: string) {
  const supabase = await createClient();
  const { count } = await supabase.from("coord_checklists").select("id", { count: "exact", head: true }).eq("gerente_id", userId).eq("situacao", "aguardando");
  return count ?? 0;
}
