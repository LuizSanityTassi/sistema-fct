"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { valoresGravados } from "@/lib/data/dre-contabil";
import { comSinalDaConta, ehLinhaDre, ehLinhaRateio, MES_MANUAL, ROTULO_LINHA, sinalManual, type LinhaDre } from "@/lib/financeiro/dre-contabil";
import { lerConta } from "@/lib/financeiro/conta";
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

/**
 * O contador digita valores da DRE: campos "v:<filial ou empresa>:<conta>" (setembro, aba Lançar setembro) ou
 * "v:<filial ou empresa>:<conta>:<aaaa-mm>" (qualquer mês, no demonstrativo). Grava só o que mudou, marcado como
 * digitado (a importação da planilha não passa por cima).
 */
export async function lancarManual(_prev: EstadoManual, fd: FormData): Promise<EstadoManual> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador lançam a DRE." };
  const empresa = texto(fd, "empresa");
  if (!empresa) return { erro: "Escolha a empresa." };
  const pedidos: { branch: string | null; linha: LinhaDre; mes: string; valor: number; formula: string | null }[] = [];
  for (const [nome, bruto] of fd.entries()) {
    const m = /^v:([0-9a-f-]{36}|empresa):([a-z_]+)(?::(\d{4}-\d{2}))?$/i.exec(nome);
    if (!m || typeof bruto !== "string") continue;
    const [, filial, linha, mesCampo] = m;
    const mes = mesCampo ?? MES_MANUAL;
    if (!ehLinhaDre(linha) || !MES.test(mes) || (filial !== "empresa" && !UUID.test(filial))) return { erro: "Campo inválido." };
    // número ou conta ("1.200+350-80"), sem sinal como na planilha; a conta fica guardada (memória de cálculo)
    const lido = bruto.trim() ? lerConta(bruto.slice(0, 500)) : { valor: 0, conta: null };
    if (!lido) return { erro: `Valor inválido em ${ROTULO_LINHA[linha]} (${mes}): "${bruto}". Use 12.345,67 ou uma conta como 1.200+350-80.` };
    pedidos.push({ branch: filial === "empresa" ? null : filial, linha, mes, valor: Math.round(sinalManual(linha) * lido.valor * 100) / 100, formula: lido.conta });
  }
  const meses = [...new Set(pedidos.map((p) => p.mes))];
  const atuais = await valoresGravados(empresa, meses);
  const mudou = pedidos.filter((p) => {
    const antes = atuais.get(`${p.branch ?? ""}|${p.mes}|${p.linha}`);
    return Math.abs(p.valor - (antes?.valor ?? 0)) >= 0.005 || (p.formula ?? null) !== (antes?.formula ?? null);
  });
  if (!mudou.length) return { ok: "Nada mudou." };
  const supabase = await createClient();
  for (const mes of new Set(mudou.map((p) => p.mes))) {
    const { error } = await supabase.rpc("dre_contabil_lancar_manual", {
      p_empresa: empresa,
      p_competencia: `${mes}-01`,
      p_valores: mudou.filter((p) => p.mes === mes).map((p) => ({ branch_id: p.branch, linha: p.linha, valor: p.valor, formula: p.formula })),
    });
    if (error) return { erro: `Não foi possível salvar ${mes}: ${error.message}` };
  }
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "dre_contabil",
    novo: { empresa, lancamento_manual: mudou.map((p) => ({ ...p, antes: atuais.get(`${p.branch ?? ""}|${p.mes}|${p.linha}`)?.valor ?? 0 })) },
  });
  revalidatePath("/financeiro/dre");
  return { ok: `${empresa}: ${mudou.length === 1 ? "1 valor alterado" : `${mudou.length} valores alterados`}.` };
}

/**
 * Refaz as contas do plano (devoluções, comissões = Premiação, outras receitas, receita financeira, despesas de pessoal,
 * administrativas, comerciais, outras e financeiras) do mês liberado a partir dos lançamentos do Omie, filial por
 * filial. A depreciação fica como está.
 */
export async function preencherOmie() {
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
