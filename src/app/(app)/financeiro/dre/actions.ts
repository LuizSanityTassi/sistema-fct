"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { ehGrupoFinanceiro } from "@/lib/financeiro/rotulos";
import { lerDecimal } from "@/lib/formatos";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";

export type RespostaCelula = { ok?: true; erro?: string };

function campos(fd: FormData) {
  const grupo = String(fd.get("grupo") ?? "TODOS");
  const filial = String(fd.get("filial") ?? "");
  const competencia = String(fd.get("competencia") ?? "");
  const bruto = String(fd.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : lerDecimal(bruto);
  return { grupo: grupo === "TODOS" || ehGrupoFinanceiro(grupo) ? grupo : null, filial: ehUuid(filial) ? filial : null, competencia: competenciaValida(competencia) ? competencia : null, valor, bruto };
}

/** Ajuste manual do contador numa célula categoria × mês (vazio volta ao automático). */
export async function salvarAjusteDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador ajustam o caixa contábil." };
  const { grupo, filial, competencia, valor, bruto } = campos(fd);
  const categoriaId = String(fd.get("categoria_id") ?? "");
  if (!grupo || !competencia || !ehUuid(categoriaId)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  const base = supabase.from("fin_dre_ajustes");
  if (valor === null) {
    const { error } = await base.delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("categoria_id", categoriaId).eq("competencia", competencia);
    if (error) return { erro: error.message };
  } else {
    const { error } = await base.upsert({ grupo, branch_id: filial, categoria_id: categoriaId, competencia, valor: Math.abs(valor), atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_ajustes", novo: { grupo, filial, categoria_id: categoriaId, competencia, valor } });
  revalidatePath("/financeiro/dre");
  return { ok: true };
}

/** Saldos de caixa da DRE (saldo inicial, caixinha, contas correntes, limites). */
export async function salvarSaldoDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador alteram os saldos." };
  const { grupo, filial, competencia, valor, bruto } = campos(fd);
  const campo = String(fd.get("campo") ?? "");
  if (!grupo || !competencia || !["saldo_inicial", "caixinha", "contas_correntes", "limites_bancos"].includes(campo)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  const base = supabase.from("fin_dre_saldos");
  if (valor === null) {
    const { error } = await base.delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("competencia", competencia).eq("campo", campo);
    if (error) return { erro: error.message };
  } else {
    const { error } = await base.upsert({ grupo, branch_id: filial, competencia, campo, valor, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_saldos", novo: { grupo, filial, competencia, campo, valor } });
  revalidatePath("/financeiro/dre");
  return { ok: true };
}
