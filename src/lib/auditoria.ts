import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";

export type AcaoAuditoria = "criar" | "editar" | "inativar" | "reativar" | "importar" | "excluir" | "convidar";

type RegistroAuditoria = {
  userId: string;
  acao: AcaoAuditoria;
  /** Nome da tabela/entidade (ex.: "branches"). */
  entidade: string;
  registroId?: string | null;
  anterior?: Record<string, unknown> | null;
  novo?: Record<string, unknown> | null;
};

// Campos que nunca entram na auditoria.
const OCULTAR = new Set(["senha", "password", "token", "created_at", "updated_at"]);

function limpar(obj: Record<string, unknown> | null | undefined): Json {
  if (!obj) return null;
  const saida: Record<string, Json> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (OCULTAR.has(k) || v === undefined) continue;
    saida[k] = v as Json;
  }
  return saida;
}

/** Só as chaves cujo valor mudou, nos dois lados (antes/depois). */
export function diferencas(
  anterior: Record<string, unknown>,
  novo: Record<string, unknown>,
): { anterior: Record<string, unknown>; novo: Record<string, unknown> } {
  const a: Record<string, unknown> = {};
  const n: Record<string, unknown> = {};
  for (const k of Object.keys(novo)) {
    if (JSON.stringify(anterior[k] ?? null) !== JSON.stringify(novo[k] ?? null)) {
      a[k] = anterior[k] ?? null;
      n[k] = novo[k] ?? null;
    }
  }
  return { anterior: a, novo: n };
}

/** Grava o registro de auditoria em nome do usuário logado. Falha não interrompe a operação principal. */
export async function registrarAuditoria(supabase: SupabaseClient<Database>, r: RegistroAuditoria) {
  const { error } = await supabase.from("audit_logs").insert({
    user_id: r.userId,
    acao: r.acao,
    entidade: r.entidade,
    registro_id: r.registroId ?? null,
    valor_anterior: limpar(r.anterior),
    valor_novo: limpar(r.novo),
  });
  if (error) console.error("[auditoria] falha ao registrar:", error.message);
}
