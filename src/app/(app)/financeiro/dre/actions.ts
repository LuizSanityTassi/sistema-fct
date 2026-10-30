"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { valoresManuais } from "@/lib/data/dre-contabil";
import { comSinalDaConta, ehLinhaManual, ehLinhaRateio, MES_MANUAL, ROTULO_LINHA, sinalManual } from "@/lib/financeiro/dre-contabil";
import { CHAVE_LEMBRETE_DRE } from "@/lib/financeiro/dre-lembrete";
import { lerValor } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";

export type EstadoRateio = { erro?: string; ok?: string };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const podeEditar = (papel: string) => papel === "admin" || papel === "financeiro" || papel === "contador";
const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
};

/** Grava (ou troca, se o item já existe no mês) um valor da empresa para ratear por faturamento. */
export async function salvarRateio(_prev: EstadoRateio, fd: FormData): Promise<EstadoRateio> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador lançam rateios." };
  const empresa = texto(fd, "empresa");
  const mes = texto(fd, "mes");
  const item = texto(fd, "item");
  const linha = texto(fd, "linha");
  const valor = lerValor(texto(fd, "valor")); // "59.145" = milhar, como na planilha
  const observacao = texto(fd, "observacao");
  if (!empresa || !MES.test(mes)) return { erro: "Escolha a empresa e o mês." };
  if (item.length < 2 || item.length > 60) return { erro: "Diga o que é o valor (ex.: Despesa financeira)." };
  if (!ehLinhaRateio(linha)) return { erro: "Escolha a conta da DRE." };
  if (valor === null) return { erro: "Informe o valor total do mês (sem sinal, ex.: 59.145,00)." };
  if (observacao.length > 300) return { erro: "Observação com no máximo 300 caracteres." };
  const registro = { empresa, competencia: `${mes}-01`, item, linha, valor: comSinalDaConta(linha, valor), observacao: observacao || null };
  const supabase = await createClient();
  const { data, error } = await supabase.from("dre_contabil_rateios").upsert(registro, { onConflict: "empresa,competencia,item" }).select("id").single();
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "dre_contabil_rateios", registroId: data.id, novo: registro });
  revalidatePath("/financeiro/dre");
  return { ok: `${item} rateado entre as filiais.` };
}

export async function excluirRateio(fd: FormData) {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return;
  const id = texto(fd, "id");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("dre_contabil_rateios").delete().eq("id", id).select("empresa, competencia, item, valor").maybeSingle();
  if (data) await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "dre_contabil_rateios", registroId: id, anterior: data });
  revalidatePath("/financeiro/dre");
}

export type EstadoManual = { erro?: string; ok?: string };

/** Valor digitado no lançamento à mão: vazio = 0; "-" na frente = sinal invertido (estorno). */
function lerManual(bruto: string): number | null {
  const t = bruto.replace(/[R$\s]/g, "");
  if (!t || /^-?0+([.,]0+)?$/.test(t)) return 0;
  const negativo = t.startsWith("-");
  const v = lerValor(negativo ? t.slice(1) : t);
  return v === null ? null : negativo ? -v : v;
}

/**
 * Setembro/2026: o contador digita as contas "amarelas" de cada filial (campos "v:<filial ou empresa>:<conta>").
 * Grava só o que mudou; o banco só aceita esse mês e essas contas.
 */
export async function lancarManual(_prev: EstadoManual, fd: FormData): Promise<EstadoManual> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador lançam a DRE." };
  const empresa = texto(fd, "empresa");
  if (!empresa) return { erro: "Escolha a empresa." };
  const atuais = await valoresManuais(empresa);
  const mudou: { branch_id: string | null; linha: string; valor: number; antes: number }[] = [];
  for (const [nome, bruto] of fd.entries()) {
    const m = /^v:([0-9a-f-]{36}|empresa):([a-z_]+)$/i.exec(nome);
    if (!m || typeof bruto !== "string") continue;
    const [, filial, linha] = m;
    if (!ehLinhaManual(linha) || (filial !== "empresa" && !UUID.test(filial))) return { erro: "Essa conta não está liberada para lançar à mão." };
    const n = lerManual(bruto);
    if (n === null) return { erro: `Valor inválido em ${ROTULO_LINHA[linha]}: "${bruto}". Use o formato 12.345,67.` };
    const valor = Math.round(sinalManual(linha) * n * 100) / 100;
    const branch = filial === "empresa" ? null : filial;
    const antes = atuais.get(`${branch ?? ""}|${linha}`) ?? 0;
    if (Math.abs(valor - antes) >= 0.005) mudou.push({ branch_id: branch, linha, valor, antes });
  }
  if (!mudou.length) return { ok: "Nada mudou." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dre_contabil_lancar_manual", {
    p_empresa: empresa,
    p_competencia: `${MES_MANUAL}-01`,
    p_valores: mudou.map(({ branch_id, linha, valor }) => ({ branch_id, linha, valor })),
  });
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "dre_contabil", novo: { empresa, competencia: MES_MANUAL, lancamento_manual: mudou } });
  revalidatePath("/financeiro/dre");
  return { ok: `Setembro da ${empresa} salvo: ${mudou.length === 1 ? "1 valor alterado" : `${mudou.length} valores alterados`}.` };
}

/**
 * Refaz as contas do plano (devoluções, outras receitas, receita financeira, despesas de pessoal, administrativas,
 * comerciais, outras e financeiras) do mês liberado a partir dos lançamentos do Omie, filial por filial. Comissões e
 * depreciação ficam como estão.
 */
export async function preencherOmie(_fd: FormData) {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dre_contabil_preencher_omie", { p_competencia: `${MES_MANUAL}-01` });
  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "dre_contabil", novo: { competencia: MES_MANUAL, preenchido_pelo_omie: data } });
  revalidatePath("/financeiro/dre");
}

export type EstadoLembrete = { erro?: string; ok?: string };

/** Liga/desliga o lembrete no sino e escolhe o dia do mês a partir do qual a DRE do mês anterior conta como atrasada. */
export async function salvarLembreteDre(_prev: EstadoLembrete, fd: FormData): Promise<EstadoLembrete> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") return { erro: "Só Administrador e Financeiro mudam o lembrete." };
  const dia = Number(texto(fd, "dia"));
  const ligado = fd.get("ligado") === "on";
  if (!Number.isInteger(dia) || dia < 1 || dia > 28) return { erro: "Escolha um dia de 1 a 28." };
  const valor = { ligado, dia };
  const supabase = await createClient();
  const { error } = await supabase.from("sistema_config").upsert({ chave: CHAVE_LEMBRETE_DRE, valor, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() });
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "sistema_config", novo: { chave: CHAVE_LEMBRETE_DRE, ...valor } });
  revalidatePath("/financeiro/dre/importar");
  return { ok: ligado ? `Lembrete ligado: a partir do dia ${dia}, o sino avisa se a DRE do mês anterior não tiver sido importada.` : "Lembrete desligado." };
}
