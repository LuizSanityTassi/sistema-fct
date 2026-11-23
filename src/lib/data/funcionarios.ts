import { cache } from "react";
import { ehUuid } from "@/lib/data/filiais";
import type { StatusFuncionario } from "@/lib/rh/rotulos";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 25;

export type SituacaoFiltro = "ativos" | "desligados" | "todos";
export type FiltrosFuncionarios = {
  q?: string;
  filial?: string;
  cargo?: string;
  situacao: SituacaoFiltro;
  pagina: number;
};

export function lerFiltrosFuncionarios(sp: Record<string, string | string[] | undefined>): FiltrosFuncionarios {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const situacao = s("situacao");
  const pagina = Number.parseInt(s("pagina"), 10);
  return {
    q: s("q") || undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    cargo: s("cargo") || undefined,
    situacao: situacao === "desligados" || situacao === "todos" ? situacao : "ativos",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

/** Unidades para filtros e formulários (todas, inclusive inativas, marcadas). */
export const listarUnidadesParaSelecao = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("id, codigo, nome, ativo, organizations(nome_fantasia)")
    .order("codigo");
  if (error) throw error;
  return data.map((b) => ({
    id: b.id,
    codigo: b.codigo,
    nome: b.nome,
    ativo: b.ativo,
    grupo: b.organizations?.nome_fantasia ?? "",
  }));
});

export async function listarCargos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("cargo").neq("status", "desligado");
  if (error) throw error;
  const conjunto = new Set<string>();
  for (const e of data) if (e.cargo) conjunto.add(e.cargo);
  return [...conjunto].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function contarPorStatus() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("employees").select("status");
  if (error) throw error;
  const contagem: Record<StatusFuncionario, number> = { ativo: 0, afastado: 0, ferias: 0, desligado: 0 };
  for (const e of data) contagem[e.status] += 1;
  return contagem;
}

export async function listarFuncionarios(f: FiltrosFuncionarios) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;

  let consulta = supabase
    .from("employees")
    .select(
      "id, matricula, nome, cargo, data_admissao, status, tipo_contrato, branch_id, unidade:branches!employees_branch_id_fkey(id, codigo, nome)",
      { count: "exact" },
    );
  if (f.situacao === "ativos") consulta = consulta.neq("status", "desligado");
  if (f.situacao === "desligados") consulta = consulta.eq("status", "desligado");
  if (f.filial) consulta = consulta.eq("branch_id", f.filial);
  if (f.cargo) consulta = consulta.eq("cargo", f.cargo);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) {
      const like = `%${termo}%`;
      consulta = consulta.or(`nome.ilike.${like},matricula.ilike.${like},cargo.ilike.${like}`);
    }
  }

  const { data, error, count } = await consulta.order("nome").range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return {
    itens: data,
    total,
    pagina: f.pagina,
    paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
  };
}

export type FuncionarioLista = Awaited<ReturnType<typeof listarFuncionarios>>["itens"][number];

export type OpcaoGerente = { id: string; nome: string; cargo: string | null; filial: string; responsavelDe: string | null; temLogin: boolean };

/**
 * Quem pode ser escolhido como gerente responsável na ficha (admin e RH): cargo ou papel de gestão, ou responsável de
 * alguma filial. Se a ficha já tem um gerente fora da lista, ele entra também (para não sumir ao editar).
 */
export async function listarGerentesOpcoes(atual?: string | null): Promise<OpcaoGerente[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rh_gerentes_opcoes");
  if (error) throw error;
  const lista: OpcaoGerente[] = (data ?? []).map((g) => ({
    id: g.id,
    nome: g.nome,
    cargo: g.cargo,
    filial: g.filial_codigo,
    responsavelDe: g.responsavel_de,
    temLogin: g.tem_login,
  }));
  if (atual && !lista.some((g) => g.id === atual)) {
    const { data: e } = await supabase.from("employees").select("id, nome, cargo, unidade:branches!employees_branch_id_fkey(codigo)").eq("id", atual).maybeSingle();
    if (e) lista.push({ id: e.id, nome: e.nome, cargo: e.cargo, filial: e.unidade?.codigo ?? "", responsavelDe: null, temLogin: false });
  }
  return lista;
}

/** Filial do ponto (quando diferente da folha) e gerente responsável de um funcionário, com o padrão de cada um. */
export async function pontoEGerente(f: { ponto_branch_id: string | null; ponto_filial_id: string | null; gerente_employee_id: string | null }) {
  const supabase = await createClient();
  const [filialPonto, gerente, responsavel] = await Promise.all([
    f.ponto_branch_id ? supabase.from("branches").select("id, codigo, nome").eq("id", f.ponto_branch_id).maybeSingle() : null,
    f.gerente_employee_id ? supabase.from("employees").select("id, nome").eq("id", f.gerente_employee_id).maybeSingle() : null,
    !f.gerente_employee_id && f.ponto_filial_id
      ? supabase.from("branches").select("responsavel_nome, responsavel:employees!branches_responsavel_employee_id_fkey(id, nome)").eq("id", f.ponto_filial_id).maybeSingle()
      : null,
  ]);
  const resp = responsavel?.data;
  return {
    filialPonto: filialPonto?.data ?? null,
    gerente: gerente?.data ?? null,
    /** sem gerente escolhido: o responsável da filial do ponto */
    gerentePadrao: resp ? (resp.responsavel ? { id: resp.responsavel.id as string | null, nome: resp.responsavel.nome } : resp.responsavel_nome ? { id: null, nome: resp.responsavel_nome } : null) : null,
  };
}

export const obterFuncionario = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select(
      "*, unidade:branches!employees_branch_id_fkey(id, codigo, nome, regional, organizations(nome_fantasia)), departamento:departments(id, nome)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type FuncionarioDetalhe = NonNullable<Awaited<ReturnType<typeof obterFuncionario>>>;

/** Histórico salarial (mais recente primeiro). Para quem não é admin/RH o RLS devolve lista vazia. */
export async function listarSalarios(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_salaries")
    .select("id, salario, vigencia_inicio, vigencia_fim, origem, created_at")
    .eq("employee_id", employeeId)
    .order("vigencia_inicio", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listarDepartamentosDaUnidade(branchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, nome, branch_id")
    .eq("branch_id", branchId)
    .eq("ativo", true)
    .order("nome");
  if (error) throw error;
  return data;
}
