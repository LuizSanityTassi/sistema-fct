import { cache } from "react";
import { ehUuid } from "@/lib/data/filiais";
import { ehPapel, type AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 25;

export type FiltrosUsuarios = { q?: string; papel?: AppRole; situacao: "ativos" | "inativos" | "todos"; pagina: number };

export function lerFiltrosUsuarios(sp: Record<string, string | string[] | undefined>): FiltrosUsuarios {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const situacao = s("situacao");
  const papel = s("papel");
  return {
    q: s("q") || undefined,
    papel: ehPapel(papel) ? papel : undefined,
    situacao: situacao === "inativos" || situacao === "todos" ? situacao : "ativos",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export async function listarUsuarios(f: FiltrosUsuarios) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase
    .from("profiles")
    .select("id, nome, email, papel, admin_sistema, ativo, ultimo_acesso, created_at, branch_id, unidade:branches!profiles_branch_id_fkey(id, codigo, nome)", { count: "exact" });
  if (f.situacao !== "todos") consulta = consulta.eq("ativo", f.situacao === "ativos");
  if (f.papel) consulta = consulta.eq("papel", f.papel);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) consulta = consulta.or(`nome.ilike.%${termo}%,email.ilike.%${termo}%`);
  }
  const { data, error, count } = await consulta.order("nome").range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

export const obterUsuario = cache(async (id: string) => {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const [{ data, error }, { data: acessos }, { data: comite }] = await Promise.all([
    supabase.from("profiles").select("*, unidade:branches!profiles_branch_id_fkey(id, codigo, nome)").eq("id", id).maybeSingle(),
    supabase.from("user_branch_access").select("branch_id").eq("user_id", id),
    supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", id).maybeSingle(),
  ]);
  if (error) throw error;
  if (!data) return null;
  return { ...data, filiaisAdicionais: (acessos ?? []).map((a) => a.branch_id), respondeDenuncias: !!comite };
});

export async function contarPorPapel() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("papel, ativo");
  if (error) throw error;
  const r: Record<string, number> = {};
  for (const p of data) if (p.ativo) r[p.papel] = (r[p.papel] ?? 0) + 1;
  return r;
}

export type SituacaoAcesso = { confirmado: boolean; convidadoEm: string | null; ultimoLogin: string | null };

/** Por usuário: já criou a senha (confirmado), quando recebeu o convite e o último login. Só admin enxerga. */
export async function situacaoAcesso() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("usuarios_acesso");
  if (error) throw error;
  return new Map<string, SituacaoAcesso>((data ?? []).map((r) => [r.id, { confirmado: r.confirmado, convidadoEm: r.convidado_em, ultimoLogin: r.ultimo_login }]));
}

export type ConvitePendente = { id: string; nome: string; email: string; branchId: string | null; codigo: string | null; filial: string | null };

/** Logins ativos que ainda não receberam o convite (conta criada sem e-mail, sem senha). */
export async function convitesPendentes(): Promise<ConvitePendente[]> {
  const supabase = await createClient();
  const [acesso, { data, error }] = await Promise.all([
    situacaoAcesso(),
    supabase.from("profiles").select("id, nome, email, ativo, branch_id, unidade:branches!profiles_branch_id_fkey(codigo, nome)").eq("ativo", true).not("email", "is", null).order("nome").range(0, 4999),
  ]);
  if (error) throw error;
  return data.flatMap((p) => {
    const s = acesso.get(p.id);
    if (!p.email || !s || s.confirmado || s.convidadoEm) return [];
    return [{ id: p.id, nome: p.nome, email: p.email, branchId: p.branch_id, codigo: p.unidade?.codigo ?? null, filial: p.unidade?.nome ?? null }];
  });
}

/** Funcionários ativos com e-mail na ficha e sem login ligado (ex.: e-mail digitado errado na planilha do RH). */
export async function funcionariosSemLogin() {
  const supabase = await createClient();
  const [{ data: func, error }, { data: ligados, error: erroLigados }] = await Promise.all([
    supabase.from("employees").select("id, nome, email").neq("status", "desligado").not("email", "is", null).order("nome").range(0, 4999),
    supabase.from("profiles").select("employee_id").not("employee_id", "is", null).range(0, 4999),
  ]);
  if (error) throw error;
  if (erroLigados) throw erroLigados;
  const comLogin = new Set((ligados ?? []).map((l) => l.employee_id));
  return (func ?? []).filter((f) => !comLogin.has(f.id));
}
