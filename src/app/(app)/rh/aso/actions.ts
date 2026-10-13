"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { BUCKET_DOCUMENTOS, caminhoArquivo, validarArquivo } from "@/lib/rh/arquivos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";
import type { EstadoArquivo } from "../documentos/actions";

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

const esquemaAso = z
  .object({
    tipo: z.enum(Constants.public.Enums.aso_type, { error: "Escolha o tipo de exame." }),
    data_realizacao: z.iso.date({ error: "Informe a data do exame." }),
    data_validade: z.iso.date({ error: "Data inválida." }).optional(),
    observacoes: z.string().trim().max(500, "Máximo de 500 caracteres.").optional(),
  })
  .refine((v) => !v.data_validade || v.data_validade >= v.data_realizacao, {
    error: "A validade não pode ser anterior ao exame.",
    path: ["data_validade"],
  });

/** Registra um ASO (com laudo opcional). Só admin/RH. */
export async function salvarAso(employeeId: string, _prev: EstadoArquivo, fd: FormData): Promise<EstadoArquivo> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Só Administrador e RH podem registrar ASO." };

  const r = esquemaAso.safeParse({
    tipo: texto(fd, "tipo"),
    data_realizacao: texto(fd, "data_realizacao"),
    data_validade: texto(fd, "data_validade"),
    observacoes: texto(fd, "observacoes"),
  });
  const erros = r.success ? {} : errosDoZod(r.error);
  const arq = validarArquivo(fd.get("arquivo"), false);
  if (arq.erro) erros.arquivo = arq.erro;
  if (!r.success || Object.keys(erros).length > 0) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  let caminho: string | null = null;
  if (arq.arquivo) {
    caminho = caminhoArquivo(employeeId, arq.arquivo.name, "aso");
    const { error: erroUpload } = await supabase.storage
      .from(BUCKET_DOCUMENTOS)
      .upload(caminho, await arq.arquivo.arrayBuffer(), { contentType: arq.arquivo.type, upsert: false });
    if (erroUpload) return { erro: `Falha no envio do laudo: ${erroUpload.message}` };
  }

  const registro = {
    employee_id: employeeId,
    tipo: r.data.tipo,
    data_realizacao: r.data.data_realizacao,
    data_validade: r.data.data_validade ?? null,
    observacoes: r.data.observacoes ?? null,
    storage_path: caminho,
  };
  const { data: criado, error } = await supabase.from("employee_aso").insert(registro).select("id").single();
  if (error) {
    if (caminho) await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return { erro: `Não foi possível registrar o ASO: ${error.message}` };
  }

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "criar",
    entidade: "employee_aso",
    registroId: criado.id,
    novo: { employee_id: employeeId, tipo: registro.tipo, data_realizacao: registro.data_realizacao, data_validade: registro.data_validade, laudo: !!caminho },
  });
  revalidatePath(`/rh/funcionarios/${employeeId}`);
  revalidatePath("/rh/aso");
  return { ok: "ASO registrado." };
}

/** Exclusão lógica do ASO. Só admin/RH. */
export async function removerAso(fd: FormData) {
  const sessao = await exigirRh();
  if (!sessao) return;
  const id = String(fd.get("id") ?? "");
  const supabase = await createClient();
  const { data: aso } = await supabase
    .from("employee_aso")
    .select("id, employee_id, tipo, data_realizacao")
    .eq("id", id)
    .maybeSingle();
  if (!aso) return;
  const { error } = await supabase.from("employee_aso").update({ ativo: false }).eq("id", id);
  if (error) return;
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "inativar",
    entidade: "employee_aso",
    registroId: id,
    anterior: { tipo: aso.tipo, data_realizacao: aso.data_realizacao, ativo: true },
    novo: { ativo: false },
  });
  revalidatePath(`/rh/funcionarios/${aso.employee_id}`);
  revalidatePath("/rh/aso");
}
