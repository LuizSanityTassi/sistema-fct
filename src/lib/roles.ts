// Papéis do sistema — espelham o enum `app_role` do Postgres (supabase/migrations/0001_core_schema.sql).
export const PAPEIS = ["admin", "rh", "ti", "financeiro", "contador", "coordenador", "gerente", "manutencao", "compras", "diretor_compras", "marketing", "usuario", "relogio"] as const;
export type AppRole = (typeof PAPEIS)[number];

export const PAPEL_LABEL: Record<AppRole, string> = {
  admin: "Administrador",
  rh: "RH",
  ti: "TI",
  financeiro: "Financeiro",
  contador: "Contador",
  coordenador: "Coordenador de vendas",
  gerente: "Gerente",
  manutencao: "Manutenção",
  compras: "Compras",
  diretor_compras: "Diretor de Compras",
  marketing: "Marketing",
  usuario: "Usuário",
  relogio: "Relógio de ponto",
};

/** Como o cargo aparece na tela: "TI · administrador do sistema" para quem tem a marcação. */
export function rotuloCargo(cargo: AppRole, adminSistema = false) {
  return adminSistema ? `${PAPEL_LABEL[cargo]} · administrador do sistema` : PAPEL_LABEL[cargo];
}

export function ehPapel(valor: unknown): valor is AppRole {
  return typeof valor === "string" && (PAPEIS as readonly string[]).includes(valor);
}
