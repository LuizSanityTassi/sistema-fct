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

/**
 * Ajuste manual do contador numa célula categoria × mês (vazio volta ao automático). Ajuste numa filial também muda o
 * total do grupo e o de todas (dreDoPeriodo soma as filiais com os ajustes delas).
 */
export async function salvarAjusteDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador ajustam o caixa contábil." };
  const { grupo, filial, competencia, valor, bruto } = campos(fd);
  const categoriaId = String(fd.get("categoria_id") ?? "");
  if (!grupo || !competencia || !ehUuid(categoriaId)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  const base = supabase.from("fin_dre_ajustes");
  if (filial) {
    // na filial vale um ajuste por célula, de qualquer grupo que se esteja olhando (a filial aparece em "todas" e no grupo dela)
    const { error } = await supabase.from("fin_dre_ajustes").delete().eq("branch_id", filial).eq("categoria_id", categoriaId).eq("competencia", competencia).neq("grupo", grupo);
    if (error) return { erro: error.message };
  }
  if (valor === null) {
    const { error } = await base.delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("categoria_id", categoriaId).eq("competencia", competencia);
    if (error) return { erro: error.message };
  } else {
    const { error } = await base.upsert({ grupo, branch_id: filial, categoria_id: categoriaId, competencia, valor: Math.abs(valor), atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_ajustes", novo: { grupo, filial, categoria_id: categoriaId, competencia, valor } });
  revalidatePath("/financeiro/caixa-contabil");
  return { ok: true };
}

/**
 * Valor digitado numa linha de total (família ou grupo) do mês: vale no lugar da soma das categorias de baixo; vazio
 * volta à soma. Também sobe para o total do grupo e o de todas, como os ajustes de categoria.
 */
export async function salvarAjusteLinhaDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador ajustam o caixa contábil." };
  const { grupo, filial, competencia, valor, bruto } = campos(fd);
  const linha = String(fd.get("linha") ?? "");
  if (!grupo || !competencia || !/^(F|G)\|./.test(linha) || linha.length > 300) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  if (filial) {
    const { error } = await supabase.from("fin_dre_ajustes_linhas").delete().eq("branch_id", filial).eq("linha", linha).eq("competencia", competencia).neq("grupo", grupo);
    if (error) return { erro: error.message };
  }
  if (valor === null) {
    const { error } = await supabase.from("fin_dre_ajustes_linhas").delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("linha", linha).eq("competencia", competencia);
    if (error) return { erro: error.message };
  } else {
    const { error } = await supabase
      .from("fin_dre_ajustes_linhas")
      .upsert({ grupo, branch_id: filial, linha, competencia, valor: Math.abs(valor), atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_ajustes_linhas", novo: { grupo, filial, linha, competencia, valor } });
  revalidatePath("/financeiro/caixa-contabil");
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
  if (filial) {
    const { error } = await supabase.from("fin_dre_saldos").delete().eq("branch_id", filial).eq("campo", campo).eq("competencia", competencia).neq("grupo", grupo);
    if (error) return { erro: error.message };
  }
  if (valor === null) {
    const { error } = await base.delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("competencia", competencia).eq("campo", campo);
    if (error) return { erro: error.message };
  } else {
    const { error } = await base.upsert({ grupo, branch_id: filial, competencia, campo, valor, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_saldos", novo: { grupo, filial, competencia, campo, valor } });
  revalidatePath("/financeiro/caixa-contabil");
  return { ok: true };
}
