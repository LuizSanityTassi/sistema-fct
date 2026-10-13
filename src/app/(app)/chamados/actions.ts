"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao, type Sessao } from "@/lib/auth/session";
import {
  papelAtende,
  STATUS_CHAMADO_LABEL,
  TRANSICOES,
  TRANSICOES_SOLICITANTE,
  type StatusChamado,
} from "@/lib/chamados/rotulos";
import { BUCKET_DOCUMENTOS, nomeSeguro, validarArquivo } from "@/lib/rh/arquivos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";

export type EstadoChamado = {
  erro?: string;
  erros?: Record<string, string>;
  ok?: string;
};

type Cliente = Awaited<ReturnType<typeof createClient>>;

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function errosDoZod(e: z.ZodError) {
  const { fieldErrors } = z.flattenError(e);
  const erros: Record<string, string> = {};
  for (const [campo, mensagens] of Object.entries(fieldErrors)) {
    const primeira = (mensagens as string[] | undefined)?.[0];
    if (primeira) erros[campo] = primeira;
  }
  return erros;
}

async function registrarHistorico(
  supabase: Cliente,
  ticketId: string,
  autorId: string,
  acao: string,
  de?: string | null,
  para?: string | null,
) {
  const { error } = await supabase
    .from("ticket_history")
    .insert({ ticket_id: ticketId, author_id: autorId, acao, de: de ?? null, para: para ?? null });
  if (error) console.error("[chamados] histórico:", error.message);
}

async function anexarArquivo(supabase: Cliente, ticketId: string, autorId: string, arquivo: File) {
  const caminho = `chamados/${ticketId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, await arquivo.arrayBuffer(), { contentType: arquivo.type, upsert: false });
  if (erroUpload) return `Falha no envio do anexo: ${erroUpload.message}`;
  const { error } = await supabase
    .from("ticket_attachments")
    .insert({ ticket_id: ticketId, nome: arquivo.name, storage_path: caminho, uploaded_by: autorId });
  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return `Não foi possível registrar o anexo: ${error.message}`;
  }
  return null;
}

type TicketBase = { id: string; solicitante: string | null; responsavel: string | null; categoria: string; status: StatusChamado };

function podeAtender(sessao: Sessao, t: TicketBase) {
  return t.responsavel === sessao.id || papelAtende(sessao.papel, t.categoria as never);
}

// ---------- abrir ----------

const esquemaAbertura = z.object({
  titulo: z.string({ error: "Informe um título." }).trim().min(5, "Mínimo de 5 caracteres.").max(120, "Máximo de 120 caracteres."),
  descricao: z.string().trim().max(4000, "Máximo de 4000 caracteres.").optional(),
  categoria: z.enum(Constants.public.Enums.ticket_category, { error: "Escolha a categoria." }),
  prioridade: z.enum(Constants.public.Enums.ticket_priority, { error: "Prioridade inválida." }),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
});

export async function abrirChamado(_prev: EstadoChamado, fd: FormData): Promise<EstadoChamado> {
  const sessao = await getSessao();
  const r = esquemaAbertura.safeParse({
    titulo: texto(fd, "titulo"),
    descricao: texto(fd, "descricao"),
    categoria: texto(fd, "categoria"),
    prioridade: texto(fd, "prioridade") ?? "normal",
    branch_id: texto(fd, "branch_id"),
  });
  const erros = r.success ? {} : errosDoZod(r.error);
  const arq = validarArquivo(fd.get("arquivo"), false);
  if (arq.erro) erros.arquivo = arq.erro;
  if (!r.success || Object.keys(erros).length > 0) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { data: criado, error } = await supabase
    .from("tickets")
    .insert({
      titulo: r.data.titulo,
      descricao: r.data.descricao ?? null,
      categoria: r.data.categoria,
      prioridade: r.data.prioridade,
      branch_id: r.data.branch_id ?? sessao.branchId ?? null,
      solicitante: sessao.id,
      status: "aberto",
    })
    .select("id, numero")
    .single();
  if (error) return { erro: `Não foi possível abrir o chamado: ${error.message}` };

  await registrarHistorico(supabase, criado.id, sessao.id, "aberto", null, r.data.titulo);
  if (arq.arquivo) {
    const erroAnexo = await anexarArquivo(supabase, criado.id, sessao.id, arq.arquivo);
    if (erroAnexo) console.error("[chamados]", erroAnexo);
  }
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "criar",
    entidade: "tickets",
    registroId: criado.id,
    novo: { numero: criado.numero, titulo: r.data.titulo, categoria: r.data.categoria, prioridade: r.data.prioridade },
  });
  revalidatePath("/chamados");
  redirect(`/chamados/${criado.id}?aberto=1`);
}

// ---------- comentar ----------

export async function comentarChamado(ticketId: string, _prev: EstadoChamado, fd: FormData): Promise<EstadoChamado> {
  const sessao = await getSessao();
  const comentario = texto(fd, "comentario");
  const arq = validarArquivo(fd.get("arquivo"), false);
  if (arq.erro) return { erro: "Confira o anexo.", erros: { arquivo: arq.erro } };
  if (!comentario && !arq.arquivo) return { erro: "Escreva um comentário ou anexe um arquivo.", erros: { comentario: "Obrigatório." } };
  if (comentario && comentario.length > 4000) return { erro: "Comentário muito longo.", erros: { comentario: "Máximo de 4000 caracteres." } };

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, solicitante, responsavel, categoria, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { erro: "Chamado não encontrado." };

  if (comentario) {
    const { error } = await supabase
      .from("ticket_comments")
      .insert({ ticket_id: ticketId, author_id: sessao.id, comentario });
    if (error) return { erro: `Não foi possível comentar: ${error.message}` };
  }
  if (arq.arquivo) {
    const erroAnexo = await anexarArquivo(supabase, ticketId, sessao.id, arq.arquivo);
    if (erroAnexo) return { erro: erroAnexo };
  }
  // Resposta do solicitante tira o chamado de "aguardando solicitante".
  if (t.status === "aguardando_usuario" && t.solicitante === sessao.id) {
    const { error } = await supabase.from("tickets").update({ status: "em_atendimento" }).eq("id", ticketId);
    if (!error) {
      await registrarHistorico(supabase, ticketId, sessao.id, "status", STATUS_CHAMADO_LABEL.aguardando_usuario, STATUS_CHAMADO_LABEL.em_atendimento);
    }
  }
  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/chamados");
  return { ok: "Enviado." };
}

// ---------- assumir / atribuir ----------

export async function assumirChamado(fd: FormData) {
  const sessao = await getSessao();
  const id = String(fd.get("id") ?? "");
  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, solicitante, responsavel, categoria, status, quem_atende:profiles!tickets_responsavel_fkey(nome)")
    .eq("id", id)
    .maybeSingle();
  if (!t || !papelAtende(sessao.papel, t.categoria)) return;

  const novoStatus: StatusChamado = t.status === "aberto" ? "em_analise" : t.status;
  const { error } = await supabase.from("tickets").update({ responsavel: sessao.id, status: novoStatus }).eq("id", id);
  if (error) return;
  await registrarHistorico(supabase, id, sessao.id, "responsavel", t.quem_atende?.nome ?? null, sessao.nome);
  if (novoStatus !== t.status) {
    await registrarHistorico(supabase, id, sessao.id, "status", STATUS_CHAMADO_LABEL[t.status], STATUS_CHAMADO_LABEL[novoStatus]);
  }
  revalidatePath(`/chamados/${id}`);
  revalidatePath("/chamados");
}

export async function atribuirChamado(ticketId: string, _prev: EstadoChamado, fd: FormData): Promise<EstadoChamado> {
  const sessao = await getSessao();
  const responsavel = texto(fd, "responsavel");
  if (!responsavel || !z.uuid().safeParse(responsavel).success) return { erro: "Escolha o responsável." };

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, solicitante, responsavel, categoria, status, quem_atende:profiles!tickets_responsavel_fkey(nome)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { erro: "Chamado não encontrado." };
  if (!podeAtender(sessao, t)) return { erro: "Você não atende esta categoria." };

  const { data: novo } = await supabase.from("profiles").select("id, nome").eq("id", responsavel).maybeSingle();
  if (!novo) return { erro: "Responsável não encontrado." };

  const novoStatus: StatusChamado = t.status === "aberto" ? "em_analise" : t.status;
  const { error } = await supabase.from("tickets").update({ responsavel: novo.id, status: novoStatus }).eq("id", ticketId);
  if (error) return { erro: `Não foi possível atribuir: ${error.message}` };
  await registrarHistorico(supabase, ticketId, sessao.id, "responsavel", t.quem_atende?.nome ?? null, novo.nome);
  if (novoStatus !== t.status) {
    await registrarHistorico(supabase, ticketId, sessao.id, "status", STATUS_CHAMADO_LABEL[t.status], STATUS_CHAMADO_LABEL[novoStatus]);
  }
  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/chamados");
  return { ok: `Atribuído a ${novo.nome}.` };
}

// ---------- status ----------

export async function alterarStatusChamado(ticketId: string, _prev: EstadoChamado, fd: FormData): Promise<EstadoChamado> {
  const sessao = await getSessao();
  const status = texto(fd, "status");
  const comentario = texto(fd, "comentario");
  const parse = z.enum(Constants.public.Enums.ticket_status).safeParse(status);
  if (!parse.success) return { erro: "Situação inválida." };
  const novo = parse.data;

  const supabase = await createClient();
  const { data: t } = await supabase
    .from("tickets")
    .select("id, solicitante, responsavel, categoria, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (!t) return { erro: "Chamado não encontrado." };

  const atendente = podeAtender(sessao, t);
  const permitidas = atendente ? TRANSICOES[t.status] : t.solicitante === sessao.id ? TRANSICOES_SOLICITANTE[t.status] : [];
  if (!permitidas.includes(novo)) {
    return { erro: `Não é possível mudar de "${STATUS_CHAMADO_LABEL[t.status]}" para "${STATUS_CHAMADO_LABEL[novo]}".` };
  }

  const patch = {
    status: novo,
    resolved_at: novo === "resolvido" ? new Date().toISOString() : novo === "aberto" ? null : undefined,
  };
  const { error } = await supabase.from("tickets").update(patch).eq("id", ticketId);
  if (error) return { erro: `Não foi possível alterar: ${error.message}` };

  if (comentario) {
    await supabase.from("ticket_comments").insert({ ticket_id: ticketId, author_id: sessao.id, comentario });
  }
  await registrarHistorico(supabase, ticketId, sessao.id, "status", STATUS_CHAMADO_LABEL[t.status], STATUS_CHAMADO_LABEL[novo]);
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "tickets",
    registroId: ticketId,
    anterior: { status: t.status },
    novo: { status: novo },
  });
  revalidatePath(`/chamados/${ticketId}`);
  revalidatePath("/chamados");
  return { ok: `Chamado ${STATUS_CHAMADO_LABEL[novo].toLowerCase()}.` };
}
