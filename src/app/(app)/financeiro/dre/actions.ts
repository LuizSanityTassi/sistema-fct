"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { comSinalDaConta, ehLinhaRateio } from "@/lib/financeiro/dre-contabil";
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
