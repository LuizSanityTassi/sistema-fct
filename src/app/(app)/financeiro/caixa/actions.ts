"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { podeFecharMes } from "@/lib/financeiro/permissoes";
import { EMPRESAS_CAIXA } from "@/lib/financeiro/rotulos";
import { lerDecimal } from "@/lib/formatos";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import type { RespostaCelula } from "../dre/actions";

const empresaValida = (e: string) => EMPRESAS_CAIXA.some((x) => x.nome === e);
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Célula do fluxo mensal: provisão ou realizado informado de uma linha (empresa × mês). Vazio limpa. */
export async function salvarFluxoMensal(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeFecharMes(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram o fluxo mensal." };
  const grupo = String(fd.get("grupo") ?? "");
  const competencia = String(fd.get("competencia") ?? "");
  const linha = String(fd.get("linha") ?? "").slice(0, 80);
  const campo = fd.get("campo") === "realizado" ? "realizado" : "provisao";
  const bruto = String(fd.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : lerDecimal(bruto);
  if (!empresaValida(grupo) || !competenciaValida(competencia) || !linha) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("fin_fluxo_mensal").select("*").eq("grupo", grupo).eq("competencia", competencia).eq("linha", linha).maybeSingle();
  const novo = { provisao: atual?.provisao ?? null, realizado: atual?.realizado ?? null, [campo]: valor };
  if (novo.provisao === null && novo.realizado === null) {
    if (atual) await supabase.from("fin_fluxo_mensal").delete().eq("id", atual.id);
  } else {
    const { error } = await supabase.from("fin_fluxo_mensal").upsert({ grupo, competencia, linha, ...novo, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "grupo,competencia,linha" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_fluxo_mensal", novo: { grupo, competencia, linha, campo, valor } });
  revalidatePath("/financeiro/caixa");
  return { ok: true };
}

/** Campo numérico do fluxo diário (saldos, a receber por forma, overrides, conferência). Vazio limpa. */
export async function salvarFluxoDiario(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeFecharMes(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram o fluxo diário." };
  const grupo = String(fd.get("grupo") ?? "");
  const data = String(fd.get("data") ?? "");
  const campo = String(fd.get("campo") ?? "").slice(0, 40);
  const ehTexto = fd.get("tipo") === "texto";
  if (!empresaValida(grupo) || !DATA_RE.test(data) || !campo) return { erro: "Dados inválidos." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("fin_fluxo_diario").select("*").eq("grupo", grupo).eq("data", data).eq("campo", campo).maybeSingle();
  let valor = atual?.valor ?? null;
  let texto = atual?.texto ?? null;
  const bruto = String(fd.get("valor") ?? "").trim();
  if (ehTexto) texto = bruto.slice(0, 300) || null;
  else {
    valor = bruto === "" ? null : lerDecimal(bruto);
    if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  }
  if (valor === null && texto === null) {
    if (atual) await supabase.from("fin_fluxo_diario").delete().eq("id", atual.id);
  } else {
    const { error } = await supabase.from("fin_fluxo_diario").upsert({ grupo, data, campo, valor, texto, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "grupo,data,campo" });
    if (error) return { erro: error.message };
  }
  revalidatePath("/financeiro/caixa");
  return { ok: true };
}

/** Inadimplência: atrasado/recebido de tipo × ano × mês. */
export async function salvarInadimplencia(fd: FormData): Promise<RespostaCelula> {
  const sessao = await getSessao();
  if (!podeFecharMes(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram a inadimplência." };
  const tipo = String(fd.get("tipo") ?? "");
  const ano = Number(fd.get("ano"));
  const mes = Number(fd.get("mes"));
  const campo = fd.get("campo") === "recebido" ? "recebido" : "atrasado";
  const bruto = String(fd.get("valor") ?? "").trim();
  const valor = bruto === "" ? null : lerDecimal(bruto);
  if (!["crediario", "convenio"].includes(tipo) || !(ano >= 2000 && ano <= 2100) || !(mes >= 1 && mes <= 12)) return { erro: "Dados inválidos." };
  if (bruto !== "" && valor === null) return { erro: "Valor inválido." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("fin_inadimplencia").select("*").eq("tipo", tipo).eq("ano", ano).eq("mes", mes).maybeSingle();
  const novo = { atrasado: atual?.atrasado ?? null, recebido: atual?.recebido ?? null, [campo]: valor === null ? null : Math.abs(valor) };
  if (novo.atrasado === null && novo.recebido === null) {
    if (atual) await supabase.from("fin_inadimplencia").delete().eq("id", atual.id);
  } else {
    const { error } = await supabase.from("fin_inadimplencia").upsert({ tipo, ano, mes, ...novo, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() }, { onConflict: "tipo,ano,mes" });
    if (error) return { erro: error.message };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_inadimplencia", novo: { tipo, ano, mes, campo, valor } });
  revalidatePath("/financeiro/analise");
  return { ok: true };
}
