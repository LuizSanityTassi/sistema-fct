// Chamados nos grupos de WhatsApp dos setores (só servidor). O agente do escritório (Desktop\agente-whatsapp) conecta um
// número pelo QR code e pergunta ao portal o que mandar; a chave dele fica só como SHA-256 em wpp_agente.token_hash.
import { CATEGORIA_CHAMADO_LABEL, PRIORIDADE_LABEL, type CategoriaChamado } from "@/lib/chamados/rotulos";
import { rotuloTipo } from "@/lib/chamados/tipos";
import { SITE } from "@/lib/email";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Nome do setor no grupo (RH e DP ficam juntos no grupo do RH). */
export const SETOR_WPP: Record<CategoriaChamado, string> = { ...CATEGORIA_CHAMADO_LABEL, rh: "RH / DP" };

export type ItemFila = { id: number; grupo: string; mensagem: string };

/** Texto do chamado novo para o grupo (formatação do WhatsApp: *negrito*). */
export async function mensagemDoChamado(admin: Admin, ticketId: string): Promise<string | null> {
  const { data: t } = await admin
    .from("tickets")
    .select("id, numero, titulo, descricao, categoria, subcategoria, prioridade, branch_id, solicitante")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return null;
  const [{ data: filial }, { data: quem }] = await Promise.all([
    t.branch_id ? admin.from("branches").select("codigo, nome").eq("id", t.branch_id).maybeSingle() : Promise.resolve({ data: null }),
    t.solicitante ? admin.from("profiles").select("nome").eq("id", t.solicitante).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const tipo = rotuloTipo(t.subcategoria);
  const descricao = (t.descricao ?? "").trim();
  const linhas = [
    `🎫 *Novo chamado #${t.numero}* — ${SETOR_WPP[t.categoria]}`,
    `*${t.titulo}*`,
    [tipo ? `Tipo: ${tipo}` : null, filial ? `Filial: ${filial.codigo} ${filial.nome}` : null, `Prioridade: ${PRIORIDADE_LABEL[t.prioridade]}`].filter(Boolean).join(" · "),
    quem?.nome ? `Aberto por: ${quem.nome}` : null,
    descricao ? `\n${descricao.length > 600 ? `${descricao.slice(0, 600)}…` : descricao}` : null,
    `\n🔗 ${SITE}/chamados/${t.id}`,
  ];
  return linhas.filter((l) => l !== null).join("\n");
}

/** Pendências da fila para o agente (até 20, as mais antigas primeiro; desiste depois de 5 tentativas ou 2 dias). */
export async function pendentesDaFila(admin: Admin): Promise<ItemFila[]> {
  const limite = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
  const { data } = await admin
    .from("wpp_fila")
    .select("id, ticket_id, grupo_jid, mensagem")
    .is("enviado_em", null)
    .lt("tentativas", 5)
    .gte("criado_em", limite)
    .order("criado_em")
    .limit(20);
  const out: ItemFila[] = [];
  for (const f of data ?? []) {
    const mensagem = f.mensagem ?? (f.ticket_id ? await mensagemDoChamado(admin, f.ticket_id) : null);
    if (mensagem) out.push({ id: f.id, grupo: f.grupo_jid, mensagem });
    else await admin.from("wpp_fila").update({ tentativas: 5, erro: "chamado não encontrado" }).eq("id", f.id);
  }
  return out;
}
