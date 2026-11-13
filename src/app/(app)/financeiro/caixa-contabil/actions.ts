"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { ehGrupoFinanceiro } from "@/lib/financeiro/rotulos";
import { lerConta } from "@/lib/financeiro/conta";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";

export type RespostaCelula = { ok?: true; erro?: string };

// valor = número ou conta digitada (memória de cálculo, ex.: "348300+200-100"; a conta fica guardada em formula)
function campos(fd: FormData) {
  const grupo = String(fd.get("grupo") ?? "TODOS");
  const filial = String(fd.get("filial") ?? "");
  const competencia = String(fd.get("competencia") ?? "");
  const bruto = String(fd.get("valor") ?? "").trim();
  const lido = bruto === "" || bruto.length > 500 ? null : lerConta(bruto);
  return {
    grupo: grupo === "TODOS" || ehGrupoFinanceiro(grupo) ? grupo : null,
    filial: ehUuid(filial) ? filial : null,
    competencia: competenciaValida(competencia) ? competencia : null,
    valor: lido?.valor ?? null,
    formula: lido?.conta ?? null,
    bruto,
  };
}

/**
 * Ajuste manual do contador numa célula categoria × mês (vazio volta ao automático). Ajuste numa filial também muda o
 * total do grupo e o de todas (dreDoPeriodo soma as filiais com os ajustes delas).
 */
export async function salvarAjusteDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador ajustam o caixa contábil." };
  const { grupo, filial, competencia, valor, formula, bruto } = campos(fd);
  const categoriaId = String(fd.get("categoria_id") ?? "");
  if (!grupo || !competencia || !ehUuid(categoriaId)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor ou conta inválida." };
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
    // categoria guarda sem sinal (a tela põe o sinal da família)
    const { error } = await base.upsert(
      { grupo, branch_id: filial, categoria_id: categoriaId, competencia, valor: Math.abs(valor), formula, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" },
    );
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_ajustes", novo: { grupo, filial, categoria_id: categoriaId, competencia, valor, formula } });
  revalidatePath("/financeiro/caixa-contabil");
  return { ok: true };
}

/**
 * Valor digitado numa linha de total do mês — família (F|…), grupo (G|…) ou Total de saídas (S): vale no lugar da
 * conta, o resto soma a partir dele e sobe para o total do grupo e o de todas; vazio volta à conta.
 * RA = ajuste do resultado do mês: soma em cima de receitas − saídas (não substitui) e também sobe para os totais.
 */
export async function salvarAjusteLinhaDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador ajustam o caixa contábil." };
  const { grupo, filial, competencia, valor, formula, bruto } = campos(fd);
  const linha = String(fd.get("linha") ?? "");
  if (!grupo || !competencia || !/^(F\|.+|G\|.+|S|RA)$/.test(linha) || linha.length > 300) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor ou conta inválida." };
  const supabase = await createClient();
  const tabela = () => supabase.from("fin_dre_ajustes_linhas");
  if (filial) {
    const { error } = await tabela().delete().eq("branch_id", filial).eq("linha", linha).eq("competencia", competencia).neq("grupo", grupo);
    if (error) return { erro: error.message };
  }
  if (valor === null) {
    const { error } = await tabela().delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("linha", linha).eq("competencia", competencia);
    if (error) return { erro: error.message };
  } else {
    // família e grupo guardam sem sinal (a tela põe o da família); saídas e resultado, como digitado
    const gravar = /^[FG]\|/.test(linha) ? Math.abs(valor) : valor;
    const { error } = await tabela().upsert(
      { grupo, branch_id: filial, linha, competencia, valor: gravar, formula, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" },
    );
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_ajustes_linhas", novo: { grupo, filial, linha, competencia, valor, formula } });
  revalidatePath("/financeiro/caixa-contabil");
  return { ok: true };
}

/** Saldos de caixa da DRE (saldo inicial, caixinha, contas correntes, limites) e os resultados digitados (ajuste do acumulado, capacidade, payback). */
export async function salvarSaldoDre(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador alteram os saldos." };
  const { grupo, filial, competencia, valor, formula, bruto } = campos(fd);
  const campo = String(fd.get("campo") ?? "");
  if (!grupo || !competencia || !["saldo_inicial", "caixinha", "contas_correntes", "limites_bancos", "acumulado", "ajuste_acumulado", "capacidade", "payback"].includes(campo)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor ou conta inválida." };
  const supabase = await createClient();
  const base = supabase.from("fin_dre_saldos");
  if (campo === "ajuste_acumulado") {
    // o ajuste substitui o acumulado digitado à moda antiga (que travava o número no lugar da conta)
    const { error } = await supabase.from("fin_dre_saldos").delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("competencia", competencia).eq("campo", "acumulado");
    if (error) return { erro: error.message };
  }
  if (filial) {
    const { error } = await supabase.from("fin_dre_saldos").delete().eq("branch_id", filial).eq("campo", campo).eq("competencia", competencia).neq("grupo", grupo);
    if (error) return { erro: error.message };
  }
  if (valor === null) {
    const { error } = await base.delete().eq("grupo", grupo).filter("branch_id", filial ? "eq" : "is", filial).eq("competencia", competencia).eq("campo", campo);
    if (error) return { erro: error.message };
  } else {
    const { error } = await base.upsert({ grupo, branch_id: filial, competencia, campo, valor, formula, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "chave" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_dre_saldos", novo: { grupo, filial, competencia, campo, valor, formula } });
  revalidatePath("/financeiro/caixa-contabil");
  return { ok: true };
}
