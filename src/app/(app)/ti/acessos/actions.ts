"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { SISTEMAS_ACESSO, TIPOS_SOLICITACAO_ACESSO } from "@/lib/ti/rotulos";

export type EstadoAcesso = { erro?: string; erros?: Record<string, string> };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

const esquema = z.object({
  tipo: z.enum(Object.keys(TIPOS_SOLICITACAO_ACESSO) as [string, ...string[]], { error: "Escolha o tipo." }),
  sistema: z.enum(SISTEMAS_ACESSO as [string, ...string[]], { error: "Escolha o sistema." }),
  pessoa: z.string({ error: "Informe para quem é o acesso." }).trim().min(3, "Mínimo de 3 caracteres.").max(120, "Máximo de 120 caracteres."),
  perfil: z.string().trim().max(200, "Máximo de 200 caracteres.").optional(),
  justificativa: z.string({ error: "Explique o motivo." }).trim().min(5, "Mínimo de 5 caracteres.").max(2000, "Máximo de 2000 caracteres."),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
  urgente: z.boolean(),
});

/** Solicitação de acesso vira um chamado de TI (subcategoria "acesso") com descrição padronizada. */
export async function solicitarAcesso(_prev: EstadoAcesso, fd: FormData): Promise<EstadoAcesso> {
  const sessao = await getSessao();
  const r = esquema.safeParse({
    tipo: texto(fd, "tipo"),
    sistema: texto(fd, "sistema"),
    pessoa: texto(fd, "pessoa"),
    perfil: texto(fd, "perfil"),
    justificativa: texto(fd, "justificativa"),
    branch_id: texto(fd, "branch_id"),
    urgente: fd.get("urgente") === "on",
  });
  if (!r.success) {
    const { fieldErrors } = z.flattenError(r.error);
    const erros: Record<string, string> = {};
    for (const [campo, mensagens] of Object.entries(fieldErrors)) {
      const primeira = (mensagens as string[] | undefined)?.[0];
      if (primeira) erros[campo] = primeira;
    }
    return { erro: "Confira os campos destacados.", erros };
  }
  const d = r.data;
  const rotuloTipo = TIPOS_SOLICITACAO_ACESSO[d.tipo as keyof typeof TIPOS_SOLICITACAO_ACESSO];
  const titulo = `${rotuloTipo}: ${d.sistema} — ${d.pessoa}`.slice(0, 120);
  const descricao = [
    `Tipo: ${rotuloTipo}`,
    `Sistema: ${d.sistema}`,
    `Para: ${d.pessoa}`,
    d.perfil ? `Perfil/permissões: ${d.perfil}` : null,
    `Solicitado por: ${sessao.nome} (${sessao.email})`,
    "",
    `Justificativa: ${d.justificativa}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const supabase = await createClient();
  const { data: criado, error } = await supabase
    .from("tickets")
    .insert({
      titulo,
      descricao,
      categoria: "ti",
      subcategoria: "acesso",
      prioridade: d.urgente ? "alta" : "normal",
      branch_id: d.branch_id ?? sessao.branchId ?? null,
      solicitante: sessao.id,
      status: "aberto",
    })
    .select("id, numero")
    .single();
  if (error) return { erro: `Não foi possível abrir a solicitação: ${error.message}` };

  await supabase.from("ticket_history").insert({ ticket_id: criado.id, author_id: sessao.id, acao: "aberto", para: titulo });
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "criar",
    entidade: "tickets",
    registroId: criado.id,
    novo: { numero: criado.numero, titulo, categoria: "ti", subcategoria: "acesso" },
  });
  revalidatePath("/chamados");
  revalidatePath("/ti");
  redirect(`/chamados/${criado.id}?aberto=1`);
}
