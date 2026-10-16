import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 50;

export const ENTIDADES_AUDITADAS: Record<string, string> = {
  organizations: "Grupos",
  branches: "Unidades",
  employees: "Funcionários",
  employee_salaries: "Salários",
  employee_documents: "Documentos",
  employee_aso: "ASO",
  payroll_records: "Folha",
  tickets: "Chamados",
  profiles: "Usuários",
  user_branch_access: "Acesso a unidades",
  folha_lancamentos: "Lançamentos da folha",
  folha_eventos: "Eventos da folha",
  folha_empresas_dominio: "Empresas na Domínio",
  denuncias: "Canal de denúncias",
  denuncia_responsaveis: "Acesso às denúncias",
  caixa_diferencas: "Diferença de caixa",
  caixa_operadores: "Operadores do caixa",
  caixa_gestores: "Gestores das quebras",
};

export const ACOES_AUDITADAS: Record<string, string> = {
  criar: "Criou",
  editar: "Editou",
  inativar: "Inativou",
  reativar: "Reativou",
  importar: "Importou",
  excluir: "Excluiu",
  exportar: "Exportou",
};

export type FiltrosAuditoria = {
  usuario?: string;
  entidade?: string;
  acao?: string;
  de?: string;
  ate?: string;
  registro?: string;
  pagina: number;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

export function lerFiltrosAuditoria(sp: Record<string, string | string[] | undefined>): FiltrosAuditoria {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const entidade = s("entidade");
  const acao = s("acao");
  return {
    usuario: ehUuid(s("usuario")) ? s("usuario") : undefined,
    entidade: entidade in ENTIDADES_AUDITADAS ? entidade : undefined,
    acao: acao in ACOES_AUDITADAS ? acao : undefined,
    de: DATA_RE.test(s("de")) ? s("de") : undefined,
    ate: DATA_RE.test(s("ate")) ? s("ate") : undefined,
    registro: ehUuid(s("registro")) ? s("registro") : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export async function listarAuditoria(f: FiltrosAuditoria) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase
    .from("audit_logs")
    .select("id, acao, entidade, registro_id, valor_anterior, valor_novo, created_at, user_id, usuario:profiles(nome)", { count: "exact" });
  if (f.usuario) consulta = consulta.eq("user_id", f.usuario);
  if (f.entidade) consulta = consulta.eq("entidade", f.entidade);
  if (f.acao) consulta = consulta.eq("acao", f.acao);
  if (f.registro) consulta = consulta.eq("registro_id", f.registro);
  if (f.de) consulta = consulta.gte("created_at", `${f.de}T00:00:00-03:00`);
  if (f.ate) consulta = consulta.lte("created_at", `${f.ate}T23:59:59-03:00`);
  const { data, error, count } = await consulta
    .order("created_at", { ascending: false })
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

/** Usuários que já aparecem na auditoria (para o filtro). */
export async function listarAutoresAuditoria() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, nome").order("nome");
  if (error) return [];
  return data;
}
