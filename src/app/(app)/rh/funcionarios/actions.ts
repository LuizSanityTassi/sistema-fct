"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { hojeIso, lerDecimal } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";
import { cpfValido, formatarCpf } from "@/lib/validacao/cpf";

export type EstadoFormulario = {
  erro?: string;
  erros?: Record<string, string>;
};

const PAPEIS_RH = ["admin", "rh"] as const;
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

function mensagemErroBanco(e: PostgrestError) {
  if (e.code === "23505") return "Já existe um funcionário com essa matrícula nesta unidade.";
  if (e.code === "42501") return "Sem permissão para esta operação.";
  return `Não foi possível salvar: ${e.message}`;
}

const opcional = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`).optional();
const dataOpcional = z.iso.date({ error: "Data inválida." }).optional();

/** Número vindo de texto ("2.022,02" / "220"), opcional. */
const numeroOpcional = (max: number, mensagem = "Número inválido.") =>
  z.preprocess(
    (v) => (typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: mensagem }).min(0, "Não pode ser negativo.").max(max, `Máximo: ${max}.`).optional(),
  );

const inteiroOpcional = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: "Número inválido." }).int("Use um número inteiro.").min(0).max(max).optional(),
  );

const CAMPOS = [
  "branch_id",
  "nome",
  "matricula",
  "cpf",
  "data_nascimento",
  "email",
  "telefone",
  "cargo",
  "tipo_contrato",
  "categoria",
  "horas_mes",
  "num_filhos",
  "num_dependentes",
  "data_admissao",
  "observacoes",
  "salario",
] as const;

const esquema = z.object({
  branch_id: z.uuid({ error: "Selecione a unidade." }),
  nome: z
    .string({ error: "Informe o nome." })
    .trim()
    .min(3, "Mínimo de 3 caracteres.")
    .max(120, "Máximo de 120 caracteres."),
  matricula: opcional(20),
  cpf: z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || cpfValido(v), { error: "CPF inválido." })
    .transform((v) => (v ? formatarCpf(v) : undefined)),
  data_nascimento: dataOpcional,
  email: z.email({ error: "E-mail inválido." }).optional(),
  telefone: opcional(30),
  cargo: opcional(80),
  tipo_contrato: z.enum(Constants.public.Enums.contract_type, { error: "Tipo de contrato inválido." }).optional(),
  categoria: opcional(30),
  horas_mes: numeroOpcional(400, "Horas inválidas."),
  num_filhos: inteiroOpcional(30),
  num_dependentes: inteiroOpcional(30),
  data_admissao: dataOpcional,
  observacoes: opcional(2000),
  salario: numeroOpcional(1_000_000, "Salário inválido."),
});

/** Cria (id = null) ou atualiza um funcionário. Só admin/RH. */
export async function salvarFuncionario(
  id: string | null,
  _prev: EstadoFormulario,
  fd: FormData,
): Promise<EstadoFormulario> {
  const sessao = await getSessao();
  if (!PAPEIS_RH.includes(sessao.papel as (typeof PAPEIS_RH)[number])) {
    return { erro: "Só Administrador e RH podem cadastrar ou alterar funcionários." };
  }

  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;

  const registro = {
    branch_id: d.branch_id,
    nome: d.nome,
    matricula: d.matricula ?? null,
    cpf: d.cpf ?? null,
    data_nascimento: d.data_nascimento ?? null,
    email: d.email ?? null,
    telefone: d.telefone ?? null,
    cargo: d.cargo ?? null,
    tipo_contrato: d.tipo_contrato ?? null,
    categoria: d.categoria ?? null,
    horas_mes: d.horas_mes ?? null,
    num_filhos: d.num_filhos ?? null,
    num_dependentes: d.num_dependentes ?? null,
    contribui_sindicato: fd.get("contribui_sindicato") === "on",
    optante_fgts: fd.get("optante_fgts") === "on",
    data_admissao: d.data_admissao ?? null,
    observacoes: d.observacoes ?? null,
  };

  const supabase = await createClient();
  let destino = id;
  let mudouFilial = false;

  if (id) {
    const { data: atual } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Funcionário não encontrado." };
    // trocar a filial leva junto todos os lançamentos da folha da pessoa (gatilho do banco, migrações 0058/0059)
    const { error } = await supabase.from("employees").update(registro).eq("id", id);
    if (error) return { erro: mensagemErroBanco(error) };
    mudouFilial = atual.branch_id !== registro.branch_id;
    const dif = diferencas(atual, registro);
    // CPF não vai para a auditoria em claro
    if ("cpf" in dif.novo) {
      dif.anterior.cpf = atual.cpf ? "(alterado)" : null;
      dif.novo.cpf = "(alterado)";
    }
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "employees",
      registroId: id,
      anterior: dif.anterior,
      novo: dif.novo,
    });
  } else {
    const { data: criado, error } = await supabase.from("employees").insert(registro).select("id").single();
    if (error) return { erro: mensagemErroBanco(error) };
    destino = criado.id;
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "criar",
      entidade: "employees",
      registroId: destino,
      novo: { ...registro, cpf: registro.cpf ? "(informado)" : null },
    });
  }

  // Salário: nova vigência só quando o valor muda.
  if (d.salario !== undefined && destino) {
    const { data: vigente } = await supabase
      .from("employee_current_salary")
      .select("salario, vigencia_inicio")
      .eq("employee_id", destino)
      .maybeSingle();
    if (!vigente || Number(vigente.salario) !== d.salario) {
      const inicio = vigente ? hojeIso() : (d.data_admissao ?? hojeIso());
      if (vigente) {
        await supabase
          .from("employee_salaries")
          .update({ vigencia_fim: inicio })
          .eq("employee_id", destino)
          .is("vigencia_fim", null);
      }
      const { error } = await supabase.from("employee_salaries").insert({
        employee_id: destino,
        salario: d.salario,
        vigencia_inicio: inicio,
        origem: vigente ? "Alteração manual no cadastro" : "Cadastro",
      });
      if (!error) {
        await registrarAuditoria(supabase, {
          userId: sessao.id,
          acao: "editar",
          entidade: "employee_salaries",
          registroId: destino,
          anterior: vigente ? { salario: vigente.salario } : null,
          novo: { salario: d.salario, vigencia_inicio: inicio },
        });
      }
    }
  }

  revalidatePath("/rh/funcionarios");
  revalidatePath(`/rh/funcionarios/${destino}`);
  revalidatePath(`/filiais/${d.branch_id}`);
  if (mudouFilial) revalidatePath("/rh/lancamentos");
  redirect(`/rh/funcionarios/${destino}?salvo=1${mudouFilial ? "&folha=1" : ""}`);
}

const esquemaStatus = z
  .object({
    id: z.uuid(),
    status: z.enum(Constants.public.Enums.employee_status, { error: "Situação inválida." }),
    data_desligamento: dataOpcional,
  })
  .refine((v) => v.status !== "desligado" || !!v.data_desligamento, {
    error: "Informe a data do desligamento.",
    path: ["data_desligamento"],
  });

/** Muda a situação (ativo/afastado/férias/desligado). Só admin/RH. */
export async function alterarStatusFuncionario(_prev: EstadoFormulario, fd: FormData): Promise<EstadoFormulario> {
  const sessao = await getSessao();
  if (!PAPEIS_RH.includes(sessao.papel as (typeof PAPEIS_RH)[number])) {
    return { erro: "Só Administrador e RH podem alterar a situação." };
  }
  const r = esquemaStatus.safeParse({
    id: texto(fd, "id"),
    status: texto(fd, "status"),
    data_desligamento: texto(fd, "data_desligamento"),
  });
  if (!r.success) return { erro: "Confira os campos.", erros: errosDoZod(r.error) };
  const { id, status } = r.data;
  const data_desligamento = status === "desligado" ? (r.data.data_desligamento ?? null) : null;

  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("employees")
    .select("id, status, data_desligamento, branch_id")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { erro: "Funcionário não encontrado." };

  const { error } = await supabase.from("employees").update({ status, data_desligamento }).eq("id", id);
  if (error) return { erro: mensagemErroBanco(error) };

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: status === "desligado" ? "inativar" : "editar",
    entidade: "employees",
    registroId: id,
    anterior: { status: atual.status, data_desligamento: atual.data_desligamento },
    novo: { status, data_desligamento },
  });
  revalidatePath("/rh/funcionarios");
  revalidatePath(`/rh/funcionarios/${id}`);
  revalidatePath(`/filiais/${atual.branch_id}`);
  return { erro: undefined };
}

const ITENS_CHECKLIST = ["equipamentos", "acessos", "documentos", "folha", "gestor"] as const;

/** Marca ou desmarca um item do checklist de desligamento (os itens automáticos o sistema confere sozinho). */
export async function marcarItemDesligamento(employeeId: string, item: string, feito: boolean): Promise<{ erro?: string }> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "rh") return { erro: "Só o RH e o administrador mexem no desligamento." };
  if (!/^[0-9a-f-]{36}$/i.test(employeeId) || !(ITENS_CHECKLIST as readonly string[]).includes(item)) return { erro: "Item inválido." };
  const supabase = await createClient();
  const { error } = feito
    ? await supabase.from("rh_desligamento_checklist").upsert({ employee_id: employeeId, item, feito_por: sessao.id, feito_por_nome: sessao.nome, feito_em: new Date().toISOString() }, { onConflict: "employee_id,item" })
    : await supabase.from("rh_desligamento_checklist").delete().eq("employee_id", employeeId).eq("item", item);
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "employees", registroId: employeeId, novo: { desligamento: item, feito } });
  revalidatePath(`/rh/funcionarios/${employeeId}`);
  return {};
}
