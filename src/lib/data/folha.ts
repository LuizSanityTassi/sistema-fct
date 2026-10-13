import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 50;

export type FiltrosFolha = { q?: string; filial?: string; pagina: number };

export function lerFiltrosFolha(sp: Record<string, string | string[] | undefined>): FiltrosFolha {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  return {
    q: s("q") || undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Competências que já têm folha (mais recente primeiro). */
export async function listarCompetencias() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select("competencia")
    .order("competencia", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return [...new Set(data.map((r) => r.competencia))];
}

export async function resumoFolha(competencia: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select("status, salario_base, horas_extras, adicionais, inss, irrf, outros_descontos, valor_liquido, fgts")
    .eq("competencia", competencia);
  if (error) throw error;
  const r = {
    total: data.length,
    rascunho: 0,
    fechada: 0,
    paga: 0,
    bruto: 0,
    inss: 0,
    irrf: 0,
    outrosDescontos: 0,
    liquido: 0,
    fgts: 0,
  };
  for (const x of data) {
    r[x.status] += 1;
    r.bruto += Number(x.salario_base) + Number(x.horas_extras) + Number(x.adicionais);
    r.inss += Number(x.inss);
    r.irrf += Number(x.irrf);
    r.outrosDescontos += Number(x.outros_descontos);
    r.liquido += Number(x.valor_liquido);
    r.fgts += Number(x.fgts);
  }
  return r;
}

/** Funcionários em atividade que ainda não têm registro na competência. */
export async function contarSemRegistro(competencia: string) {
  const supabase = await createClient();
  const [{ data: ativos, error: e1 }, { data: existentes, error: e2 }] = await Promise.all([
    supabase.from("employees").select("id").neq("status", "desligado"),
    supabase.from("payroll_records").select("employee_id").eq("competencia", competencia),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const tem = new Set(existentes.map((x) => x.employee_id));
  return ativos.filter((a) => !tem.has(a.id)).length;
}

export async function listarFolha(competencia: string, f: FiltrosFolha) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase
    .from("payroll_records")
    .select(
      "id, competencia, status, salario_base, horas_extras, adicionais, beneficios, inss, irrf, outros_descontos, descontos, valor_liquido, fgts, storage_path, employees!inner(id, nome, matricula, branch_id, branches!employees_branch_id_fkey(id, codigo, nome))",
      { count: "exact" },
    )
    .eq("competencia", competencia);
  if (f.filial) consulta = consulta.eq("employees.branch_id", f.filial);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) consulta = consulta.ilike("employees.nome", `%${termo}%`);
  }
  // Ordena os registros pelo nome do funcionário (coluna da tabela relacionada, sintaxe do PostgREST).
  const { data, error, count } = await consulta
    .order("employees(nome)" as "id")
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

export async function obterRegistroFolha(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select(
      "*, employees!inner(id, nome, matricula, cargo, horas_mes, num_dependentes, tipo_contrato, branch_id, branches!employees_branch_id_fkey(id, codigo, nome))",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listarFolhaDoFuncionario(employeeId: string, limite = 6) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select("id, competencia, status, valor_liquido, storage_path")
    .eq("employee_id", employeeId)
    .order("competencia", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data;
}
