"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerDecimal } from "@/lib/formatos";
import { BUCKET_DOCUMENTOS, nomeSeguro, validarArquivo } from "@/lib/rh/arquivos";
import { calcularFolha } from "@/lib/rh/calculo-folha";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import type { Atualizar } from "@/lib/tipos";

export type EstadoFolha = {
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

/** Número vindo de texto ("1.234,56"); vazio vira 0. */
const numero = (max: number, mensagem = "Número inválido.") =>
  z.preprocess(
    (v) => (v === undefined ? 0 : typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: mensagem }).min(0, "Não pode ser negativo.").max(max, `Máximo: ${max}.`),
  );

// ---------- gerar folha da competência ----------

/** Cria os registros (rascunho) de todos os funcionários em atividade que ainda não têm folha na competência. */
export async function gerarFolha(fd: FormData) {
  const sessao = await exigirRh();
  if (!sessao) return;
  const competencia = texto(fd, "competencia");
  if (!competenciaValida(competencia)) return;

  const supabase = await createClient();
  const [{ data: ativos }, { data: existentes }, { data: salarios }] = await Promise.all([
    supabase.from("employees").select("id, horas_mes, num_dependentes, tipo_contrato").neq("status", "desligado"),
    supabase.from("payroll_records").select("employee_id").eq("competencia", competencia),
    supabase.from("employee_current_salary").select("employee_id, salario"),
  ]);
  const jaTem = new Set((existentes ?? []).map((x) => x.employee_id));
  const salarioDe = new Map((salarios ?? []).map((s) => [s.employee_id ?? "", Number(s.salario ?? 0)]));

  const novos = [];
  let semSalario = 0;
  for (const e of ativos ?? []) {
    if (jaTem.has(e.id)) continue;
    const base = salarioDe.get(e.id);
    if (base === undefined || base <= 0) {
      semSalario += 1;
      continue;
    }
    const r = calcularFolha({
      salarioBase: base,
      horasMes: e.horas_mes,
      qtdExtras50: 0,
      qtdExtras100: 0,
      adicionais: 0,
      beneficios: 0,
      outrosDescontos: 0,
      dependentes: e.num_dependentes ?? 0,
      aprendiz: e.tipo_contrato === "aprendiz",
    });
    novos.push({
      employee_id: e.id,
      competencia,
      salario_base: base,
      horas_extras: r.horasExtras,
      adicionais: 0,
      beneficios: 0,
      descontos: r.descontos,
      valor_liquido: r.liquido,
      inss: r.inss,
      irrf: r.irrf,
      fgts: r.fgts,
      outros_descontos: 0,
      status: "rascunho" as const,
    });
  }

  for (let i = 0; i < novos.length; i += 200) {
    const { error } = await supabase.from("payroll_records").insert(novos.slice(i, i + 200));
    if (error) redirect(`/rh/folha?competencia=${competencia}&erro=${encodeURIComponent(error.message)}`);
  }
  if (novos.length > 0) {
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "criar",
      entidade: "payroll_records",
      novo: { competencia, registros: novos.length, sem_salario: semSalario },
    });
  }
  revalidatePath("/rh/folha");
  redirect(`/rh/folha?competencia=${competencia}&gerados=${novos.length}&sem_salario=${semSalario}`);
}

// ---------- editar um registro ----------

const esquemaRegistro = z.object({
  qtd_horas_extras_50: numero(400, "Horas inválidas."),
  qtd_horas_extras_100: numero(400, "Horas inválidas."),
  adicionais: numero(1_000_000),
  beneficios: numero(1_000_000),
  outros_descontos: numero(1_000_000),
  observacoes: z.string().trim().max(500, "Máximo de 500 caracteres.").optional(),
});

export async function salvarRegistroFolha(id: string, _prev: EstadoFolha, fd: FormData): Promise<EstadoFolha> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Só Administrador e RH podem alterar a folha." };

  const r = esquemaRegistro.safeParse({
    qtd_horas_extras_50: texto(fd, "qtd_horas_extras_50"),
    qtd_horas_extras_100: texto(fd, "qtd_horas_extras_100"),
    adicionais: texto(fd, "adicionais"),
    beneficios: texto(fd, "beneficios"),
    outros_descontos: texto(fd, "outros_descontos"),
    observacoes: texto(fd, "observacoes"),
  });
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };

  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("payroll_records")
    .select("*, employees!inner(horas_mes, num_dependentes, tipo_contrato)")
    .eq("id", id)
    .maybeSingle();
  if (!registro) return { erro: "Registro não encontrado." };
  if (registro.status !== "rascunho") return { erro: "Competência fechada. Reabra a competência para editar." };

  const calc = calcularFolha({
    salarioBase: Number(registro.salario_base),
    horasMes: registro.employees.horas_mes,
    qtdExtras50: r.data.qtd_horas_extras_50,
    qtdExtras100: r.data.qtd_horas_extras_100,
    adicionais: r.data.adicionais,
    beneficios: r.data.beneficios,
    outrosDescontos: r.data.outros_descontos,
    dependentes: registro.employees.num_dependentes ?? 0,
    aprendiz: registro.employees.tipo_contrato === "aprendiz",
  });
  const patch = {
    qtd_horas_extras_50: r.data.qtd_horas_extras_50,
    qtd_horas_extras_100: r.data.qtd_horas_extras_100,
    adicionais: r.data.adicionais,
    beneficios: r.data.beneficios,
    outros_descontos: r.data.outros_descontos,
    observacoes: r.data.observacoes ?? null,
    horas_extras: calc.horasExtras,
    inss: calc.inss,
    irrf: calc.irrf,
    fgts: calc.fgts,
    descontos: calc.descontos,
    valor_liquido: calc.liquido,
  };
  const { error } = await supabase.from("payroll_records").update(patch).eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  const { employees: _emp, ...anterior } = registro;
  const dif = diferencas(anterior, patch);
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "payroll_records",
    registroId: id,
    anterior: dif.anterior,
    novo: dif.novo,
  });
  revalidatePath("/rh/folha");
  revalidatePath(`/rh/folha/${id}`);
  redirect(`/rh/folha?competencia=${registro.competencia}&salvo=1`);
}

// ---------- fechar / pagar / reabrir ----------

export async function alterarStatusFolha(fd: FormData) {
  const sessao = await exigirRh();
  if (!sessao) return;
  const competencia = texto(fd, "competencia");
  const status = texto(fd, "status");
  if (!competenciaValida(competencia)) return;
  if (status !== "fechada" && status !== "paga" && status !== "rascunho") return;
  if (status === "rascunho" && sessao.papel !== "admin") return; // reabrir é só do admin

  const agora = new Date().toISOString();
  const patch: Atualizar<"payroll_records"> =
    status === "fechada"
      ? { status, fechada_em: agora }
      : status === "paga"
        ? { status, paga_em: agora }
        : { status, fechada_em: null, paga_em: null };
  const statusAnterior = status === "fechada" ? "rascunho" : status === "paga" ? "fechada" : undefined;

  const supabase = await createClient();
  let consulta = supabase.from("payroll_records").update(patch, { count: "exact" }).eq("competencia", competencia);
  if (statusAnterior) consulta = consulta.eq("status", statusAnterior);
  const { error, count } = await consulta;
  if (error) redirect(`/rh/folha?competencia=${competencia}&erro=${encodeURIComponent(error.message)}`);

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: status === "rascunho" ? "reativar" : "editar",
    entidade: "payroll_records",
    anterior: { competencia, status: statusAnterior ?? "fechada/paga" },
    novo: { competencia, status, registros: count ?? 0 },
  });
  revalidatePath("/rh/folha");
  redirect(`/rh/folha?competencia=${competencia}&status=${status}`);
}

// ---------- holerite ----------

export async function enviarHolerite(id: string, _prev: EstadoFolha, fd: FormData): Promise<EstadoFolha> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Só Administrador e RH podem anexar holerites." };
  const arq = validarArquivo(fd.get("arquivo"), true);
  if (arq.erro || !arq.arquivo) return { erro: "Confira o arquivo.", erros: { arquivo: arq.erro ?? "Selecione um arquivo." } };

  const supabase = await createClient();
  const { data: registro } = await supabase
    .from("payroll_records")
    .select("id, employee_id, competencia, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (!registro) return { erro: "Registro não encontrado." };

  const caminho = `folha/${registro.employee_id}/${registro.competencia}-${crypto.randomUUID()}-${nomeSeguro(arq.arquivo.name)}`;
  const { error: erroUpload } = await supabase.storage
    .from(BUCKET_DOCUMENTOS)
    .upload(caminho, await arq.arquivo.arrayBuffer(), { contentType: arq.arquivo.type, upsert: false });
  if (erroUpload) return { erro: `Falha no envio: ${erroUpload.message}` };

  const { error } = await supabase.from("payroll_records").update({ storage_path: caminho }).eq("id", id);
  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return { erro: `Não foi possível registrar o holerite: ${error.message}` };
  }
  if (registro.storage_path) await supabase.storage.from(BUCKET_DOCUMENTOS).remove([registro.storage_path]);

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "payroll_records",
    registroId: id,
    anterior: { holerite: !!registro.storage_path },
    novo: { holerite: true, competencia: registro.competencia },
  });
  revalidatePath(`/rh/folha/${id}`);
  revalidatePath("/rh/folha");
  return { ok: "Holerite anexado." };
}
