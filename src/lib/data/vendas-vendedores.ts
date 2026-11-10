// Vendedor × funcionário: qual código do Trier é de quem (vendas_vendedor_vinculo) e a venda do próprio vendedor
// ("Minhas vendas", pela função vendas_minhas, que só devolve os códigos ligados a quem está logado).
import { hojeNoBrasil, somarDias, vendedoresNoPeriodo } from "@/lib/data/vendas";
import { createClient } from "@/lib/supabase/server";
import { sugerirFuncionario, tokensNome, type Funcionario, type Sugestao } from "@/lib/vendas/vinculo-vendedor";

const n = (v: unknown) => Number(v ?? 0) || 0;

async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export const DIAS_VENDEDORES = 60;

/** Lojas cujo pessoal não tem cadastro nem login no portal (decisão do Luiz em 10/11/2026): Indaial, São Vicente, Cidade
 * Nova, Navegantes e Itajaí (F201–F205) e Blumenau (F501–F504). Os vendedores delas ficam fora do "Falta ligar". */
export const FILIAIS_FORA_DO_PORTAL = new Set(["F201", "F202", "F203", "F204", "F205", "F501", "F502", "F503", "F504"]);

/** Quem tem o código: funcionário (ficha do RH) ou, com `usuario`, um login do portal sem ficha no RH (id = profile). */
export type FuncionarioVinculo = { id: string; nome: string; filial: string | null; status: string; temLogin: boolean; usuario?: boolean };
export type LinhaVendedor = {
  codigo: number;
  nomeTrier: string;
  /** filial onde mais vendeu nos últimos DIAS_VENDEDORES dias (null = não vendeu no período) */
  filial: string | null;
  loja: string | null;
  venda: number;
  vinculado: FuncionarioVinculo | null;
  sugestao: Sugestao | null;
  /** vende numa loja fora do portal (FILIAIS_FORA_DO_PORTAL) e não está ligado: não é pendência */
  foraDoPortal: boolean;
};

/** Vendedores do Trier (os que venderam nos últimos 60 dias + os já ligados) com o funcionário ligado ou a sugestão. Só admin. */
export async function vendedoresEFuncionarios() {
  const supabase = await createClient();
  const hoje = hojeNoBrasil();
  const [vendedores, vinculos, ativos, logins, filiais, semFicha] = await Promise.all([
    vendedoresNoPeriodo(somarDias(hoje, -DIAS_VENDEDORES), hoje),
    todas((de, ate) => supabase.from("vendas_vendedor_vinculo").select("vendedor_codigo, employee_id, profile_id, vendedor_nome").order("vendedor_codigo").range(de, ate)),
    todas((de, ate) => supabase.from("employees").select("id, nome, branch_id, status").neq("status", "desligado").order("nome").order("id").range(de, ate)),
    todas((de, ate) => supabase.from("profiles").select("employee_id").eq("ativo", true).not("employee_id", "is", null).order("id").range(de, ate)),
    todas((de, ate) => supabase.from("branches").select("id, codigo").order("codigo").range(de, ate)),
    // logins ativos sem ficha no RH (ex.: usuário do comercial interno): também podem ter código de vendedor
    todas((de, ate) => supabase.from("profiles").select("id, nome, email").eq("ativo", true).is("employee_id", null).neq("papel", "relogio").order("nome").order("id").range(de, ate)),
  ]);
  const codigoFilial = new Map(filiais.map((b) => [b.id, b.codigo]));
  const comLogin = new Set(logins.map((p) => p.employee_id));
  // ligados a quem já saiu (desligado) também aparecem
  const faltam = [...new Set(vinculos.flatMap((v) => (v.employee_id ? [v.employee_id] : [])))].filter((id) => !ativos.some((e) => e.id === id));
  const desligados = faltam.length ? ((await supabase.from("employees").select("id, nome, branch_id, status").in("id", faltam)).data ?? []) : [];
  const funcionarios = new Map<string, FuncionarioVinculo>(
    [...ativos, ...desligados].map((e) => [e.id, { id: e.id, nome: e.nome, filial: e.branch_id ? (codigoFilial.get(e.branch_id) ?? null) : null, status: e.status, temLogin: comLogin.has(e.id) }]),
  );
  const usuarios = new Map<string, FuncionarioVinculo & { email: string | null }>(
    semFicha.map((p) => [p.id, { id: p.id, nome: p.nome, filial: null, status: "ativo", temLogin: true, usuario: true, email: p.email }]),
  );
  const donoDe = (l: { employee_id: string | null; profile_id: string | null }) => (l.employee_id ? funcionarios.get(l.employee_id) : l.profile_id ? usuarios.get(l.profile_id) : undefined) ?? null;
  const paraSugerir = ativos.map((e) => ({ f: { id: e.id, nome: e.nome, branchId: e.branch_id } satisfies Funcionario, tokens: tokensNome(e.nome) }));
  const ligado = new Map(vinculos.map((v) => [v.vendedor_codigo, v]));

  const linhas: LinhaVendedor[] = vendedores.map((v) => {
    const l = ligado.get(v.vendedorCodigo);
    const fora = !l && FILIAIS_FORA_DO_PORTAL.has(v.codigo);
    return {
      codigo: v.vendedorCodigo,
      nomeTrier: v.vendedorNome,
      filial: v.codigo,
      loja: v.loja,
      venda: v.venda,
      vinculado: l ? donoDe(l) : null,
      sugestao: l || fora ? null : sugerirFuncionario(v.vendedorNome, v.branchId, paraSugerir),
      foraDoPortal: fora,
    };
  });
  // ligados que não venderam nos últimos 60 dias
  for (const l of vinculos) {
    if (vendedores.some((v) => v.vendedorCodigo === l.vendedor_codigo)) continue;
    linhas.push({ codigo: l.vendedor_codigo, nomeTrier: l.vendedor_nome, filial: null, loja: null, venda: 0, vinculado: donoDe(l), sugestao: null, foraDoPortal: false });
  }
  linhas.sort((a, b) => b.venda - a.venda || a.nomeTrier.localeCompare(b.nomeTrier));
  // lista para escolher à mão: "NOME · F014" (rótulo único)
  const vistos = new Map<string, number>();
  const opcoes = [...funcionarios.values()]
    .filter((f) => f.status !== "desligado")
    .map((f) => {
      const base = `${f.nome} · ${f.filial ?? "sem filial"}`;
      const k = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, k);
      return { id: f.id, rotulo: k > 1 ? `${base} (${k})` : base };
    });
  // logins sem ficha no RH: "Nome · usuário email" (o e-mail é único)
  for (const u of usuarios.values()) if (u.email) opcoes.push({ id: u.id, rotulo: `${u.nome} · usuário ${u.email}` });
  return { linhas, opcoes };
}

export type DiaMinhasVendas = { data: string; filial: string; loja: string; atendimentos: number; venda: number; teleVenda: number; teleAtendimentos: number };
export type MinhasVendas = {
  funcionario: string | null;
  vendedores: { codigo: number; nome: string }[];
  dias: DiaMinhasVendas[];
  mes: string;
  grupos: { grupo: string; quantidade: number; venda: number }[];
  gruposLidoAte: string | null;
  meta: number | null;
};

/** Venda do vendedor logado (ou, só para o administrador, de um funcionário ou usuário escolhido). */
export async function minhasVendas(de: string, ate: string, alvo: { employee?: string; profile?: string } = {}): Promise<MinhasVendas> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_minhas", { p_de: de, p_ate: ate, ...(alvo.employee ? { p_employee: alvo.employee } : {}), ...(alvo.profile ? { p_profile: alvo.profile } : {}) });
  if (error) throw new Error(error.message);
  const r = (data ?? {}) as Record<string, unknown>;
  const lista = <T,>(v: unknown) => (Array.isArray(v) ? (v as T[]) : []);
  return {
    funcionario: typeof r.funcionario === "string" ? r.funcionario : null,
    vendedores: lista<{ codigo: number; nome: string }>(r.vendedores),
    dias: lista<Record<string, unknown>>(r.dias).map((d) => ({
      data: String(d.data),
      filial: String(d.filial ?? ""),
      loja: String(d.loja ?? ""),
      atendimentos: n(d.atendimentos),
      venda: n(d.venda),
      teleVenda: n(d.tele_venda),
      teleAtendimentos: n(d.tele_atendimentos),
    })),
    mes: String(r.mes ?? ate.slice(0, 7) + "-01"),
    grupos: lista<Record<string, unknown>>(r.grupos).map((g) => ({ grupo: String(g.grupo ?? ""), quantidade: n(g.quantidade), venda: n(g.venda) })),
    gruposLidoAte: typeof r.grupos_lido_ate === "string" ? r.grupos_lido_ate : null,
    meta: r.meta === null || r.meta === undefined ? null : n(r.meta),
  };
}
