"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { ehGrupoFinanceiro } from "@/lib/financeiro/rotulos";
import { lerDecimal } from "@/lib/formatos";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import type { RespostaCelula } from "../dre/actions";

/** Orçado (campo "valor") ou realizado informado (campo "realizado") de categoria × mês. Vazio limpa. */
export async function salvarOrcamento(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeFecharMes(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram o orçamento." };
  const grupo = String(fd.get("grupo") ?? "TODOS");
  const categoriaId = String(fd.get("categoria_id") ?? "");
  const competencia = String(fd.get("competencia") ?? "");
  const campo = fd.get("campo") === "realizado" ? "realizado_informado" : "valor";
  const bruto = String(fd.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : lerDecimal(bruto);
  if (!(grupo === "TODOS" || ehGrupoFinanceiro(grupo)) || !ehUuid(categoriaId) || !competenciaValida(competencia)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };

  const supabase = await createClient();
  const { data: atual } = await supabase.from("fin_orcamentos").select("*").eq("grupo", grupo).eq("categoria_id", categoriaId).eq("competencia", competencia).maybeSingle();
  const novo = { valor: atual?.valor ?? null, realizado_informado: atual?.realizado_informado ?? null, [campo]: valor === null ? null : Math.abs(valor) };
  if (novo.valor === null && novo.realizado_informado === null) {
    if (atual) {
      const { error } = await supabase.from("fin_orcamentos").delete().eq("id", atual.id);
      if (error) return { erro: error.message };
    }
  } else {
    const { error } = await supabase.from("fin_orcamentos").upsert({ grupo, categoria_id: categoriaId, competencia, ...novo, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "grupo,categoria_id,competencia" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_orcamentos", novo: { grupo, categoria_id: categoriaId, competencia, campo, valor } });
  revalidatePath("/financeiro/orcamento");
  return { ok: true };
}
