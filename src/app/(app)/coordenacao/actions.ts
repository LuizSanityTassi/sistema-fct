"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ITENS_CHECKLIST, linhasDeTexto } from "@/lib/coordenacao/checklist";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ROTA = "/coordenacao";

export type EstadoChecklist = { erro?: string; erros?: Record<string, string>; id?: string };
export type EstadoAcao = { erro?: string; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Coordenador grava o checklist da visita. O banco carimba quem fez, confere a loja e o gerente e calcula a média. */
export async function salvarChecklist(_prev: EstadoChecklist, fd: FormData): Promise<EstadoChecklist> {
  const sessao = await getSessao();
  const erros: Record<string, string> = {};
  const branch_id = texto(fd, "branch_id");
  const gerente_id = texto(fd, "gerente_id");
  const data = texto(fd, "data");
  if (!UUID.test(branch_id)) erros.branch_id = "Escolha a loja.";
  if (!UUID.test(gerente_id)) erros.gerente_id = "Escolha o gerente.";
  if (!DATA.test(data)) erros.data = "Informe a data da visita.";
  else if (data > hojeBrasil()) erros.data = "A visita não pode ser no futuro.";
  const notas = ITENS_CHECKLIST.map((i) => ({ chave: i.chave, item: i.item, nota: texto(fd, `nota_${i.chave}`) === "" ? NaN : Number(texto(fd, `nota_${i.chave}`)) }));
  const semNota = notas.filter((n) => !Number.isInteger(n.nota) || n.nota < 0 || n.nota > 5);
  if (semNota.length) erros.notas = semNota.length === 1 ? `Falta avaliar: ${semNota[0].item}.` : `Faltam ${semNota.length} itens para avaliar.`;
  const direcionamentos = linhasDeTexto(texto(fd, "direcionamentos"));
  const acordos = linhasDeTexto(texto(fd, "acordos"));
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { data: novo, error } = await supabase.from("coord_checklists").insert({ branch_id, gerente_id, data, notas, direcionamentos, acordos }).select("id").single();
  if (error) {
    if (error.code === "42501" || /row-level security/i.test(error.message)) return { erro: "Você não pode fazer checklist nessa loja." };
    return { erro: `Não consegui gravar: ${error.message}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "coord_checklists", registroId: novo.id, novo: { branch_id, gerente_id, data } });
  revalidatePath(ROTA);
  return { id: novo.id };
}

/** Gerente confirma (ciente e de acordo) ou diz que não concorda; quem fez cancela com motivo. O banco confere quem pode. */
export async function responderChecklist(id: string, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Checklist inválido." };
  const acao = texto(fd, "acao");
  const nota = texto(fd, "nota").slice(0, 1000);
  let patch: { situacao: string; resposta_comentario?: string | null; motivo_cancelamento?: string };
  if (acao === "confirmar") patch = { situacao: "confirmado", resposta_comentario: nota || null };
  else if (acao === "contestar") {
    if (nota.length < 5) return { erro: "Conte por que não concorda (pelo menos 5 letras)." };
    patch = { situacao: "contestado", resposta_comentario: nota };
  } else if (acao === "cancelar") {
    if (nota.length < 5) return { erro: "Conte o motivo do cancelamento (pelo menos 5 letras)." };
    patch = { situacao: "cancelado", motivo_cancelamento: nota.slice(0, 500) };
  } else return { erro: "Ação inválida." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("coord_checklists").update(patch).eq("id", id).eq("situacao", "aguardando").select("situacao").maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Este checklist já foi respondido ou você não pode mudá-lo." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: acao === "cancelar" ? "inativar" : "editar", entidade: "coord_checklists", registroId: id, novo: { situacao: data.situacao, comentario: nota || null } });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ok: acao === "confirmar" ? "Confirmado. O coordenador já vê a sua confirmação." : acao === "contestar" ? "Registrado que você não concorda. O coordenador vai ver o motivo." : "Checklist cancelado." };
}
