import { rpcPaginado } from "@/lib/data/dre";
import { listarCategorias, listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { EMPRESAS_CAIXA } from "@/lib/financeiro/rotulos";
import type { Regra } from "@/lib/fluxo-caixa/classes";
import type { EmpresaFluxo } from "@/lib/fluxo-caixa/omie-pivot";
import { createClient } from "@/lib/supabase/server";

export const ROTA_FLUXO = "/financeiro/fluxo-caixa";

/** Um dia do fluxo, somado nas empresas pedidas. `receber`/`cartao` null = ninguém digitou. */
export type DiaFluxo = {
  data: string;
  receber: number | null;
  cartao: number | null;
  pagar: number;
  /** a pagar do dia por grupo + categoria do Omie */
  pagarCats: { grupo: string; categoria: string; valor: number }[];
  motivo: string | null;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A receber, cartão, a pagar e motivos de `de` a `ate`, por dia. Com as duas empresas, soma e junta os motivos. */
export async function fluxoDoPeriodo(empresas: readonly EmpresaFluxo[], de: string, ate: string) {
  const supabase = await createClient();
  const [pagar, previsoes, motivos] = await Promise.all([
    rpcPaginado((a, b) => supabase.rpc("fin_fluxo_pagar_somas", { p_de: de, p_ate: ate }).range(a, b)),
    rpcPaginado((a, b) => supabase.from("fin_fluxo_previsoes").select("empresa, data, campo, valor").gte("data", de).lte("data", ate).in("empresa", [...empresas]).order("data").order("empresa").order("campo").range(a, b)),
    rpcPaginado((a, b) => supabase.from("fin_fluxo_motivos").select("empresa, data, texto").gte("data", de).lte("data", ate).in("empresa", [...empresas]).order("data").order("empresa").range(a, b)),
  ]);
  const dias = new Map<string, DiaFluxo>();
  const dia = (d: string) => {
    let x = dias.get(d);
    if (!x) dias.set(d, (x = { data: d, receber: null, cartao: null, pagar: 0, pagarCats: [], motivo: null }));
    return x;
  };
  for (const p of pagar) {
    if (!empresas.includes(p.empresa as EmpresaFluxo)) continue;
    const x = dia(p.data);
    const v = Number(p.valor);
    x.pagar = r2(x.pagar + v);
    const c = x.pagarCats.find((y) => y.grupo === p.grupo && y.categoria === p.categoria);
    if (c) c.valor = r2(c.valor + v);
    else x.pagarCats.push({ grupo: p.grupo, categoria: p.categoria, valor: v });
  }
  for (const p of previsoes) {
    const x = dia(p.data);
    const campo = p.campo === "cartao" ? "cartao" : "receber";
    x[campo] = r2((x[campo] ?? 0) + Number(p.valor));
  }
  for (const m of motivos) {
    const x = dia(m.data);
    const texto = empresas.length > 1 ? `${m.empresa}: ${m.texto}` : m.texto;
    x.motivo = x.motivo ? `${x.motivo} · ${texto}` : texto;
  }
  return dias;
}

/** Feriados nacionais (cadastro do ponto) do período: data → nome. */
export async function feriadosDoPeriodo(de: string, ate: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("ponto_feriados").select("data, nome").is("branch_id", null).gte("data", de).lte("data", ate);
  return new Map((data ?? []).map((f) => [f.data, f.nome]));
}

/** Pode editar o fluxo? Admin e financeiro sempre; quem recebeu a tela compartilhada, se marcado "pode editar". */
export async function acessoFluxo(userId: string, papel: string) {
  if (papel === "admin" || papel === "financeiro") return { editar: true, compartilhar: true };
  const supabase = await createClient();
  const { data } = await supabase.from("acesso_telas").select("pode_editar").eq("user_id", userId).eq("rota", ROTA_FLUXO).maybeSingle();
  return { editar: !!data?.pode_editar, compartilhar: false };
}

export type NotaFluxo = {
  id: string;
  empresa: string | null;
  referencia: string | null;
  texto: string;
  importante: boolean;
  autorId: string;
  autor: string;
  criadoEm: string;
  resolvidaEm: string | null;
  resolvidaPor: string | null;
};

/** Anotações da empresa (e as das duas empresas), abertas primeiro. */
export async function notasFluxo(empresas: readonly EmpresaFluxo[]): Promise<NotaFluxo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fin_fluxo_notas")
    .select("id, empresa, referencia, texto, importante, autor, criado_em, resolvida_em, autor_p:profiles!fin_fluxo_notas_autor_fkey(nome), resolvida_p:profiles!fin_fluxo_notas_resolvida_por_fkey(nome)")
    .or(`empresa.is.null,empresa.in.(${empresas.map((e) => `"${e}"`).join(",")})`)
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data
    .map((n) => ({
      id: n.id,
      empresa: n.empresa,
      referencia: n.referencia,
      texto: n.texto,
      importante: n.importante,
      autorId: n.autor,
      autor: n.autor_p?.nome ?? "—",
      criadoEm: n.criado_em,
      resolvidaEm: n.resolvida_em,
      resolvidaPor: n.resolvida_p?.nome ?? null,
    }))
    .sort((a, b) => Number(!!a.resolvidaEm) - Number(!!b.resolvidaEm) || Number(b.importante) - Number(a.importante) || b.criadoEm.localeCompare(a.criadoEm));
}

export async function ultimasImportacoesPagar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fin_fluxo_pagar_importacoes")
    .select("id, empresa, arquivo, gerado, de, ate, linhas, total, criado_em, quem:profiles!fin_fluxo_pagar_importacoes_criado_por_fkey(nome)")
    .order("criado_em", { ascending: false })
    .limit(6);
  return (data ?? []).map((i) => ({ ...i, total: Number(i.total), quem: i.quem?.nome ?? "—" }));
}

/** Quem recebeu a tela compartilhada + pessoas ativas que ainda não veem (para o administrador/financeiro escolher). */
export async function compartilhamentosFluxo() {
  const supabase = await createClient();
  const [{ data: acessos }, { data: pessoas }] = await Promise.all([
    supabase.from("acesso_telas").select("user_id, pode_editar, criado_em, pessoa:profiles!acesso_telas_user_id_fkey(nome, papel)").eq("rota", ROTA_FLUXO).order("criado_em"),
    supabase.from("profiles").select("id, nome, papel, admin_sistema").eq("ativo", true).order("nome"),
  ]);
  const com = new Set((acessos ?? []).map((a) => a.user_id));
  return {
    acessos: (acessos ?? []).map((a) => ({ userId: a.user_id, nome: a.pessoa?.nome ?? "—", papel: a.pessoa?.papel ?? "usuario", podeEditar: a.pode_editar })),
    // admin e financeiro já veem pelo papel
    disponiveis: (pessoas ?? []).filter((p) => !com.has(p.id) && p.papel !== "admin" && p.papel !== "financeiro" && !p.admin_sistema).map((p) => ({ id: p.id, nome: p.nome, papel: p.papel })),
  };
}

/** Regras de lugar das categorias (fin_fluxo_classes). */
export async function regrasFluxo(): Promise<Regra[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_fluxo_classes").select("grupo, categoria, lugar, ordem");
  if (error) throw new Error(error.message);
  return data;
}

/** Categorias de despesa do Omie que o sistema conhece: as do plano de categorias e as que vieram no a pagar. */
export async function categoriasDespesaOmie() {
  const supabase = await createClient();
  const [{ data: plano }, pagar] = await Promise.all([
    supabase.from("fin_categorias").select("grupo, nome").eq("tipo", "pagar"),
    rpcPaginado((a, b) => supabase.rpc("fin_fluxo_pagar_somas", { p_de: "2000-01-01", p_ate: "2100-12-31" }).range(a, b)),
  ]);
  const vistas = new Map<string, { grupo: string; categoria: string; noAPagar: number }>();
  for (const c of plano ?? []) vistas.set(`${c.grupo}|${c.nome}`, { grupo: c.grupo, categoria: c.nome, noAPagar: 0 });
  for (const p of pagar) {
    if (!p.categoria) continue;
    const k = `${p.grupo}|${p.categoria}`;
    const v = vistas.get(k) ?? { grupo: p.grupo, categoria: p.categoria, noAPagar: 0 };
    v.noAPagar = r2(v.noAPagar + Number(p.valor));
    vistas.set(k, v);
  }
  return [...vistas.values()];
}

/**
 * Realizado (pago) por mês e categoria: os lançamentos a pagar que já estão no sistema (importados do Omie), das
 * unidades da empresa (VARELA inclui Itajaí; NAZÁRIO inclui Blumenau). `de`/`ate` = aaaa-mm.
 */
export async function realizadoPorCategoria(empresas: readonly EmpresaFluxo[], de: string, ate: string) {
  const supabase = await createClient();
  const grupos = EMPRESAS_CAIXA.filter((e) => empresas.includes(e.nome as EmpresaFluxo)).flatMap((e) => [...e.grupos] as string[]);
  const [unidades, categorias] = await Promise.all([listarUnidadesFinanceiro(), listarCategorias()]);
  const branches = unidades.filter((u) => grupos.includes(u.grupo)).map((u) => u.id);
  if (!branches.length) return [];
  const cat = new Map(categorias.map((c) => [c.id, c]));
  const linhas = await rpcPaginado((a, b) => supabase.rpc("fin_dre", { p_de: de, p_ate: ate, p_branches: branches }).range(a, b));
  return linhas
    .filter((l) => l.tipo === "pagar")
    .map((l) => ({ competencia: l.competencia.trim(), grupo: cat.get(l.categoria_id)?.grupo ?? "", categoria: cat.get(l.categoria_id)?.nome ?? "", valor: Number(l.total) }));
}
