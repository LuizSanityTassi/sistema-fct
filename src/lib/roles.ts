// Papéis do sistema — espelham o enum `app_role` do Postgres (supabase/migrations/0001_core_schema.sql).
export const PAPEIS = ["admin", "rh", "ti", "financeiro", "contador", "gerente", "usuario"] as const;
export type AppRole = (typeof PAPEIS)[number];

export const PAPEL_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  rh: "RH",
  ti: "TI",
  financeiro: "Financeiro",
  contador: "Contador",
  gerente: "Gerente",
  usuario: "Usuário",
};

export function ehPapel(valor: unknown): valor is AppRole {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}
