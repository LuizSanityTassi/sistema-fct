"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerDecimal } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";
import { TIPOS_ATIVO } from "@/lib/ti/rotulos";

export type EstadoAtivo = { erro?: string; erros?: Record<string, string> };

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

async function exigirTi() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "ti" ? sessao : null;
}

const CODIGOS_TIPO = TIPOS_ATIVO.map((t) => t.codigo) as [string, ...string[]];

const esquema = z.object({
  branch_id: z.uuid({ error: "Selecione a unidade." }),
  tipo: z.enum(CODIGOS_TIPO, { error: "Escolha o tipo." }),
  descricao: z.string({ error: "Informe marca/modelo." }).trim().min(2, "Mínimo de 2 caracteres.").max(120, "Máximo de 120 caracteres."),
  patrimonio: z.string().trim().max(40, "Máximo de 40 caracteres.").optional(),
  numero_serie: z.string().trim().max(80, "Máximo de 80 caracteres.").optional(),
  status: z.enum(Constants.public.Enums.it_asset_status, { error: "Situação inválida." }),
  responsavel_employee_id: z.uuid({ error: "Responsável inválido." }).optional(),
  data_aquisicao: z.iso.date({ error: "Data inválida." }).optional(),
  valor: z.preprocess(
    (v) => (v === undefined ? undefined : typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: "Valor inválido." }).min(0, "Não pode ser negativo.").max(10_000_000, "Valor muito alto.").optional(),
  ),
  fornecedor: z.string().trim().max(80, "Máximo de 80 caracteres.").optional(),
  observacoes: z.string().trim().max(1000, "Máximo de 1000 caracteres.").optional(),
});

const CAMPOS = ["branch_id", "tipo", "descricao", "patrimonio", "numero_serie", "status", "responsavel_employee_id", "data_aquisicao", "valor", "fornecedor", "observacoes"] as const;

export async function salvarAtivo(id: string | null, _prev: EstadoAtivo, fd: FormData): Promise<EstadoAtivo> {
  const sessao = await exigirTi();
  if (!sessao) return { erro: "Só Administrador e TI alteram o inventário." };

  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;
  const registro = {
    branch_id: d.branch_id,
    tipo: d.tipo,
    descricao: d.descricao,
    patrimonio: d.patrimonio ?? null,
    numero_serie: d.numero_serie ?? null,
    status: d.status,
    responsavel_employee_id: d.responsavel_employee_id ?? null,
    data_aquisicao: d.data_aquisicao ?? null,
    valor: d.valor ?? null,
    fornecedor: d.fornecedor ?? null,
    observacoes: d.observacoes ?? null,
  };

  const supabase = await createClient();
  let destino = id;
  if (id) {
    const { data: atual } = await supabase.from("it_assets").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Ativo não encontrado." };
    const { error } = await supabase.from("it_assets").update(registro).eq("id", id);
    if (error) return { erro: error.code === "23505" ? "Já existe um ativo com esse patrimônio." : `Não foi possível salvar: ${error.message}` };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "it_assets", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criado, error } = await supabase.from("it_assets").insert(registro).select("id").single();
    if (error) return { erro: error.code === "23505" ? "Já existe um ativo com esse patrimônio." : `Não foi possível salvar: ${error.message}` };
    destino = criado.id;
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "it_assets", registroId: destino, novo: registro });
  }
  revalidatePath("/ti");
  revalidatePath("/ti/ativos");
  revalidatePath(`/ti/ativos/${destino}`);
  redirect(`/ti/ativos/${destino}?salvo=1`);
}

/** Muda a situação do ativo (uso / estoque / manutenção / baixado). Só admin/TI. */
export async function alterarStatusAtivo(fd: FormData) {
  const sessao = await exigirTi();
  if (!sessao) return;
  const id = String(fd.get("id") ?? "");
  const parse = z.enum(Constants.public.Enums.it_asset_status).safeParse(fd.get("status"));
  if (!parse.success) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("it_assets").select("id, status, branch_id").eq("id", id).maybeSingle();
  if (!atual || atual.status === parse.data) return;
  const { error } = await supabase.from("it_assets").update({ status: parse.data }).eq("id", id);
  if (error) return;
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: parse.data === "baixado" ? "inativar" : "editar",
    entidade: "it_assets",
    registroId: id,
    anterior: { status: atual.status },
    novo: { status: parse.data },
  });
  revalidatePath("/ti");
  revalidatePath("/ti/ativos");
  revalidatePath(`/ti/ativos/${id}`);
}
