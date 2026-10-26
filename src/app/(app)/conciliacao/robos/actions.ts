"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { gerarTokenAgente, hashToken } from "@/lib/conciliacao/agentes";
import { rodarConciliacaoAutomatica, type ResultadoAutomatica } from "@/lib/conciliacao/automatica";
import { podeConciliar, podeConfigurarConciliacao } from "@/lib/conciliacao/permissoes";
import { guardarArquivo, type ResultadoUpload } from "@/lib/conciliacao/servico";
import { buscarRelatorioTrier, CONFIG_TRIER_PADRAO, statusTrier, testarLoginTrier, type ConfigTrier } from "@/lib/conciliacao/trier-robo";
import { obterConfig } from "@/lib/data/conciliacao";
import { ehUuid } from "@/lib/data/filiais";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";

const SEM_CREDENCIAIS = "O robô ainda não tem usuário e senha do Trier: o administrador cadastra em Administração → Integrações.";

export type EstadoTrier = { erro?: string; ok?: string; resultado?: ResultadoUpload; periodo?: string };
export type EstadoAgente = { erro?: string; token?: string; nome?: string };
export type EstadoAutomatica = { erro?: string; resultado?: ResultadoAutomatica };

function inteiro(fd: FormData, nome: string, padrao: number, min: number, max: number) {
  const n = Number.parseInt(String(fd.get(nome) ?? ""), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));
const revalidar = () => {
  revalidatePath("/conciliacao/robos");
  revalidatePath("/conciliacao/arquivos");
  revalidatePath("/conciliacao/nova");
};

/** Entra no Trier, gera o relatório de contas a pagar em Excel e guarda como um arquivo da conciliação. */
export async function buscarTrier(_prev: EstadoTrier, fd: FormData): Promise<EstadoTrier> {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return { erro: "Só Administrador e Financeiro buscam do Trier." };
  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!statusTrier(cred).configurado) return { erro: SEM_CREDENCIAIS };
  const padrao = await obterConfig<ConfigTrier>("trier", CONFIG_TRIER_PADRAO);
  const cfg: ConfigTrier = { diasAntes: inteiro(fd, "diasAntes", padrao.diasAntes, 0, 90), diasDepois: inteiro(fd, "diasDepois", padrao.diasDepois, 1, 180) };
  try {
    const r = await buscarRelatorioTrier(cred, cfg);
    const copia = new Uint8Array(r.conteudo);
    const file = new File([copia.buffer as ArrayBuffer], r.nome, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const resultado = await guardarArquivo(supabase, sessao.id, file, "trier", "robo_trier", { meta: { robo: { periodo: r.periodo, ...cfg } } });
    revalidar();
    if (!resultado.ok) return { erro: `O relatório veio do Trier, mas não deu para guardar: ${resultado.mensagem}`, periodo: r.periodo };
    return { resultado, periodo: r.periodo };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

/** Roda já a conciliação automática (relatório do Trier + retornos do banco → uma conciliação por faixa), mesmo sem arquivo novo. */
export async function rodarAutomaticaAgora(_prev: EstadoAutomatica, _fd: FormData): Promise<EstadoAutomatica> {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return { erro: "Só Administrador e Financeiro rodam a conciliação." };
  const supabase = await createClient();
  try {
    const resultado = await rodarConciliacaoAutomatica(supabase, await credenciaisTrier(supabase), { userId: sessao.id, forcar: true });
    revalidar();
    revalidatePath("/conciliacao");
    revalidatePath("/conciliacao/pendencias");
    return { resultado };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

/** Só testa usuário e senha do robô. */
export async function testarTrier(_prev: EstadoTrier, _fd: FormData): Promise<EstadoTrier> {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return { erro: "Sem permissão." };
  const cred = await credenciaisTrier(await createClient());
  if (!statusTrier(cred).configurado) return { erro: SEM_CREDENCIAIS };
  try {
    await testarLoginTrier(cred);
    return { ok: "Login no Trier OK: usuário e senha do robô funcionam." };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

/** Período padrão da busca (dias antes/depois de hoje). Só admin. */
export async function salvarConfigTrier(fd: FormData) {
  const sessao = await getSessao();
  if (!podeConfigurarConciliacao(sessao.papel)) return;
  const valor: ConfigTrier = { diasAntes: inteiro(fd, "diasAntes", CONFIG_TRIER_PADRAO.diasAntes, 0, 90), diasDepois: inteiro(fd, "diasDepois", CONFIG_TRIER_PADRAO.diasDepois, 1, 180) };
  const supabase = await createClient();
  const { error } = await supabase.from("conc_config").upsert({ chave: "trier", valor, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_config", registroId: null, novo: { chave: "trier", ...valor } });
  revalidatePath("/conciliacao/robos");
}

/** Gera a chave de um agente (aparece uma vez; o banco guarda só o hash). Só admin. */
export async function criarAgente(_prev: EstadoAgente, fd: FormData): Promise<EstadoAgente> {
  const sessao = await getSessao();
  if (!podeConfigurarConciliacao(sessao.papel)) return { erro: "Só o administrador gera chaves de agente." };
  const nome = String(fd.get("nome") ?? "").trim().slice(0, 60);
  if (nome.length < 2) return { erro: "Dê um nome ao agente (ex.: PC do Luiz – Itaú Mailbox)." };
  const token = gerarTokenAgente();
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_agentes").insert({ nome, token_hash: hashToken(token), criado_por: sessao.id }).select("id").single();
  if (error) return { erro: `Não consegui registrar o agente: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "conc_agentes", registroId: data.id, novo: { nome } });
  revalidatePath("/conciliacao/robos");
  return { token, nome };
}

/** Revoga a chave (o agente para de conseguir enviar). Só admin. */
export async function revogarAgente(fd: FormData) {
  const sessao = await getSessao();
  if (!podeConfigurarConciliacao(sessao.papel)) return;
  const id = String(fd.get("id") ?? "");
  if (!ehUuid(id)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("conc_agentes").update({ revogado_em: new Date().toISOString() }).eq("id", id).is("revogado_em", null).select("nome").maybeSingle();
  if (error) throw new Error(error.message);
  if (data) await registrarAuditoria(supabase, { userId: sessao.id, acao: "inativar", entidade: "conc_agentes", registroId: id, novo: { nome: data.nome, revogado: true } });
  revalidatePath("/conciliacao/robos");
}
