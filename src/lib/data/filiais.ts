import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 25;

// Regionais conhecidas; outras cadastradas aparecem junto (ver listarRegionais).
export const REGIONAIS_PADRAO = [
  "Sul",
  "Serra",
  "Vale do Itajaí",
  "Oeste",
  "Blumenau",
  "Administrativo",
  "Terceirizadas",
];

export type StatusFiltro = "ativas" | "inativas" | "todas";
export type FiltrosFiliais = {
  q?: string;
  grupo?: string;
  regional?: string;
  status: StatusFiltro;
  pagina: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ehUuid = (v: string) => UUID.test(v);

/** Converte os searchParams da URL em filtros válidos (valores inválidos caem no padrão). */
export function lerFiltros(sp: Record<string, string | string[] | undefined>): FiltrosFiliais {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const status = s("status");
  const pagina = Number.parseInt(s("pagina"), 10);
  return {
    q: s("q") || undefined,
    grupo: ehUuid(s("grupo")) ? s("grupo") : undefined,
    regional: s("regional") || undefined,
    status: status === "inativas" || status === "todas" ? status : "ativas",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export const listarOrganizacoes = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("*").order("nome_fantasia");
  if (error) throw error;
  return data;
});

export async function contarUnidadesPorOrganizacao() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select("organization_id, ativo");
  if (error) throw error;
  const mapa = new Map<string, { total: number; ativas: number }>();
  for (const b of data) {
    const m = mapa.get(b.organization_id) ?? { total: 0, ativas: 0 };
    m.total += 1;
    if (b.ativo) m.ativas += 1;
    mapa.set(b.organization_id, m);
  }
  return mapa;
}

export async function listarRegionais() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select("regional");
  if (error) throw error;
  const conjunto = new Set<string>(REGIONAIS_PADRAO);
  for (const b of data) if (b.regional) conjunto.add(b.regional);
  return [...conjunto];
}

/** Funcionários (não desligados) por unidade — respeita o RLS de employees. */
export async function contagemFuncionarios() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("branch_employee_counts").select("branch_id, total");
  if (error) throw error;
  return new Map(data.map((c) => [c.branch_id ?? "", c.total ?? 0]));
}

export async function listarFiliais(f: FiltrosFiliais) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;

  let consulta = supabase
    .from("branches")
    .select(
      "id, codigo, nome, razao_social, cnpj, regional, cidade, estado, ativo, responsavel_nome, organization_id, organizations(id, nome_fantasia), responsavel:employees!branches_responsavel_employee_id_fkey(id, nome)",
      { count: "exact" },
    );
  if (f.status !== "todas") consulta = consulta.eq("ativo", f.status === "ativas");
  if (f.grupo) consulta = consulta.eq("organization_id", f.grupo);
  if (f.regional) consulta = consulta.eq("regional", f.regional);
  if (f.q) {
    // remove caracteres com significado na sintaxe de filtro do PostgREST
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) {
      const like = `%${termo}%`;
      consulta = consulta.or(
        `codigo.ilike.${like},nome.ilike.${like},razao_social.ilike.${like},cnpj.ilike.${like}`,
      );
    }
  }

  const [{ data, error, count }, funcionarios] = await Promise.all([
    consulta.order("codigo").range(de, de + TAMANHO_PAGINA - 1),
    contagemFuncionarios(),
  ]);
  if (error) throw error;

  const total = count ?? 0;
  return {
    itens: data.map((b) => ({ ...b, funcionarios: funcionarios.get(b.id) ?? 0 })),
    total,
    pagina: f.pagina,
    paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)),
  };
}

export type FilialLista = Awaited<ReturnType<typeof listarFiliais>>["itens"][number];

export const obterFilial = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select(
      "*, organizations(id, nome_fantasia, razao_social), responsavel:employees!branches_responsavel_employee_id_fkey(id, nome, cargo)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
});

export type FilialDetalhe = NonNullable<Awaited<ReturnType<typeof obterFilial>>>;

export async function listarFuncionariosDaFilial(branchId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, matricula, nome, cargo, data_admissao, status")
    .eq("branch_id", branchId)
    .order("nome");
  if (error) throw error;
  return data;
}

/** Funcionários ativos para escolher como responsável (com o código da unidade onde trabalham). */
export async function listarFuncionariosParaSelecao() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, nome, cargo, unidade:branches!employees_branch_id_fkey(codigo)")
    .eq("status", "ativo")
    .order("nome");
  if (error) throw error;
  return data.map((f) => ({
    id: f.id,
    nome: f.nome,
    cargo: f.cargo,
    unidade: codigoUnidade(f.unidade),
  }));
}

function codigoUnidade(u: unknown): string | null {
  if (Array.isArray(u)) return (u[0] as { codigo?: string } | undefined)?.codigo ?? null;
  return (u as { codigo?: string } | null)?.codigo ?? null;
}

export const obterOrganizacao = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
});
