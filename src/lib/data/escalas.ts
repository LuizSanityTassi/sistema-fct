// Escalas 5x2: leituras do banco (o RLS decide o que cada um vê: administrador e RH tudo, coordenador a regional,
// gerente a filial dele).
import "server-only";
import { colaboradorDaLinha, configDaLinha, type LinhaFilialEscala } from "@/lib/escalas/resumo";
import { projetarEscala, type Alerta, type Analise, type Colaborador, type ConfigFilial, type DiaCobertura, type Escala, type PessoaEscala } from "@/lib/escalas/motor";
import { createClient } from "@/lib/supabase/server";

export type FilialEscala = {
  id: string;
  codigo: string;
  nome: string;
  regional: string | null;
  linha: LinhaFilialEscala & { origem: string | null; atualizado_em: string };
  config: ConfigFilial;
  equipe: Colaborador[];
};

const COLS_COLAB = "id, branch_id, nome, funcao, situacao, horas_dia, intervalo_min, registro, regime, afastado_de, afastado_ate";

/** Filiais com escala configurada (que a pessoa vê) e a equipe de cada uma. */
export async function filiaisDaEscala(): Promise<FilialEscala[]> {
  const supabase = await createClient();
  const [{ data: fil, error }, { data: col, error: e2 }] = await Promise.all([
    supabase.from("esc_filiais").select("*, filial:branches!inner(id, codigo, nome, regional)"),
    supabase.from("esc_colaboradores").select(COLS_COLAB).order("ordem").order("nome").limit(5000),
  ]);
  if (error) throw new Error(error.message);
  if (e2) throw new Error(e2.message);
  const porFilial = new Map<string, Colaborador[]>();
  for (const c of col ?? []) {
    const l = porFilial.get(c.branch_id) ?? [];
    l.push(colaboradorDaLinha(c));
    porFilial.set(c.branch_id, l);
  }
  return (fil ?? [])
    .map((f) => ({
      id: f.filial.id,
      codigo: f.filial.codigo,
      nome: f.filial.nome,
      regional: f.filial.regional,
      linha: f,
      config: configDaLinha(f, f.filial),
      equipe: porFilial.get(f.branch_id) ?? [],
    }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));
}

export async function filialDaEscala(branchId: string): Promise<FilialEscala | null> {
  const supabase = await createClient();
  const [{ data: f }, { data: col }] = await Promise.all([
    supabase.from("esc_filiais").select("*, filial:branches!inner(id, codigo, nome, regional)").eq("branch_id", branchId).maybeSingle(),
    supabase.from("esc_colaboradores").select(COLS_COLAB).eq("branch_id", branchId).order("ordem").order("nome"),
  ]);
  if (!f) return null;
  return { id: f.filial.id, codigo: f.filial.codigo, nome: f.filial.nome, regional: f.filial.regional, linha: f, config: configDaLinha(f, f.filial), equipe: (col ?? []).map(colaboradorDaLinha) };
}

export type ColaboradorDetalhe = {
  id: string;
  nome: string;
  funcao: string;
  situacao: string;
  afastado_de: string | null;
  afastado_ate: string | null;
  horas_dia: number | null;
  intervalo_min: number;
  registro: string | null;
  regime: string;
  observacoes: string | null;
  cargo_origem: string | null;
  horario_origem: { semana?: string; sabado?: string; domingo?: string } | null;
  origem: string;
  revisar: boolean;
  employee_id: string | null;
  rh: { id: string; nome: string; status: string; cargo: string | null; filial: { id: string; codigo: string } | null } | null;
};

/** Equipe da filial com a ficha do RH ligada (quando a pessoa vê o RH). */
export async function equipeDetalhada(branchId: string): Promise<ColaboradorDetalhe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esc_colaboradores")
    .select("id, nome, funcao, situacao, afastado_de, afastado_ate, horas_dia, intervalo_min, registro, regime, observacoes, cargo_origem, horario_origem, origem, revisar, employee_id, rh:employees!esc_colaboradores_employee_id_fkey(id, nome, status, cargo, filial:branches!employees_branch_id_fkey(id, codigo))")
    .eq("branch_id", branchId)
    .order("ordem")
    .order("nome");
  if (error) throw new Error(error.message);
  return (data ?? []).map((c) => ({ ...c, horario_origem: (c.horario_origem ?? null) as ColaboradorDetalhe["horario_origem"], rh: c.rh ? { ...c.rh, status: String(c.rh.status) } : null }));
}

export type FuncionarioRh = { id: string; nome: string; cargo: string | null; status: string; filial: { codigo: string } | null };

/** Funcionários do RH (ativos, afastados e de férias) que a pessoa vê, para ligar à equipe da escala. */
export async function funcionariosRh(branchId?: string): Promise<FuncionarioRh[]> {
  const supabase = await createClient();
  let q = supabase.from("employees").select("id, nome, cargo, status, filial:branches!employees_branch_id_fkey(codigo)").in("status", ["ativo", "afastado", "ferias"]).order("nome").limit(3000);
  if (branchId) q = q.eq("ponto_filial_id", branchId); // escala segue a filial do ponto
  const { data } = await q;
  return (data ?? []).map((e) => ({ ...e, status: String(e.status) }));
}

/** Filiais ativas que a pessoa vê e que ainda não estão na escala. */
export async function filiaisForaDaEscala() {
  const supabase = await createClient();
  const [{ data: todas }, { data: ja }] = await Promise.all([
    supabase.from("branches").select("id, codigo, nome, regional").eq("ativo", true).order("codigo"),
    supabase.from("esc_filiais").select("branch_id"),
  ]);
  const tem = new Set((ja ?? []).map((x) => x.branch_id));
  return (todas ?? []).filter((b) => !tem.has(b.id));
}

// ---------------------------------------------------------------------------------------------------------------
// Opções geradas
// ---------------------------------------------------------------------------------------------------------------

export type ResumoSimulacao = {
  id: string;
  lote: string;
  branch_id: string;
  opcao: number;
  ano: number;
  mes: number;
  inicio: string | null;
  fim: string | null;
  continua: boolean;
  jornada_semanal: number;
  folgas_permitidas: number[];
  situacao: string;
  qtd_alertas: number | null;
  analise_pendente: boolean;
  criado_em: string;
  publicado_em: string | null;
  filial: { id: string; codigo: string; nome: string };
  autor: { nome: string | null } | null;
  publicador: { nome: string | null } | null;
};

const COLS_RESUMO =
  "id, lote, branch_id, opcao, ano, mes, inicio, fim, continua, jornada_semanal, folgas_permitidas, situacao, qtd_alertas, analise_pendente, criado_em, publicado_em, filial:branches!inner(id, codigo, nome), autor:profiles!esc_simulacoes_criado_por_fkey(nome), publicador:profiles!esc_simulacoes_publicado_por_fkey(nome)";

export async function opcoesDoLote(lote: string): Promise<ResumoSimulacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("esc_simulacoes").select(COLS_RESUMO).eq("lote", lote).order("opcao").limit(400);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ResumoSimulacao[]).sort((a, b) => a.filial.codigo.localeCompare(b.filial.codigo, "pt-BR", { numeric: true }) || a.opcao - b.opcao);
}

export type Simulacao = Escala & {
  id: string;
  lote: string;
  branchId: string;
  opcao: number;
  situacao: "rascunho" | "oficial" | "substituida";
  /** oficial que segue valendo nos próximos períodos até outra ser publicada */
  continua: boolean;
  config: ConfigFilial;
  analisadoEm: string | null;
  criadoEm: string;
  publicadoEm: string | null;
  autor: string | null;
  publicador: string | null;
  filial: { id: string; codigo: string; nome: string };
};

type LinhaSim = {
  id: string;
  lote: string;
  branch_id: string;
  opcao: number;
  ano: number;
  mes: number;
  inicio: string | null;
  fim: string | null;
  continua: boolean;
  jornada_semanal: number;
  folgas_permitidas: number[];
  situacao: string;
  config: unknown;
  equipe: unknown;
  cobertura: unknown;
  alertas: unknown;
  alertas_base: unknown;
  analise: unknown;
  analise_pendente: boolean;
  analisado_em: string | null;
  criado_em: string;
  publicado_em: string | null;
  filial: { id: string; codigo: string; nome: string };
  autor: { nome: string | null } | null;
  publicador: { nome: string | null } | null;
};

export function simulacaoDaLinha(l: LinhaSim): Simulacao {
  return {
    id: l.id,
    lote: l.lote,
    branchId: l.branch_id,
    opcao: l.opcao,
    ano: l.ano,
    mes: l.mes,
    inicio: l.inicio,
    fim: l.fim,
    continua: !!l.continua,
    jornadaSemanal: l.jornada_semanal,
    folgasPermitidas: l.folgas_permitidas,
    situacao: l.situacao as Simulacao["situacao"],
    config: l.config as ConfigFilial,
    equipe: l.equipe as PessoaEscala[],
    cobertura: l.cobertura as DiaCobertura[],
    alertas: (l.alertas ?? []) as Alerta[],
    alertasBase: (l.alertas_base ?? null) as Alerta[] | null,
    analise: (l.analise ?? null) as Analise | null,
    analisePendente: l.analise_pendente,
    analisadoEm: l.analisado_em,
    criadoEm: l.criado_em,
    publicadoEm: l.publicado_em,
    autor: l.autor?.nome ?? null,
    publicador: l.publicador?.nome ?? null,
    filial: l.filial,
  };
}

const COLS_SIM =
  "id, lote, branch_id, opcao, ano, mes, inicio, fim, continua, jornada_semanal, folgas_permitidas, situacao, config, equipe, cobertura, alertas, alertas_base, analise, analise_pendente, analisado_em, criado_em, publicado_em, filial:branches!inner(id, codigo, nome), autor:profiles!esc_simulacoes_criado_por_fkey(nome), publicador:profiles!esc_simulacoes_publicado_por_fkey(nome)";

/** Opções completas (com a escala) de uma filial dentro do lote. */
export async function simulacoesDaFilial(lote: string, branchId: string): Promise<Simulacao[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("esc_simulacoes").select(COLS_SIM).eq("lote", lote).eq("branch_id", branchId).order("opcao");
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaSim[]).map(simulacaoDaLinha);
}

export async function simulacoesPorIds(ids: string[]): Promise<Simulacao[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("esc_simulacoes").select(COLS_SIM).in("id", ids);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaSim[]).map(simulacaoDaLinha).sort((a, b) => a.filial.codigo.localeCompare(b.filial.codigo, "pt-BR", { numeric: true }));
}

export async function simulacao(id: string): Promise<Simulacao | null> {
  return (await simulacoesPorIds([id]))[0] ?? null;
}

export type LoteRecente = {
  lote: string;
  criadoEm: string;
  autor: string | null;
  ano: number;
  mes: number;
  inicio: string | null;
  fim: string | null;
  jornada: number;
  filiais: { codigo: string; nome: string }[];
  opcoes: number;
  semPendencia: number;
  oficiais: number;
};

/** Gerações recentes (cada lote é uma vez que alguém clicou em "Gerar"). */
export async function lotesRecentes(limite = 15): Promise<LoteRecente[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("esc_simulacoes").select(COLS_RESUMO).order("criado_em", { ascending: false }).limit(600);
  const lotes = new Map<string, LoteRecente>();
  for (const s of (data ?? []) as ResumoSimulacao[]) {
    const l = lotes.get(s.lote) ?? { lote: s.lote, criadoEm: s.criado_em, autor: s.autor?.nome ?? null, ano: s.ano, mes: s.mes, inicio: s.inicio, fim: s.fim, jornada: s.jornada_semanal, filiais: [], opcoes: 0, semPendencia: 0, oficiais: 0 };
    if (!l.filiais.some((f) => f.codigo === s.filial.codigo)) l.filiais.push({ codigo: s.filial.codigo, nome: s.filial.nome });
    l.opcoes += 1;
    if (!s.qtd_alertas) l.semPendencia += 1;
    if (s.situacao === "oficial") l.oficiais += 1;
    lotes.set(s.lote, l);
  }
  return [...lotes.values()].slice(0, limite);
}

/** Escalas oficiais publicadas (a vigente de cada filial e mês). */
export async function escalasOficiais(): Promise<ResumoSimulacao[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("esc_simulacoes").select(COLS_RESUMO).eq("situacao", "oficial").order("ano", { ascending: false }).order("mes", { ascending: false }).limit(300);
  return ((data ?? []) as ResumoSimulacao[]).sort((a, b) => b.ano - a.ano || b.mes - a.mes || a.filial.codigo.localeCompare(b.filial.codigo, "pt-BR", { numeric: true }));
}

export type EscalaVigente = { base: Simulacao; escala: Escala; projetada: boolean };

/**
 * Escala oficial que vale para a filial na competência: a publicada para ela ou, se não houver, a última publicada antes
 * marcada como "segue até ser alterada" (levada para o período pedido). Nulo se nenhuma vale.
 */
export async function escalaVigente(branchId: string, ano: number, mes: number): Promise<EscalaVigente | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("esc_simulacoes")
    .select("id, ano, mes, continua")
    .eq("branch_id", branchId)
    .eq("situacao", "oficial")
    .or(`ano.lt.${ano},and(ano.eq.${ano},mes.lte.${mes})`)
    .order("ano", { ascending: false })
    .order("mes", { ascending: false })
    .limit(1);
  const ultima = data?.[0];
  if (!ultima) return null;
  const exata = ultima.ano === ano && ultima.mes === mes;
  if (!exata && !ultima.continua) return null;
  const base = await simulacao(ultima.id);
  if (!base) return null;
  if (exata) return { base, escala: base, projetada: false };
  // base sem semana inteira (período escolhido curto) não tem o que repetir: não segue
  try {
    return { base, escala: projetarEscala(base.config, base, ano, mes), projetada: true };
  } catch {
    return null;
  }
}
