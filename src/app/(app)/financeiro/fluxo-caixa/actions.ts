"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { acessoFluxo, ROTA_FLUXO } from "@/lib/data/fluxo-caixa";
import { ehLugar } from "@/lib/fluxo-caixa/classes";
import { ehEmpresaFluxo, type LinhaPagar } from "@/lib/fluxo-caixa/omie-pivot";
import { somaDias } from "@/lib/fluxo-caixa/periodos";
import { lerDecimal } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";

export type Resposta = { ok?: boolean; erro?: string; mensagem?: string };

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ehCampo = (c: unknown): c is "receber" | "cartao" => c === "receber" || c === "cartao";
/** "R$ 263.155,60", "(130.112,46)", "263155.6" → número (sempre positivo: é previsão de entrada) */
const valorDigitado = (t: string) => {
  const limpo = t.replace(/R\$|\s|\(|\)/g, "").replace(/^-/, "");
  // "1.234" ou "1.234.567" sem centavos = milhar (não 1,234)
  return limpo === "" ? null : lerDecimal(/^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, "") : limpo);
};

async function podeEditar() {
  const sessao = await getSessao();
  const acesso = await acessoFluxo(sessao.id, sessao.papel);
  return { sessao, ...acesso };
}

/** Valor de a receber (previsão) ou de cartão de um dia; vazio apaga. */
export async function salvarPrevisao(p: { empresa: string; data: string; campo: string; valor: string }): Promise<Resposta> {
  const { sessao, editar } = await podeEditar();
  if (!editar) return { erro: "Você só pode ver o fluxo de caixa." };
  if (!ehEmpresaFluxo(p.empresa) || !DATA_RE.test(p.data) || !ehCampo(p.campo)) return { erro: "Dados inválidos." };
  const bruto = p.valor.trim();
  const valor = valorDigitado(bruto);
  if (bruto !== "" && valor === null) return { erro: `Valor inválido: ${bruto}` };
  const supabase = await createClient();
  const chave = { empresa: p.empresa, data: p.data, campo: p.campo };
  const { error } =
    valor === null
      ? await supabase.from("fin_fluxo_previsoes").delete().match(chave)
      : await supabase.from("fin_fluxo_previsoes").upsert({ ...chave, valor, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() });
  if (error) return { erro: error.message };
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

/**
 * Coluna colada da planilha de previsão: o 1º valor vai no dia clicado e os seguintes nos dias corridos depois dele
 * (linha de texto, como "Sábado" ou "Feriado", só pula o dia; linha vazia também).
 */
export async function colarPrevisoes(p: { empresa: string; inicio: string; campo: string; linhas: string[] }): Promise<Resposta> {
  const { sessao, editar } = await podeEditar();
  if (!editar) return { erro: "Você só pode ver o fluxo de caixa." };
  if (!ehEmpresaFluxo(p.empresa) || !DATA_RE.test(p.inicio) || !ehCampo(p.campo) || !Array.isArray(p.linhas) || p.linhas.length > 400) return { erro: "Dados inválidos." };
  const agora = new Date().toISOString();
  const registros = p.linhas
    .map((t, i) => ({ data: somaDias(p.inicio, i), valor: /\d/.test(t) ? valorDigitado(String(t)) : null }))
    .filter((x): x is { data: string; valor: number } => x.valor !== null)
    .map((x) => ({ empresa: p.empresa, campo: p.campo, data: x.data, valor: x.valor, atualizado_por: sessao.id, atualizado_em: agora }));
  if (!registros.length) return { erro: "Nenhum número no que foi colado." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_fluxo_previsoes").upsert(registros);
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "fin_fluxo_previsoes", novo: { empresa: p.empresa, campo: p.campo, de: registros[0].data, ate: registros[registros.length - 1].data, dias: registros.length } });
  revalidatePath(ROTA_FLUXO);
  return { ok: true, mensagem: `${registros.length} dia(s) preenchido(s).` };
}

/** Motivo do dia ("fatores causais"); vazio apaga. */
export async function salvarMotivo(p: { empresa: string; data: string; texto: string }): Promise<Resposta> {
  const { sessao, editar } = await podeEditar();
  if (!editar) return { erro: "Você só pode ver o fluxo de caixa." };
  if (!ehEmpresaFluxo(p.empresa) || !DATA_RE.test(p.data)) return { erro: "Dados inválidos." };
  const texto = p.texto.trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = texto
    ? await supabase.from("fin_fluxo_motivos").upsert({ empresa: p.empresa, data: p.data, texto, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() })
    : await supabase.from("fin_fluxo_motivos").delete().match({ empresa: p.empresa, data: p.data });
  if (error) return { erro: error.message };
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

/** A pagar lido do relatório do Omie (no navegador): troca, por empresa, os dias que o relatório cobre. */
export async function importarPagar(p: { arquivo: string; titulo: string; empresas: { empresa: string; linhas: LinhaPagar[] }[] }): Promise<Resposta> {
  const { sessao, editar } = await podeEditar();
  if (!editar) return { erro: "Você só pode ver o fluxo de caixa." };
  if (!Array.isArray(p.empresas) || !p.empresas.length) return { erro: "Nada para importar." };
  const supabase = await createClient();
  const feitas: string[] = [];
  for (const e of p.empresas) {
    if (!ehEmpresaFluxo(e.empresa) || !Array.isArray(e.linhas) || !e.linhas.length) return { erro: "Dados inválidos." };
    const linhas = e.linhas.filter((l) => DATA_RE.test(l.data) && Number.isFinite(l.valor) && typeof l.grupo === "string" && typeof l.categoria === "string");
    const { error } = await supabase.rpc("fin_fluxo_importar_pagar", { p_empresa: e.empresa, p_arquivo: p.arquivo.slice(0, 200), p_gerado: p.titulo.slice(0, 200), p_linhas: linhas });
    if (error) return { erro: `${e.empresa}: ${error.message}${feitas.length ? ` (${feitas.join(", ")} já foi importada)` : ""}` };
    feitas.push(e.empresa);
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "fin_fluxo_pagar", novo: { arquivo: p.arquivo, empresas: feitas } });
  revalidatePath(ROTA_FLUXO);
  return { ok: true, mensagem: `A pagar importado: ${feitas.join(" e ")}.` };
}

/** Muda o lugar de uma categoria do Omie no relatório (vale para grupo + categoria exatos). */
export async function salvarLugar(p: { grupo: string; categoria: string; lugar: string }): Promise<Resposta> {
  const { sessao, editar } = await podeEditar();
  if (!editar) return { erro: "Você só pode ver o fluxo de caixa." };
  if (!ehLugar(p.lugar) || !p.categoria.trim() || p.grupo.length > 120 || p.categoria.length > 120) return { erro: "Dados inválidos." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("fin_fluxo_classes")
    .upsert({ grupo: p.grupo.trim(), categoria: p.categoria.trim(), lugar: p.lugar, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() });
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_fluxo_classes", novo: p });
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

export async function criarNota(p: { empresa: string; referencia: string; texto: string; importante: boolean }): Promise<Resposta> {
  const sessao = await getSessao();
  const texto = p.texto.trim().slice(0, 2000);
  if (!texto) return { erro: "Escreva a anotação." };
  if (p.empresa && !ehEmpresaFluxo(p.empresa)) return { erro: "Empresa inválida." };
  if (p.referencia && !DATA_RE.test(p.referencia)) return { erro: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_fluxo_notas").insert({ empresa: p.empresa || null, referencia: p.referencia || null, texto, importante: !!p.importante, autor: sessao.id });
  if (error) return { erro: error.message };
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

export async function resolverNota(p: { id: string; resolvida: boolean }): Promise<Resposta> {
  const sessao = await getSessao();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_fluxo_notas")
    .update(p.resolvida ? { resolvida_em: new Date().toISOString(), resolvida_por: sessao.id } : { resolvida_em: null, resolvida_por: null })
    .eq("id", p.id)
    .select("id");
  if (error) return { erro: error.message };
  if (!data.length) return { erro: "Só quem escreveu ou quem edita o fluxo marca como resolvida." };
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

export async function apagarNota(p: { id: string }): Promise<Resposta> {
  await getSessao();
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_fluxo_notas").delete().eq("id", p.id).select("id");
  if (error) return { erro: error.message };
  if (!data.length) return { erro: "Só quem escreveu (ou o administrador) apaga a anotação." };
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

/** Libera a tela para uma pessoa (só ver ou também editar) ou muda o que ela pode. */
export async function compartilharFluxo(p: { userId: string; podeEditar: boolean }): Promise<Resposta> {
  const { sessao, compartilhar } = await podeEditar();
  if (!compartilhar) return { erro: "Só Administrador e Financeiro compartilham o fluxo de caixa." };
  const supabase = await createClient();
  const { error } = await supabase.from("acesso_telas").upsert({ user_id: p.userId, rota: ROTA_FLUXO, pode_editar: !!p.podeEditar, concedido_por: sessao.id });
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "acesso_telas", novo: { user_id: p.userId, rota: ROTA_FLUXO, pode_editar: !!p.podeEditar } });
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}

export async function removerAcessoFluxo(p: { userId: string }): Promise<Resposta> {
  const { sessao, compartilhar } = await podeEditar();
  if (!compartilhar) return { erro: "Só Administrador e Financeiro compartilham o fluxo de caixa." };
  const supabase = await createClient();
  const { error } = await supabase.from("acesso_telas").delete().match({ user_id: p.userId, rota: ROTA_FLUXO });
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "acesso_telas", anterior: { user_id: p.userId, rota: ROTA_FLUXO } });
  revalidatePath(ROTA_FLUXO);
  return { ok: true };
}
