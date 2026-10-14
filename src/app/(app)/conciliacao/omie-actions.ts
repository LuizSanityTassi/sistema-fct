"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { buscarCadastros, chavesOmie, ehEmpresaOmie, EMPRESAS_OMIE, OmieErro } from "@/lib/conciliacao/omie-api";
import { CONFIG_OMIE_PADRAO, contasDaConciliacao, desfazerEnvio, gerarPlanilhaOmie, lancarPorApi, validarEnvio, type ResultadoApi, type Validacao } from "@/lib/conciliacao/omie-envio";
import { Omie } from "@/lib/conciliacao/omie";
import { podeConciliar, podeConfigurarConciliacao } from "@/lib/conciliacao/permissoes";
import { mapaFiliais, obterConciliacao, obterConfig } from "@/lib/data/conciliacao";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";
import type { ConfigOmie } from "@/lib/conciliacao/omie";

export type EstadoValidacao = { erro?: string; validacao?: Validacao; verbo?: "planilha" | "api"; chaves?: string[] };
export type EstadoLancamentoApi = { erro?: string; resultado?: ResultadoApi };
export type EstadoConfigOmie = { erro?: string; ok?: string };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}
const chavesDe = (fd: FormData) => [...new Set(fd.getAll("chave").filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 80))];

async function exigirConciliar() {
  const sessao = await getSessao();
  return podeConciliar(sessao.papel) ? sessao : null;
}

async function carregarContas(conciliacaoId: string, chaves: string[]) {
  const supabase = await createClient();
  return contasDaConciliacao(supabase, conciliacaoId, chaves);
}

/** Passo 1: valida a seleção e devolve 🟢/🟡/🔴 para a pessoa decidir. */
export async function validarEnvioOmie(_prev: EstadoValidacao, fd: FormData): Promise<EstadoValidacao> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro enviam ao Omie." };
  const conciliacaoId = texto(fd, "conciliacao") ?? "";
  const verbo = texto(fd, "verbo") === "api" ? "api" : "planilha";
  const chaves = chavesDe(fd);
  if (!ehUuid(conciliacaoId)) return { erro: "Conciliação inválida." };
  if (!chaves.length) return { erro: "Nada selecionado." };
  const contas = await carregarContas(conciliacaoId, chaves);
  if (!contas.length) return { erro: "As contas selecionadas não foram encontradas." };
  return { validacao: validarEnvio(contas, verbo), verbo, chaves: contas.map((c) => c.chave) };
}

/** Passo 2 (planilha): gera o arquivo do modelo Omie, guarda, registra os envios e resolve pendências. */
export async function enviarPlanilhaOmie(_prev: EstadoValidacao, fd: FormData): Promise<EstadoValidacao> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro enviam ao Omie." };
  const conciliacaoId = texto(fd, "conciliacao") ?? "";
  const chaves = chavesDe(fd);
  const conc = await obterConciliacao(conciliacaoId);
  if (!conc) return { erro: "Conciliação não encontrada." };
  const cfg = await obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO);
  const supabase = await createClient();
  let r: Awaited<ReturnType<typeof gerarPlanilhaOmie>>;
  try {
    r = await gerarPlanilhaOmie(supabase, sessao.id, conc, chaves, cfg);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível gerar a planilha." };
  }
  revalidatePath(`/conciliacao/${conciliacaoId}`);
  revalidatePath("/conciliacao/omie");
  revalidatePath("/conciliacao/pendencias");
  redirect(`/conciliacao/${conciliacaoId}?aba=omie&planilha=${r.arquivoId}&qtd=${r.qtd}`);
}

/** Passo 2 (API): lança na Omie da empresa certa (modo teste: 1 conta por empresa até liberar). */
export async function lancarOmieApi(_prev: EstadoLancamentoApi, fd: FormData): Promise<EstadoLancamentoApi> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro enviam ao Omie." };
  const conciliacaoId = texto(fd, "conciliacao") ?? "";
  const chaves = chavesDe(fd);
  const conc = await obterConciliacao(conciliacaoId);
  if (!conc) return { erro: "Conciliação não encontrada." };
  const cfg = await obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO);
  const supabase = await createClient();
  try {
    const resultado = await lancarPorApi(supabase, sessao.id, conc, chaves, cfg, fd.get("cadastrar_fornecedor") === "on");
    revalidatePath(`/conciliacao/${conciliacaoId}`);
    revalidatePath("/conciliacao/omie");
    revalidatePath("/conciliacao/pendencias");
    return { resultado };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível lançar na Omie." };
  }
}

// ---------- configuração / cadastros ----------

export async function salvarConfigOmie(_prev: EstadoConfigOmie, fd: FormData): Promise<EstadoConfigOmie> {
  const sessao = await getSessao();
  if (!podeConfigurarConciliacao(sessao.papel)) return { erro: "Só o administrador altera a configuração do Omie." };
  const categoria = texto(fd, "categoria")?.slice(0, 70);
  const conta = texto(fd, "conta")?.slice(0, 40);
  if (!categoria || !conta) return { erro: "Informe a categoria e a conta corrente como estão cadastradas no Omie." };
  const supabase = await createClient();
  const { error } = await supabase.from("conc_config").upsert({ chave: "omie", valor: { categoria, conta }, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id }, { onConflict: "chave" });
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_config", novo: { omie: { categoria, conta } } });
  revalidatePath("/conciliacao/omie");
  return { ok: "Configuração salva." };
}

export async function buscarCadastrosOmie(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const empresa = texto(fd, "empresa");
  if (!ehEmpresaOmie(empresa)) return;
  if (!chavesOmie(empresa)) redirect(`/conciliacao/omie?erro=${encodeURIComponent(`As chaves da Omie da ${EMPRESAS_OMIE[empresa]} não estão configuradas no servidor.`)}`);
  const cfg = await obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO);
  const filiais = await mapaFiliais();
  // Nazário: nomes exatos dos departamentos (lista do financeiro); Varela: pelo código da filial (F001…)
  const pedidos = empresa === "nazario" ? Omie.DEPARTAMENTOS.map((d) => d.nome) : [...filiais.porFilial.entries()].filter(([n]) => n < 300).map(([, b]) => b.codigo);
  const supabase = await createClient();
  try {
    const cache = await buscarCadastros(empresa, cfg.conta, cfg.categoria, pedidos, sessao.nome);
    const { error } = await supabase.from("conc_config").upsert({ chave: `omie_cache_${empresa}`, valor: cache, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id }, { onConflict: "chave" });
    if (error) throw new Error(error.message);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_config", novo: { omie_cadastros: empresa, conta: cache.conta?.nome ?? null, categoria: cache.categoria?.nome ?? null, departamentos: Object.keys(cache.departamentos).length, faltando: cache.departamentosFaltando.length } });
  } catch (e) {
    redirect(`/conciliacao/omie?erro=${encodeURIComponent(`${EMPRESAS_OMIE[empresa]}: ${e instanceof OmieErro || e instanceof Error ? e.message : "falha"}`)}`);
  }
  revalidatePath("/conciliacao/omie");
  redirect(`/conciliacao/omie?ok=cadastros`);
}

/** A pessoa conferiu a 1ª conta na Omie e libera o envio em lote daquela empresa. */
export async function liberarLoteOmie(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const empresa = texto(fd, "empresa");
  if (!ehEmpresaOmie(empresa)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("conc_config").upsert({ chave: `omie_${empresa}`, valor: { testado: true, testadoPor: sessao.nome, testadoEm: new Date().toISOString() }, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id }, { onConflict: "chave" });
  if (error) redirect(`/conciliacao/omie?erro=${encodeURIComponent(error.message)}`);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_config", novo: { omie_liberado: empresa } });
  revalidatePath("/conciliacao/omie");
  redirect(`/conciliacao/omie?ok=liberado`);
}

export async function desfazerEnvioOmie(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const lote = texto(fd, "lote") ?? "";
  const motivo = texto(fd, "motivo")?.slice(0, 300) ?? "";
  if (motivo.length < 3) redirect(`/conciliacao/omie?erro=${encodeURIComponent("Escreva o motivo (ex.: a importação deu erro na Omie e foi apagada).")}`);
  const supabase = await createClient();
  let qtd = 0;
  try {
    qtd = await desfazerEnvio(supabase, sessao.id, sessao.nome, lote, motivo);
  } catch (e) {
    redirect(`/conciliacao/omie?erro=${encodeURIComponent(e instanceof Error ? e.message : "falha")}`);
  }
  revalidatePath("/conciliacao/omie");
  revalidatePath("/conciliacao/pendencias");
  redirect(`/conciliacao/omie?ok=desfeito&qtd=${qtd}`);
}
