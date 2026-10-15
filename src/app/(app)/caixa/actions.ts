"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoJustificativa = { erro?: string; ok?: string };

/** Justificativa de quem responde pelo caixa. A função do banco confere se a pessoa pode (caixa_justificar). */
export async function justificarQuebra(id: string, _prev: EstadoJustificativa, fd: FormData): Promise<EstadoJustificativa> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Caixa inválido." };
  const textoBruto = fd.get("justificativa");
  const justificativa = typeof textoBruto === "string" ? textoBruto.trim() : "";
  if (justificativa.length < 10) return { erro: "Conte o que aconteceu (pelo menos 10 letras)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("caixa_justificar", { p_id: id, p_texto: justificativa.slice(0, 2000) });
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_diferencas", registroId: id, novo: { justificou: true } });
  revalidatePath("/caixa");
  revalidatePath("/financeiro/diferenca-caixa");
  return { ok: "Justificativa enviada ao financeiro." };
}
