"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { ehStatusPendencia } from "@/lib/conciliacao/rotulos";
import { executarConciliacao, guardarArquivo, type ResultadoUpload } from "@/lib/conciliacao/servico";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type EstadoUpload = { erro?: string; resultados?: ResultadoUpload[] };
export type EstadoConciliar = { erro?: string };
export type EstadoDePara = { erro?: string; erros?: Record<string, string> };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}
const uuids = (fd: FormData, nome: string) => fd.getAll(nome).filter((v): v is string => typeof v === "string" && ehUuid(v));

async function exigirConciliar() {
  const sessao = await getSessao();
  return podeConciliar(sessao.papel) ? sessao : null;
}

function revalidar() {
  revalidatePath("/conciliacao");
  revalidatePath("/conciliacao/arquivos");
  revalidatePath("/conciliacao/pendencias");
}

// ---------- arquivos ----------

export async function enviarArquivos(_prev: EstadoUpload, fd: FormData): Promise<EstadoUpload> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro enviam arquivos." };
  const arquivos = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) return { erro: "Escolha pelo menos um arquivo." };
  if (arquivos.length > 40) return { erro: "Envie até 40 arquivos por vez." };
  const tipo = texto(fd, "tipo");
  const tipoPedido = tipo === "dda_ret" || tipo === "dda_planilha" || tipo === "trier" ? tipo : "auto";
  const supabase = await createClient();
  const resultados: ResultadoUpload[] = [];
  for (const f of arquivos) resultados.push(await guardarArquivo(supabase, sessao.id, f, tipoPedido));
  revalidar();
  return { resultados };
}

export async function arquivarArquivo(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const id = texto(fd, "id");
  const motivo = texto(fd, "motivo");
  if (!id || !ehUuid(id)) return;
  if (!motivo || motivo.length < 3) redirect("/conciliacao/arquivos?erro=" + encodeURIComponent("Informe o motivo para arquivar."));
  const supabase = await createClient();
  const { count } = await supabase.from("conc_conciliacoes").select("id", { count: "exact", head: true }).contains("arquivos", [id]);
  if (count) redirect("/conciliacao/arquivos?erro=" + encodeURIComponent(`Este arquivo foi usado em ${count} conciliação(ões) e fica guardado para auditoria.`));
  const { error } = await supabase.from("conc_arquivos").update({ arquivado_em: new Date().toISOString(), arquivado_por: sessao.id, motivo_arquivo: motivo.slice(0, 300) }).eq("id", id);
  if (error) redirect("/conciliacao/arquivos?erro=" + encodeURIComponent(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "inativar", entidade: "conc_arquivos", registroId: id, novo: { motivo } });
  revalidar();
  redirect("/conciliacao/arquivos?ok=arquivado");
}

export async function desarquivarArquivo(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const id = texto(fd, "id");
  if (!id || !ehUuid(id)) return;
  const supabase = await createClient();
  const { error } = await supabase.from("conc_arquivos").update({ arquivado_em: null, arquivado_por: null, motivo_arquivo: null }).eq("id", id);
  if (error) redirect("/conciliacao/arquivos?arquivados=1&erro=" + encodeURIComponent(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "reativar", entidade: "conc_arquivos", registroId: id });
  revalidar();
  redirect("/conciliacao/arquivos?arquivados=1&ok=desarquivado");
}

// ---------- conciliar ----------

export async function conciliar(_prev: EstadoConciliar, fd: FormData): Promise<EstadoConciliar> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro conciliam." };
  const filMin = Number.parseInt(texto(fd, "fil_min") ?? "", 10);
  const filMax = Number.parseInt(texto(fd, "fil_max") ?? "", 10);
  if (!Number.isFinite(filMin) || !Number.isFinite(filMax) || filMin < 1 || filMax < filMin || filMax > 9999) return { erro: "Informe a faixa de filiais (ex.: 301 a 504)." };
  const supabase = await createClient();
  let id: string;
  try {
    const r = await executarConciliacao(supabase, sessao.id, { ddaIds: uuids(fd, "dda"), trierIds: uuids(fd, "trier"), filMin, filMax, titulo: texto(fd, "titulo") });
    id = r.id;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível conciliar." };
  }
  revalidar();
  redirect(`/conciliacao/${id}?nova=1`);
}

// ---------- pendências ----------

type Historico = { status: string; quando: string; por: string; motivo: string }[];

export async function alterarStatusPendencias(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const voltar = texto(fd, "voltar") ?? "/conciliacao/pendencias";
  const status = texto(fd, "status");
  const motivo = texto(fd, "motivo")?.slice(0, 500);
  const chaves = fd.getAll("chave").filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 80);
  if (!ehStatusPendencia(status) || !chaves.length) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent("Selecione pendências e a situação.")}`);
  if ((status === "resolvido" || status === "justificado") && (!motivo || motivo.length < 3)) {
    redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent("Escreva o motivo (obrigatório para Resolvido e Ignorado/Justificado).")}`);
  }
  const supabase = await createClient();
  const { data: atuais, error } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(0, 500));
  if (error) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent(error.message)}`);
  const agora = new Date().toISOString();
  const linhas = (atuais ?? []).map((p) => ({
    ...p,
    status,
    motivo: motivo ?? null,
    auto: false,
    regra_id: null, // decisão de pessoa: regra nenhuma mexe mais
    decidido_por: sessao.id,
    decidido_em: agora,
    historico: [...(((p.historico as Historico | null) ?? [])), { status, quando: agora, por: sessao.nome, motivo: motivo ?? "" }] as Json,
  }));
  if (linhas.length) {
    const { error: eUp } = await supabase.from("conc_pendencias").upsert(linhas, { onConflict: "chave" });
    if (eUp) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent(eUp.message)}`);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_pendencias", novo: { qtd: linhas.length, status, motivo } });
  }
  revalidar();
  redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}ok=${linhas.length}`);
}

export async function atribuirPendencias(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const voltar = texto(fd, "voltar") ?? "/conciliacao/pendencias";
  const responsavel = texto(fd, "responsavel");
  const chaves = fd.getAll("chave").filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 80);
  if (!chaves.length) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent("Selecione pendências.")}`);
  if (responsavel && !ehUuid(responsavel)) return;
  const supabase = await createClient();
  let nomeResp = "";
  if (responsavel) {
    const { data: perfil } = await supabase.from("profiles").select("nome, papel, ativo").eq("id", responsavel).maybeSingle();
    if (!perfil || !perfil.ativo || !podeConciliar(perfil.papel)) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent("Responsável inválido.")}`);
    nomeResp = perfil.nome;
  }
  const { data: atuais } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(0, 500));
  const agora = new Date().toISOString();
  const linhas = (atuais ?? []).map((p) => ({
    ...p,
    responsavel: responsavel ?? null,
    atribuido_em: agora,
    historico: [...(((p.historico as Historico | null) ?? [])), { status: p.status, quando: agora, por: sessao.nome, motivo: responsavel ? `Atribuída para ${nomeResp}` : "Responsável removido" }] as Json,
  }));
  if (linhas.length) {
    const { error } = await supabase.from("conc_pendencias").upsert(linhas, { onConflict: "chave" });
    if (error) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent(error.message)}`);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_pendencias", novo: { qtd: linhas.length, responsavel: nomeResp || null } });
  }
  revalidar();
  redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}ok=${linhas.length}`);
}

// ---------- de-para e aprendizado ----------

const esquemaDePara = z.object({
  dda: z.string({ error: "Informe como o nome aparece no DDA." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  fornecedores: z.string().trim().max(400, "Máximo de 400 caracteres.").optional(),
  alerta: z.string().trim().max(120, "Máximo de 120 caracteres.").optional(),
});

export async function salvarDePara(id: string | null, _prev: EstadoDePara, fd: FormData): Promise<EstadoDePara> {
  const sessao = await exigirConciliar();
  if (!sessao) return { erro: "Só Administrador e Financeiro alteram o de-para." };
  const r = esquemaDePara.safeParse({ dda: texto(fd, "dda"), fornecedores: texto(fd, "fornecedores"), alerta: texto(fd, "alerta") });
  if (!r.success) {
    const { fieldErrors } = z.flattenError(r.error);
    return { erro: "Confira os campos destacados.", erros: Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, (v as string[] | undefined)?.[0] ?? ""])) };
  }
  const fornecedores = (r.data.fornecedores ?? "").split(/[\n;,]/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!fornecedores.length && !r.data.alerta) return { erro: "Informe o fornecedor real ou um alerta (ex.: INDEVIDO - não pagar).", erros: { fornecedores: "Obrigatório sem alerta." } };
  const registro = { dda: r.data.dda.toUpperCase(), fornecedores, alerta: r.data.alerta ?? null, ativo: fd.get("ativo") === null && id ? false : true };
  if (id && fd.has("ativo_presente")) registro.ativo = fd.get("ativo") === "on";

  const supabase = await createClient();
  if (id) {
    const { data: atual } = await supabase.from("conc_depara").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Registro não encontrado." };
    const { error } = await supabase.from("conc_depara").update(registro).eq("id", id);
    if (error) return { erro: error.message };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_depara", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criado, error } = await supabase.from("conc_depara").insert(registro).select("id").single();
    if (error) return { erro: error.message };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "conc_depara", registroId: criado.id, novo: registro });
  }
  revalidatePath("/conciliacao/de-para");
  redirect("/conciliacao/de-para?ok=1");
}

export async function excluirDePara(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const id = texto(fd, "id");
  if (!id || !ehUuid(id)) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("conc_depara").select("*").eq("id", id).maybeSingle();
  if (!atual) return;
  const { error } = await supabase.from("conc_depara").delete().eq("id", id);
  if (error) redirect("/conciliacao/de-para?erro=" + encodeURIComponent(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "conc_depara", registroId: id, anterior: atual });
  revalidatePath("/conciliacao/de-para");
  redirect("/conciliacao/de-para?ok=1");
}

/** Confirma, bloqueia, desbloqueia ou remove uma correspondência aprendida. */
export async function marcarAprendizado(fd: FormData) {
  const sessao = await exigirConciliar();
  if (!sessao) return;
  const id = texto(fd, "id");
  const acao = texto(fd, "acao");
  if (!id || !ehUuid(id)) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("conc_aprendizado").select("*").eq("id", id).maybeSingle();
  if (!atual) return;
  let patch: { confirmado?: boolean; bloqueado?: boolean } | null = null;
  if (acao === "confirmar") patch = { confirmado: true, bloqueado: false };
  else if (acao === "bloquear") patch = { bloqueado: true, confirmado: false };
  else if (acao === "desbloquear") patch = { bloqueado: false };
  if (patch) {
    const { error } = await supabase.from("conc_aprendizado").update(patch).eq("id", id);
    if (error) redirect("/conciliacao/de-para?erro=" + encodeURIComponent(error.message));
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "conc_aprendizado", registroId: id, anterior: { confirmado: atual.confirmado, bloqueado: atual.bloqueado }, novo: patch });
  } else if (acao === "remover") {
    const { error } = await supabase.from("conc_aprendizado").delete().eq("id", id);
    if (error) redirect("/conciliacao/de-para?erro=" + encodeURIComponent(error.message));
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "conc_aprendizado", registroId: id, anterior: atual });
  }
  revalidatePath("/conciliacao/de-para");
  redirect("/conciliacao/de-para?ok=1#aprendizado");
}
