import type { Sessao } from "@/lib/auth/session";
import { CATEGORIA_CHAMADO_LABEL, type CategoriaChamado } from "@/lib/chamados/rotulos";
import { ehUuid } from "@/lib/data/filiais";
import { hojeIso } from "@/lib/formatos";
import { competenciaAtual, competenciaValida } from "@/lib/rh/competencia";
import { ASO_TIPO_LABEL, situacaoAso, STATUS_LABEL } from "@/lib/rh/rotulos";
import type { Linha, Relatorio } from "@/lib/relatorios/csv";
import { createClient } from "@/lib/supabase/server";

export const TIPOS_RELATORIO = {
  funcionarios: "Quadro de funcionários",
  aso: "ASO e documentos",
  chamados: "Chamados",
  folha: "Folha por unidade",
} as const;
export type TipoRelatorio = keyof typeof TIPOS_RELATORIO;

export function tipoRelatorioValido(v: unknown): v is TipoRelatorio {
  return typeof v === "string" && v in TIPOS_RELATORIO;
}

export type FiltrosRelatorio = {
  tipo: TipoRelatorio;
  filial?: string;
  situacao?: string;
  de: string;
  ate: string;
  competencia: string;
};

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function lerFiltrosRelatorio(sp: Record<string, string | string[] | undefined>): FiltrosRelatorio {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const hoje = hojeIso();
  const competencia = s("competencia");
  return {
    tipo: tipoRelatorioValido(s("tipo")) ? (s("tipo") as TipoRelatorio) : "funcionarios",
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    situacao: s("situacao") || undefined,
    de: DATA_RE.test(s("de")) ? s("de") : somarDias(hoje, -30),
    ate: DATA_RE.test(s("ate")) ? s("ate") : hoje,
    competencia: competenciaValida(competencia) ? competencia : competenciaAtual(),
  };
}

const podeVerSalario = (s: Sessao) => s.papel === "admin" || s.papel === "rh";

// ---------- 1. quadro de funcionários por unidade ----------

export async function relatorioFuncionarios(sessao: Sessao, f: FiltrosRelatorio): Promise<Relatorio[]> {
  const supabase = await createClient();
  const comSalario = podeVerSalario(sessao);
  const [unidades, funcionarios, salarios] = await Promise.all([
    supabase.from("branches").select("id, codigo, nome, regional, ativo, organizations(nome_fantasia)").order("codigo"),
    supabase.from("employees").select("id, status, branch_id"),
    comSalario ? supabase.from("employee_current_salary").select("employee_id, salario") : Promise.resolve({ data: [], error: null }),
  ]);
  if (unidades.error) throw unidades.error;
  if (funcionarios.error) throw funcionarios.error;

  const salarioDe = new Map((salarios.data ?? []).map((s) => [s.employee_id ?? "", Number(s.salario ?? 0)]));
  type Acum = { ativos: number; afastados: number; ferias: number; desligados: number; folha: number };
  const porUnidade = new Map<string, Acum>();
  for (const e of funcionarios.data) {
    const a = porUnidade.get(e.branch_id) ?? { ativos: 0, afastados: 0, ferias: 0, desligados: 0, folha: 0 };
    if (e.status === "ativo") a.ativos += 1;
    else if (e.status === "afastado") a.afastados += 1;
    else if (e.status === "ferias") a.ferias += 1;
    else a.desligados += 1;
    if (e.status !== "desligado") a.folha += salarioDe.get(e.id) ?? 0;
    porUnidade.set(e.branch_id, a);
  }

  const linhas: Linha[] = [];
  const totais: Linha = { codigo: "TOTAL", ativos: 0, afastados: 0, ferias: 0, em_atividade: 0, desligados: 0, folha_base: 0 };
  for (const u of unidades.data) {
    if (f.filial && u.id !== f.filial) continue;
    const a = porUnidade.get(u.id);
    if (!a && !u.ativo) continue;
    const em = (a?.ativos ?? 0) + (a?.afastados ?? 0) + (a?.ferias ?? 0);
    const linha: Linha = {
      grupo: u.organizations?.nome_fantasia ?? "",
      regional: u.regional ?? "",
      codigo: u.codigo,
      unidade: u.nome,
      ativos: a?.ativos ?? 0,
      afastados: a?.afastados ?? 0,
      ferias: a?.ferias ?? 0,
      em_atividade: em,
      desligados: a?.desligados ?? 0,
      folha_base: comSalario ? Math.round((a?.folha ?? 0) * 100) / 100 : null,
    };
    linhas.push(linha);
    for (const k of ["ativos", "afastados", "ferias", "em_atividade", "desligados", "folha_base"] as const) {
      totais[k] = (Number(totais[k]) || 0) + (Number(linha[k]) || 0);
    }
  }
  if (!comSalario) totais.folha_base = null;

  return [
    {
      titulo: "Quadro de funcionários por unidade",
      colunas: [
        { chave: "grupo", titulo: "Grupo" },
        { chave: "regional", titulo: "Regional" },
        { chave: "codigo", titulo: "Código" },
        { chave: "unidade", titulo: "Unidade" },
        { chave: "ativos", titulo: "Ativos", tipo: "inteiro" },
        { chave: "afastados", titulo: "Afastados", tipo: "inteiro" },
        { chave: "ferias", titulo: "Férias", tipo: "inteiro" },
        { chave: "em_atividade", titulo: "Em atividade", tipo: "inteiro" },
        { chave: "desligados", titulo: "Desligados", tipo: "inteiro" },
        ...(comSalario ? [{ chave: "folha_base", titulo: "Folha base (R$)", tipo: "moeda" as const }] : []),
      ],
      linhas,
      totais,
    },
  ];
}

// ---------- 2. ASO e documentos por funcionário ----------

export async function relatorioAso(_sessao: Sessao, f: FiltrosRelatorio): Promise<Relatorio[]> {
  const supabase = await createClient();
  let consultaFunc = supabase
    .from("employees")
    .select("id, nome, cargo, branch_id, branches!employees_branch_id_fkey(codigo, nome)")
    .neq("status", "desligado")
    .order("nome");
  if (f.filial) consultaFunc = consultaFunc.eq("branch_id", f.filial);
  const [funcionarios, asos, documentos] = await Promise.all([
    consultaFunc,
    supabase.from("employee_aso").select("employee_id, tipo, data_realizacao, data_validade").eq("ativo", true),
    supabase.from("employee_documents").select("employee_id").eq("ativo", true),
  ]);
  if (funcionarios.error) throw funcionarios.error;
  if (asos.error) throw asos.error;
  if (documentos.error) throw documentos.error;

  // ASO mais recente por funcionário (maior validade; sem validade fica por último)
  const ultimo = new Map<string, { tipo: string; data_realizacao: string | null; data_validade: string | null }>();
  for (const a of asos.data) {
    const atual = ultimo.get(a.employee_id);
    if (!atual || (a.data_validade ?? "") > (atual.data_validade ?? "")) ultimo.set(a.employee_id, a);
  }
  const docs = new Map<string, number>();
  for (const d of documentos.data) docs.set(d.employee_id, (docs.get(d.employee_id) ?? 0) + 1);

  const linhas: Linha[] = [];
  const resumo = { vencido: 0, vencendo: 0, valido: 0, sem_aso: 0 };
  for (const e of funcionarios.data) {
    const a = ultimo.get(e.id);
    const sit = a ? situacaoAso(a.data_validade) : { codigo: "sem_aso" as const, rotulo: "Sem ASO" };
    resumo[sit.codigo === "sem_validade" ? "valido" : sit.codigo] += 1;
    if (f.situacao && f.situacao !== "todos" && sit.codigo !== f.situacao) continue;
    linhas.push({
      codigo: e.branches?.codigo ?? "",
      unidade: e.branches?.nome ?? "",
      funcionario: e.nome,
      cargo: e.cargo ?? "",
      tipo_aso: a ? ASO_TIPO_LABEL[a.tipo as keyof typeof ASO_TIPO_LABEL] : "",
      data_exame: a?.data_realizacao ?? null,
      validade: a?.data_validade ?? null,
      situacao: sit.rotulo,
      documentos: docs.get(e.id) ?? 0,
    });
  }
  return [
    {
      titulo: `ASO e documentos (${resumo.vencido} vencidos · ${resumo.vencendo} vencendo · ${resumo.valido} válidos · ${resumo.sem_aso} sem ASO)`,
      colunas: [
        { chave: "codigo", titulo: "Código" },
        { chave: "unidade", titulo: "Unidade" },
        { chave: "funcionario", titulo: "Funcionário" },
        { chave: "cargo", titulo: "Cargo" },
        { chave: "tipo_aso", titulo: "Último ASO" },
        { chave: "data_exame", titulo: "Exame", tipo: "data" },
        { chave: "validade", titulo: "Validade", tipo: "data" },
        { chave: "situacao", titulo: "Situação" },
        { chave: "documentos", titulo: "Documentos", tipo: "inteiro" },
      ],
      linhas,
    },
  ];
}

// ---------- 3. chamados por categoria e por unidade ----------

export async function relatorioChamados(_sessao: Sessao, f: FiltrosRelatorio): Promise<Relatorio[]> {
  const supabase = await createClient();
  const inicio = `${f.de}T00:00:00-03:00`;
  const fim = `${f.ate}T23:59:59-03:00`;
  const { data, error } = await supabase
    .from("tickets")
    .select("categoria, status, prioridade, created_at, resolved_at, branch_id, branches(codigo, nome)")
    .or(`created_at.gte.${inicio},resolved_at.gte.${inicio},status.not.in.(resolvido,cancelado)`);
  if (error) throw error;

  type Acum = { abertos: number; resolvidos: number; pendentes: number; horas: number; urgentes: number };
  const novo = (): Acum => ({ abertos: 0, resolvidos: 0, pendentes: 0, horas: 0, urgentes: 0 });
  const porCategoria = new Map<string, Acum>();
  const porUnidade = new Map<string, Acum & { codigo: string; unidade: string }>();
  for (const t of data) {
    if (f.filial && t.branch_id !== f.filial) continue;
    const cat = porCategoria.get(t.categoria) ?? novo();
    const chaveU = t.branch_id ?? "sem";
    const uni = porUnidade.get(chaveU) ?? { ...novo(), codigo: t.branches?.codigo ?? "—", unidade: t.branches?.nome ?? "Sem unidade" };
    const abertoNoPeriodo = t.created_at >= inicio && t.created_at <= fim;
    const resolvidoNoPeriodo = t.status === "resolvido" && !!t.resolved_at && t.resolved_at >= inicio && t.resolved_at <= fim;
    const pendente = t.status !== "resolvido" && t.status !== "cancelado";
    for (const a of [cat, uni]) {
      if (abertoNoPeriodo) a.abertos += 1;
      if (abertoNoPeriodo && (t.prioridade === "alta" || t.prioridade === "critica")) a.urgentes += 1;
      if (resolvidoNoPeriodo) {
        a.resolvidos += 1;
        a.horas += (Date.parse(t.resolved_at!) - Date.parse(t.created_at)) / 3_600_000;
      }
      if (pendente) a.pendentes += 1;
    }
    porCategoria.set(t.categoria, cat);
    porUnidade.set(chaveU, uni);
  }
  const linhaDe = (a: Acum, extra: Linha): Linha => ({
    ...extra,
    abertos: a.abertos,
    urgentes: a.urgentes,
    resolvidos: a.resolvidos,
    pendentes: a.pendentes,
    tempo_medio_h: a.resolvidos > 0 ? Math.round((a.horas / a.resolvidos) * 10) / 10 : null,
  });
  const colunasBase = [
    { chave: "abertos", titulo: "Abertos no período", tipo: "inteiro" as const },
    { chave: "urgentes", titulo: "Alta/crítica", tipo: "inteiro" as const },
    { chave: "resolvidos", titulo: "Resolvidos no período", tipo: "inteiro" as const },
    { chave: "pendentes", titulo: "Pendentes hoje", tipo: "inteiro" as const },
    { chave: "tempo_medio_h", titulo: "Tempo médio (h)", tipo: "numero" as const },
  ];
  const categorias = (Object.keys(CATEGORIA_CHAMADO_LABEL) as CategoriaChamado[]).map((c) =>
    linhaDe(porCategoria.get(c) ?? novo(), { categoria: CATEGORIA_CHAMADO_LABEL[c] }),
  );
  const unidades = [...porUnidade.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((u) => linhaDe(u, { codigo: u.codigo, unidade: u.unidade }));
  return [
    {
      titulo: `Chamados por categoria — ${f.de} a ${f.ate}`,
      colunas: [{ chave: "categoria", titulo: "Categoria" }, ...colunasBase],
      linhas: categorias,
    },
    {
      titulo: "Chamados por unidade",
      colunas: [{ chave: "codigo", titulo: "Código" }, { chave: "unidade", titulo: "Unidade" }, ...colunasBase],
      linhas: unidades,
    },
  ];
}

// ---------- 4. folha por unidade ----------

export async function relatorioFolha(sessao: Sessao, f: FiltrosRelatorio): Promise<Relatorio[]> {
  if (!podeVerSalario(sessao)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_records")
    .select("status, salario_base, horas_extras, adicionais, inss, irrf, outros_descontos, valor_liquido, fgts, employees!inner(branch_id, branches!employees_branch_id_fkey(codigo, nome, regional))")
    .eq("competencia", f.competencia);
  if (error) throw error;

  type Acum = { codigo: string; unidade: string; regional: string; funcionarios: number; bruto: number; inss: number; irrf: number; outros: number; liquido: number; fgts: number; fechados: number };
  const por = new Map<string, Acum>();
  for (const r of data) {
    const b = r.employees.branches;
    const chave = r.employees.branch_id;
    if (f.filial && chave !== f.filial) continue;
    const a = por.get(chave) ?? { codigo: b?.codigo ?? "—", unidade: b?.nome ?? "", regional: b?.regional ?? "", funcionarios: 0, bruto: 0, inss: 0, irrf: 0, outros: 0, liquido: 0, fgts: 0, fechados: 0 };
    a.funcionarios += 1;
    a.bruto += Number(r.salario_base) + Number(r.horas_extras) + Number(r.adicionais);
    a.inss += Number(r.inss);
    a.irrf += Number(r.irrf);
    a.outros += Number(r.outros_descontos);
    a.liquido += Number(r.valor_liquido);
    a.fgts += Number(r.fgts);
    if (r.status !== "rascunho") a.fechados += 1;
    por.set(chave, a);
  }
  const arred = (n: number) => Math.round(n * 100) / 100;
  const linhas: Linha[] = [...por.values()]
    .sort((x, y) => x.codigo.localeCompare(y.codigo))
    .map((a) => ({
      codigo: a.codigo,
      unidade: a.unidade,
      regional: a.regional,
      funcionarios: a.funcionarios,
      bruto: arred(a.bruto),
      inss: arred(a.inss),
      irrf: arred(a.irrf),
      outros: arred(a.outros),
      liquido: arred(a.liquido),
      fgts: arred(a.fgts),
      situacao: a.fechados === a.funcionarios ? "fechada/paga" : a.fechados === 0 ? "em elaboração" : "parcial",
    }));
  const totais: Linha = { codigo: "TOTAL" };
  for (const k of ["funcionarios", "bruto", "inss", "irrf", "outros", "liquido", "fgts"]) {
    totais[k] = arred(linhas.reduce((s, l) => s + Number(l[k] ?? 0), 0));
  }
  return [
    {
      titulo: `Folha ${f.competencia} por unidade (${STATUS_LABEL.ativo.toLowerCase()}s e afastados com registro)`,
      colunas: [
        { chave: "codigo", titulo: "Código" },
        { chave: "unidade", titulo: "Unidade" },
        { chave: "regional", titulo: "Regional" },
        { chave: "funcionarios", titulo: "Funcionários", tipo: "inteiro" },
        { chave: "bruto", titulo: "Bruto (R$)", tipo: "moeda" },
        { chave: "inss", titulo: "INSS (R$)", tipo: "moeda" },
        { chave: "irrf", titulo: "IRRF (R$)", tipo: "moeda" },
        { chave: "outros", titulo: "Outros desc. (R$)", tipo: "moeda" },
        { chave: "liquido", titulo: "Líquido (R$)", tipo: "moeda" },
        { chave: "fgts", titulo: "FGTS (R$)", tipo: "moeda" },
        { chave: "situacao", titulo: "Situação" },
      ],
      linhas,
      totais,
    },
  ];
}

export async function gerarRelatorio(sessao: Sessao, f: FiltrosRelatorio): Promise<Relatorio[]> {
  switch (f.tipo) {
    case "funcionarios":
      return relatorioFuncionarios(sessao, f);
    case "aso":
      return relatorioAso(sessao, f);
    case "chamados":
      return relatorioChamados(sessao, f);
    case "folha":
      return relatorioFolha(sessao, f);
  }
}
