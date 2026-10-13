"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { BUCKET_DOCUMENTOS, caminhoArquivo, validarArquivo } from "@/lib/rh/arquivos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";

export type EstadoArquivo = {
  erro?: string;
  erros?: Record<string, string>;
  ok?: string;
};

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

async function exigirRh() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "rh" ? sessao : null;
}

const esquemaDocumento = z.object({
  categoria: z.enum(Constants.public.Enums.document_category, { error: "Escolha a categoria." }),
  nome: z.string().trim().max(120, "Máximo de 120 caracteres.").optional(),
  descricao: z.string().trim().max(500, "Máximo de 500 caracteres.").optional(),
  data_documento: z.iso.date({ error: "Data inválida." }).optional(),
});

/** Envia um documento para o Storage privado e registra na ficha. Só admin/RH. */
export async function enviarDocumento(employeeId: string, _prev: EstadoArquivo, fd: FormData): Promise<EstadoArquivo> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Só Administrador e RH podem enviar documentos." };

  const r = esquemaDocumento.safeParse({
    categoria: texto(fd, "categoria"),
    nome: texto(fd, "nome"),
    descricao: texto(fd, "descricao"),
    data_documento: texto(fd, "data_documento"),
  });
  const erros = r.success ? {} : errosDoZod(r.error);
  const arq = validarArquivo(fd.get("arquivo"), true);
  if (arq.erro) erros.arquivo = arq.erro;
  if (!r.success || !arq.arquivo) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const caminho = caminhoArquivo(employeeId, arq.arquivo.name);
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, await arq.arquivo.arrayBuffer(), { contentType: arq.arquivo.type, upsert: false });
  if (erroUpload) return { erro: `Falha no envio do arquivo: ${erroUpload.message}` };

  const registro = {
    employee_id: employeeId,
    categoria: r.data.categoria,
    nome: r.data.nome ?? arq.arquivo.name,
    descricao: r.data.descricao ?? null,
    data_documento: r.data.data_documento ?? null,
    storage_path: caminho,
    uploaded_by: sessao.id,
  };
  const { data: criado, error } = await supabase.from("employee_documents").insert(registro).select("id").single();
  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return { erro: `Não foi possível registrar o documento: ${error.message}` };
  }

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "criar",
    entidade: "employee_documents",
    registroId: criado.id,
    novo: { employee_id: employeeId, categoria: registro.categoria, nome: registro.nome, data_documento: registro.data_documento },
  });
  revalidatePath(`/rh/funcionarios/${employeeId}`);
  revalidatePath("/rh/documentos");
  return { ok: "Documento enviado." };
}

/** Exclusão lógica do documento (o arquivo fica guardado). Só admin/RH. */
export async function removerDocumento(fd: FormData) {
  const sessao = await exigirRh();
  if (!sessao) return;
  const id = String(fd.get("id") ?? "");
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("employee_documents")
    .select("id, employee_id, nome, categoria")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return;
  const { error } = await supabase.from("employee_documents").update({ ativo: false }).eq("id", id);
  if (error) return;
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "inativar",
    entidade: "employee_documents",
    registroId: id,
    anterior: { nome: doc.nome, categoria: doc.categoria, ativo: true },
    novo: { ativo: false },
  });
  revalidatePath(`/rh/funcionarios/${doc.employee_id}`);
  revalidatePath("/rh/documentos");
}
