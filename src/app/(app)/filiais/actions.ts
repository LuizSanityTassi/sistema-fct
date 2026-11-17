"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cnpjValido, formatarCnpj } from "@/lib/validacao/cnpj";

export type EstadoFormulario = {
  erro?: string;
  /** Erro por campo (nome do campo → mensagem). */
  erros?: Record<string, string>;
};

// ---------- utilidades ----------

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function lerCampos(fd: FormData, nomes: readonly string[]) {
  return Object.fromEntries(nomes.map((n) => [n, texto(fd, n)]));
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

function mensagemErroBanco(e: PostgrestError) {
  if (e.code === "23505") return "Já existe um registro com esse código/CNPJ neste grupo.";
  if (e.code === "42501") return "Sem permissão para esta operação.";
  return `Não foi possível salvar: ${e.message}`;
}

const opcional = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`).optional();

const cnpjOpcional = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || cnpjValido(v), { error: "CNPJ inválido." })
  .transform((v) => (v ? formatarCnpj(v) : undefined));

// ---------- unidades (branches) ----------

const CAMPOS_FILIAL = [
  "organization_id",
  "codigo",
  "nome",
  "razao_social",
  "cnpj",
  "regional",
  "cidade",
  "estado",
  "endereco",
  "telefone",
  "email",
  "responsavel_employee_id",
  "responsavel_nome",
] as const;

const esquemaFilial = z.object({
  organization_id: z.uuid({ error: "Selecione o grupo." }),
  codigo: z
    .string({ error: "Informe o código." })
    .trim()
    .min(2, "Mínimo de 2 caracteres.")
    .max(12, "Máximo de 12 caracteres.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, "Use só letras, números e hífen.")
    .transform((s) => s.toUpperCase()),
  nome: z
    .string({ error: "Informe o nome da unidade." })
    .trim()
    .min(2, "Mínimo de 2 caracteres.")
    .max(80, "Máximo de 80 caracteres."),
  razao_social: opcional(120),
  cnpj: cnpjOpcional,
  regional: opcional(40),
  cidade: opcional(80),
  estado: z
    .string()
    .trim()
    .length(2, "Use a sigla (ex.: SC).")
    .transform((s) => s.toUpperCase())
    .optional(),
  endereco: opcional(200),
  telefone: opcional(30),
  email: z.email({ error: "E-mail inválido." }).optional(),
  responsavel_employee_id: z.uuid({ error: "Responsável inválido." }).optional(),
  responsavel_nome: opcional(80),
});

/** Cria (id = null) ou atualiza uma unidade. Só admin. */
export async function salvarFilial(
  id: string | null,
  _prev: EstadoFormulario,
  fd: FormData,
): Promise<EstadoFormulario> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só administradores podem cadastrar ou alterar unidades." };

  const r = esquemaFilial.safeParse(lerCampos(fd, CAMPOS_FILIAL));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;

  // undefined → null para que limpar um campo no formulário também limpe no banco.
  // Responsável vinculado tem prioridade sobre o nome digitado.
  const registro = {
    organization_id: d.organization_id,
    codigo: d.codigo,
    nome: d.nome,
    razao_social: d.razao_social ?? null,
    cnpj: d.cnpj ?? null,
    regional: d.regional ?? null,
    cidade: d.cidade ?? null,
    estado: d.estado ?? null,
    endereco: d.endereco ?? null,
    telefone: d.telefone ?? null,
    email: d.email ?? null,
    responsavel_employee_id: d.responsavel_employee_id ?? null,
    responsavel_nome: d.responsavel_employee_id ? null : (d.responsavel_nome ?? null),
    // escritório: funcionários batem o ponto em qualquer filial (migração 0149)
    ponto_qualquer_filial: fd.get("ponto_qualquer_filial") === "on",
  };

  const supabase = await createClient();
  let destino = id;

  if (id) {
    const { data: atual } = await supabase.from("branches").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Unidade não encontrada." };
    const { error } = await supabase.from("branches").update(registro).eq("id", id);
    if (error) return { erro: mensagemErroBanco(error) };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "branches",
      registroId: id,
      anterior: dif.anterior,
      novo: dif.novo,
    });
  } else {
    const { data: criado, error } = await supabase.from("branches").insert(registro).select("id").single();
    if (error) return { erro: mensagemErroBanco(error) };
    destino = criado.id;
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "criar",
      entidade: "branches",
      registroId: destino,
      novo: registro,
    });
  }

  revalidatePath("/filiais");
  revalidatePath(`/filiais/${destino}`);
  redirect(`/filiais/${destino}?salvo=1`);
}

/** Inativa/reativa uma unidade (exclusão lógica). Só admin. */
export async function alterarStatusFilial(fd: FormData) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return;

  const id = String(fd.get("id") ?? "");
  const ativo = fd.get("ativo") === "true";
  const supabase = await createClient();

  const { data: atual } = await supabase.from("branches").select("id, ativo").eq("id", id).maybeSingle();
  if (!atual || atual.ativo === ativo) return;

  const { error } = await supabase.from("branches").update({ ativo }).eq("id", id);
  if (error) return;

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: ativo ? "reativar" : "inativar",
    entidade: "branches",
    registroId: id,
    anterior: { ativo: atual.ativo },
    novo: { ativo },
  });
  revalidatePath("/filiais");
  revalidatePath(`/filiais/${id}`);
}

// ---------- grupos (organizations) ----------

const CAMPOS_ORGANIZACAO = ["razao_social", "nome_fantasia", "cnpj"] as const;

const esquemaOrganizacao = z.object({
  razao_social: z
    .string({ error: "Informe a razão social." })
    .trim()
    .min(2, "Mínimo de 2 caracteres.")
    .max(120, "Máximo de 120 caracteres."),
  nome_fantasia: z
    .string({ error: "Informe o nome do grupo." })
    .trim()
    .min(2, "Mínimo de 2 caracteres.")
    .max(40, "Máximo de 40 caracteres."),
  cnpj: cnpjOpcional,
});

/** Atualiza um grupo/empresa. Só admin. */
export async function salvarOrganizacao(
  id: string,
  _prev: EstadoFormulario,
  fd: FormData,
): Promise<EstadoFormulario> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só administradores podem alterar grupos." };

  const r = esquemaOrganizacao.safeParse(lerCampos(fd, CAMPOS_ORGANIZACAO));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const registro = { ...r.data, cnpj: r.data.cnpj ?? null };

  const supabase = await createClient();
  const { data: atual } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Grupo não encontrado." };

  const { error } = await supabase.from("organizations").update(registro).eq("id", id);
  if (error) return { erro: mensagemErroBanco(error) };

  const dif = diferencas(atual, registro);
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "organizations",
    registroId: id,
    anterior: dif.anterior,
    novo: dif.novo,
  });
  revalidatePath("/filiais");
  redirect("/filiais?salvo=grupo");
}
