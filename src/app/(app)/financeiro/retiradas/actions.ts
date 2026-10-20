"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerFiltrosRetiradas, totaisRetiradas } from "@/lib/data/retiradas";
import { createClient } from "@/lib/supabase/server";

export type EstadoConferenciaRetirada = { erro?: string; ok?: string };

/**
 * Grava a conferência da filial no período pesquisado: totais recalculados aqui (não vêm da tela), "Conferido" e o
 * comentário. Não mexe nas sangrias — cada depósito continua sendo conferido na Conferência de sangrias.
 */
export async function salvarConferenciaRetirada(_prev: EstadoConferenciaRetirada, fd: FormData): Promise<EstadoConferenciaRetirada> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") return { erro: "Só o financeiro confere as retiradas." };
  const campos = Object.fromEntries([...fd.entries()].filter((e): e is [string, string] => typeof e[1] === "string"));
  const f = lerFiltrosRetiradas(campos);
  if (!f.filial) return { erro: "Escolha a filial." };
  const comentario = (campos.comentario ?? "").replace(/\s+/g, " ").trim();
  const conferido = campos.conferido === "on";
  if (!comentario && !conferido) return { erro: "Escreva um comentário ou marque “Conferido”." };
  if (comentario.length > 1000) return { erro: "Comentário com no máximo 1000 caracteres." };

  const t = await totaisRetiradas(f, f.filial);
  const supabase = await createClient();
  const registro = {
    branch_id: f.filial,
    retirada_de: f.retDe,
    retirada_ate: f.retAte,
    deposito_de: f.depDe,
    deposito_ate: f.depAte,
    conta_id: f.conta ?? null,
    total_retirada: t.totalRetirada,
    total_declarado: t.totalDeclarado,
    conferido,
    comentario: comentario || null,
  };
  const { data, error } = await supabase.from("caixa_retirada_conferencias").insert(registro).select("id").single();
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "caixa_retirada_conferencias", registroId: data.id, novo: registro });
  revalidatePath("/financeiro/retiradas");
  return { ok: conferido ? "Conferência salva." : "Comentário salvo." };
}
