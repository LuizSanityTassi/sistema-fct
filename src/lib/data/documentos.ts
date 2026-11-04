import { ehUuid } from "@/lib/data/filiais";
import { hojeIso } from "@/lib/formatos";
import type { CategoriaDocumento, TipoAso } from "@/lib/rh/rotulos";
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA = 25;

// ---------- por funcionário ----------

export async function listarDocumentosDoFuncionario(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, categoria, nome, descricao, data_documento, storage_path, created_at, assinatura, assinado_path, enviado_por:profiles(nome)")
    .eq("employee_id", employeeId)
    .eq("ativo", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function listarAsoDoFuncionario(employeeId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_aso")
    .select("id, tipo, data_realizacao, data_validade, storage_path, observacoes, created_at")
    .eq("employee_id", employeeId)
    .eq("ativo", true)
    .order("data_realizacao", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

export type TipoArquivo = "documento" | "aso" | "holerite" | "anexo" | "caixa" | "sangria";

/** Para download: devolve o caminho no Storage (o RLS decide se o usuário pode ver). */
export async function obterArquivo(tipo: TipoArquivo, id: string, opcoes: { original?: boolean } = {}) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  if (tipo === "documento") {
    const { data } = await supabase
      .from("employee_documents")
      .select("id, nome, storage_path, assinado_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    // documento já assinado: o que vale é o assinado; o original continua guardado
    return data.assinado_path && !opcoes.original ? { nome: `${data.nome} (assinado)`, storage_path: data.assinado_path } : { nome: data.nome, storage_path: data.storage_path };
  }
  if (tipo === "holerite") {
    const { data } = await supabase
      .from("payroll_records")
      .select("id, competencia, storage_path")
      .eq("id", id)
      .maybeSingle();
    return data?.storage_path ? { nome: `holerite-${data.competencia}`, storage_path: data.storage_path } : null;
  }
  if (tipo === "anexo") {
    const { data } = await supabase
      .from("ticket_attachments")
      .select("id, nome, storage_path")
      .eq("id", id)
      .maybeSingle();
    return data ? { nome: data.nome, storage_path: data.storage_path } : null;
  }
  if (tipo === "sangria") {
    const { data } = await supabase.from("sangria_anexos").select("id, nome, storage_path").eq("id", id).maybeSingle();
    return data ? { nome: data.nome, storage_path: data.storage_path } : null;
  }
  if (tipo === "caixa") {
    const { data } = await supabase.from("caixa_anexos").select("id, nome, storage_path").eq("id", id).maybeSingle();
    return data ? { nome: data.nome, storage_path: data.storage_path } : null;
  }
  const { data } = await supabase.from("employee_aso").select("id, tipo, storage_path").eq("id", id).maybeSingle();
  return data?.storage_path ? { nome: `ASO ${data.tipo}`, storage_path: data.storage_path } : null;
}

// ---------- listas gerais (menu Documentos / ASO) ----------

export type FiltrosDocumentos = {
  q?: string;
  filial?: string;
  categoria?: CategoriaDocumento;
  pagina: number;
};

export function lerFiltrosDocumentos(sp: Record<string, string | string[] | undefined>): FiltrosDocumentos {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const categoria = s("categoria");
  return {
    q: s("q") || undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    categoria: categoria ? (categoria as CategoriaDocumento) : undefined,
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export async function listarDocumentos(f: FiltrosDocumentos) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase
    .from("employee_documents")
    .select(
      "id, categoria, nome, data_documento, created_at, assinatura, employees!inner(id, nome, branch_id, branches!employees_branch_id_fkey(id, codigo, nome))",
      { count: "exact" },
    )
    .eq("ativo", true);
  if (f.categoria) consulta = consulta.eq("categoria", f.categoria);
  if (f.filial) consulta = consulta.eq("employees.branch_id", f.filial);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) consulta = consulta.ilike("employees.nome", `%${termo}%`);
  }
  const { data, error, count } = await consulta
    .order("created_at", { ascending: false })
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

/** Documentos que passam pela assinatura do funcionário (o RLS mostra ao gerente só os da filial dele). */
export async function listarAssinaturas(situacao: "aguardando" | "assinado") {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employee_documents")
    .select("id, categoria, nome, descricao, created_at, assinado_em, enviado_por:profiles(nome), employees!inner(id, nome, status, branches!employees_branch_id_fkey(codigo, nome))")
    .eq("ativo", true)
    .eq("assinatura", situacao)
    .order(situacao === "aguardando" ? "created_at" : "assinado_em", { ascending: situacao === "aguardando" })
    .limit(200);
  if (error) throw error;
  return data;
}

/** Empresa do funcionário para a ficha de registro (a filial) e a declaração do banco (a empresa do grupo). */
export async function carregarEmpresaDaFilial(branchId: string | null) {
  if (!branchId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("branches")
    .select("razao_social, cnpj, organizations(id, razao_social, cnpj, razao_declaracao, endereco_declaracao, socio_nome, socio_cpf)")
    .eq("id", branchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Assinatura do sócio para a declaração do banco (o RLS só libera para Admin e RH). */
export async function carregarAssinaturaDoSocio(organizationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("rh_assinatura_socio").select("imagem").eq("organization_id", organizationId).maybeSingle();
  return data?.imagem ?? null;
}

export type SituacaoAsoFiltro = "vencidos" | "proximos" | "validos" | "todos";
export type FiltrosAso = {
  q?: string;
  filial?: string;
  tipo?: TipoAso;
  situacao: SituacaoAsoFiltro;
  pagina: number;
};

export function lerFiltrosAso(sp: Record<string, string | string[] | undefined>): FiltrosAso {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const situacao = s("situacao");
  const tipo = s("tipo");
  return {
    q: s("q") || undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    tipo: tipo ? (tipo as TipoAso) : undefined,
    situacao: situacao === "vencidos" || situacao === "proximos" || situacao === "validos" ? situacao : "todos",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export async function listarAsos(f: FiltrosAso) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  const hoje = hojeIso();
  let consulta = supabase
    .from("employee_aso")
    .select(
      "id, tipo, data_realizacao, data_validade, storage_path, observacoes, employees!inner(id, nome, status, branch_id, branches!employees_branch_id_fkey(id, codigo, nome))",
      { count: "exact" },
    )
    .eq("ativo", true)
    .neq("employees.status", "desligado");
  if (f.tipo) consulta = consulta.eq("tipo", f.tipo);
  if (f.filial) consulta = consulta.eq("employees.branch_id", f.filial);
  if (f.situacao === "vencidos") consulta = consulta.lt("data_validade", hoje);
  if (f.situacao === "proximos") consulta = consulta.gte("data_validade", hoje).lte("data_validade", somarDias(hoje, 30));
  if (f.situacao === "validos") consulta = consulta.gt("data_validade", somarDias(hoje, 30));
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) consulta = consulta.ilike("employees.nome", `%${termo}%`);
  }
  const { data, error, count } = await consulta
    .order("data_validade", { ascending: true, nullsFirst: false })
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

/** Painel do ASO: vencidos, vencendo em 30 dias, válidos e funcionários ativos sem nenhum ASO. */
export async function resumoAso() {
  const supabase = await createClient();
  const hoje = hojeIso();
  const limite = somarDias(hoje, 30);
  const [{ data: asos, error: e1 }, { data: ativos, error: e2 }] = await Promise.all([
    supabase.from("employee_aso").select("employee_id, data_validade, employees!inner(status)").eq("ativo", true).neq("employees.status", "desligado"),
    supabase.from("employees").select("id").neq("status", "desligado"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const resumo = { vencidos: 0, proximos: 0, validos: 0, semAso: 0 };
  const comAso = new Set<string>();
  for (const a of asos) {
    comAso.add(a.employee_id);
    if (!a.data_validade) continue;
    if (a.data_validade < hoje) resumo.vencidos += 1;
    else if (a.data_validade <= limite) resumo.proximos += 1;
    else resumo.validos += 1;
  }
  resumo.semAso = ativos.filter((e) => !comAso.has(e.id)).length;
  return resumo;
}
