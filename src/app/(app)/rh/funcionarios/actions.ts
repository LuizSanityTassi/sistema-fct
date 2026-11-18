"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { hojeIso, lerDecimal } from "@/lib/formatos";
import { diasEntre, hojeLocal, somarDias } from "@/lib/ponto/calculo";
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
  "pis",
  "nome_mae",
  "nome_pai",
  "endereco",
  "endereco_numero",
  "bairro",
  "cidade",
  "uf",
  "cep",
  "celular",
  "escolaridade",
  "estado_civil",
  "rg",
  "rg_emissao",
  "rg_emissor",
  "rg_uf",
  "raca_cor",
  "titulo_eleitor",
  "titulo_zona",
  "titulo_secao",
  "cnh",
  "cnh_emissao",
  "cnh_vencimento",
  "cnh_categoria",
  "reservista",
  "reservista_categoria",
  "horario_trabalho",
  "periodo_experiencia",
  "adicionais",
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
  pis: opcional(20),
  nome_mae: opcional(120),
  nome_pai: opcional(120),
  endereco: opcional(150),
  endereco_numero: opcional(20),
  bairro: opcional(80),
  cidade: opcional(80),
  uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a sigla, ex.: SC.").optional(),
  cep: opcional(10),
  celular: opcional(30),
  escolaridade: opcional(40),
  estado_civil: opcional(30),
  rg: opcional(20),
  rg_emissao: dataOpcional,
  rg_emissor: opcional(20),
  rg_uf: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a sigla, ex.: SC.").optional(),
  raca_cor: opcional(20),
  titulo_eleitor: opcional(20),
  titulo_zona: opcional(10),
  titulo_secao: opcional(10),
  cnh: opcional(20),
  cnh_emissao: dataOpcional,
  cnh_vencimento: dataOpcional,
  cnh_categoria: opcional(5),
  reservista: opcional(20),
  reservista_categoria: opcional(10),
  horario_trabalho: opcional(150),
  periodo_experiencia: opcional(20),
  adicionais: opcional(200),
});

/** Documentos pessoais não vão para a auditoria em claro. */
const SENSIVEIS = ["cpf", "pis", "rg", "titulo_eleitor", "cnh", "reservista"] as const;

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
    pis: d.pis ?? null,
    nome_mae: d.nome_mae ?? null,
    nome_pai: d.nome_pai ?? null,
    endereco: d.endereco ?? null,
    endereco_numero: d.endereco_numero ?? null,
    bairro: d.bairro ?? null,
    cidade: d.cidade ?? null,
    uf: d.uf ?? null,
    cep: d.cep ?? null,
    celular: d.celular ?? null,
    escolaridade: d.escolaridade ?? null,
    estado_civil: d.estado_civil ?? null,
    rg: d.rg ?? null,
    rg_emissao: d.rg_emissao ?? null,
    rg_emissor: d.rg_emissor ?? null,
    rg_uf: d.rg_uf ?? null,
    raca_cor: d.raca_cor ?? null,
    titulo_eleitor: d.titulo_eleitor ?? null,
    titulo_zona: d.titulo_zona ?? null,
    titulo_secao: d.titulo_secao ?? null,
    cnh: d.cnh ?? null,
    cnh_emissao: d.cnh_emissao ?? null,
    cnh_vencimento: d.cnh_vencimento ?? null,
    cnh_categoria: d.cnh_categoria ?? null,
    reservista: d.reservista ?? null,
    reservista_categoria: d.reservista_categoria ?? null,
    horario_trabalho: d.horario_trabalho ?? null,
    periodo_experiencia: d.periodo_experiencia ?? null,
    adicionais: d.adicionais ?? null,
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
    for (const campo of SENSIVEIS) {
      if (campo in dif.novo) {
        dif.anterior[campo] = atual[campo] ? "(alterado)" : null;
        dif.novo[campo] = "(alterado)";
      }
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
      novo: { ...registro, ...Object.fromEntries(SENSIVEIS.map((c) => [c, registro[c] ? "(informado)" : null])) },
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

const MAX_DIAS_FERIAS = 60;

const esquemaStatus = z
  .object({
    id: z.uuid(),
    status: z.enum(Constants.public.Enums.employee_status, { error: "Situação inválida." }),
    data_desligamento: dataOpcional,
    ferias_inicio: dataOpcional,
    ferias_retorno: dataOpcional,
  })
  .refine((v) => v.status !== "desligado" || !!v.data_desligamento, {
    error: "Informe a data do desligamento.",
    path: ["data_desligamento"],
  })
  .refine((v) => v.status !== "ferias" || !!v.ferias_inicio, { error: "Informe o início das férias.", path: ["ferias_inicio"] })
  .refine((v) => v.status !== "ferias" || !!v.ferias_retorno, { error: "Informe a data de retorno.", path: ["ferias_retorno"] })
  .refine((v) => v.status !== "ferias" || !v.ferias_inicio || !v.ferias_retorno || v.ferias_retorno > v.ferias_inicio, {
    error: "O retorno tem que ser depois do início.",
    path: ["ferias_retorno"],
  })
  .refine((v) => v.status !== "ferias" || !v.ferias_inicio || !v.ferias_retorno || diasEntre(v.ferias_inicio, v.ferias_retorno) <= MAX_DIAS_FERIAS, {
    error: `No máximo ${MAX_DIAS_FERIAS} dias de férias de uma vez.`,
    path: ["ferias_retorno"],
  });

/**
 * Férias: grava o período (início e retorno) nas ausências do ponto, que também não contam falta. A situação muda
 * sozinha: na hora, se as férias já começaram; senão no dia do início (rotina diária das 00:05), e volta para Ativo
 * no dia do retorno (migração 0151).
 */
async function agendarFerias(supabase: Awaited<ReturnType<typeof createClient>>, sessaoId: string, id: string, inicio: string, retorno: string): Promise<EstadoFormulario> {
  const fim = somarDias(retorno, -1);
  const { data: sobrepostas } = await supabase.from("ponto_ausencias").select("tipo, inicio, fim").eq("employee_id", id).lte("inicio", fim).gte("fim", inicio).limit(1);
  if (sobrepostas?.length) {
    const o = sobrepostas[0];
    return { erro: `Já existe ${o.tipo === "ferias" ? "férias" : "uma ausência"} lançada de ${o.inicio.split("-").reverse().join("/")} a ${o.fim.split("-").reverse().join("/")} que cruza esse período. Remova ou ajuste em Ponto → Ausências.` };
  }
  const { error } = await supabase
    .from("ponto_ausencias")
    .insert({ employee_id: id, tipo: "ferias", inicio, fim, observacao: `Férias lançadas na ficha do RH (retorno ${retorno.split("-").reverse().join("/")})`, registrado_por: sessaoId });
  if (error) return { erro: error.code === "P0001" ? error.message : mensagemErroBanco(error) };
  return {};
}

/** Volta antes da hora: as férias em andamento passam a terminar ontem (ou somem, se começariam hoje). */
async function anteciparRetorno(supabase: Awaited<ReturnType<typeof createClient>>, id: string, hoje: string): Promise<EstadoFormulario> {
  const { data: emAndamento } = await supabase.from("ponto_ausencias").select("id, inicio").eq("employee_id", id).eq("tipo", "ferias").lte("inicio", hoje).gte("fim", hoje);
  for (const a of emAndamento ?? []) {
    const { error } = a.inicio < hoje ? await supabase.from("ponto_ausencias").update({ fim: somarDias(hoje, -1) }).eq("id", a.id) : await supabase.from("ponto_ausencias").delete().eq("id", a.id);
    if (error) return { erro: error.code === "P0001" ? error.message : mensagemErroBanco(error) };
  }
  return {};
}

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
    ferias_inicio: texto(fd, "ferias_inicio"),
    ferias_retorno: texto(fd, "ferias_retorno"),
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

  if (status === "ferias") {
    // a situação não é gravada aqui: o banco muda sozinho na data (e na hora, se já começou)
    const res = await agendarFerias(supabase, sessao.id, id, r.data.ferias_inicio!, r.data.ferias_retorno!);
    if (res.erro) return res;
    revalidatePath("/rh/funcionarios");
    revalidatePath(`/rh/funcionarios/${id}`);
    revalidatePath(`/filiais/${atual.branch_id}`);
    revalidatePath("/ponto", "layout");
    return { erro: undefined };
  }

  if (atual.status === "ferias") {
    const res = await anteciparRetorno(supabase, id, hojeLocal());
    if (res.erro) return res;
    revalidatePath("/ponto", "layout");
  }

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

/** Cancela férias agendadas que ainda não começaram (as em andamento se encerram mudando a situação). Só admin/RH. */
export async function cancelarFeriasAgendadas(fd: FormData) {
  const sessao = await getSessao();
  if (!PAPEIS_RH.includes(sessao.papel as (typeof PAPEIS_RH)[number])) return;
  const ausencia = z.uuid().safeParse(texto(fd, "ausencia_id"));
  const employee = z.uuid().safeParse(texto(fd, "employee_id"));
  if (!ausencia.success || !employee.success) return;
  const supabase = await createClient();
  await supabase.from("ponto_ausencias").delete().eq("id", ausencia.data).eq("employee_id", employee.data).eq("tipo", "ferias").gt("inicio", hojeLocal());
  revalidatePath(`/rh/funcionarios/${employee.data}`);
  revalidatePath("/ponto", "layout");
}
