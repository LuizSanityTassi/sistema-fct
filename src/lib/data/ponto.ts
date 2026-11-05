import { cache } from "react";
import { getSessao, type Sessao } from "@/lib/auth/session";
import {
  apurarPeriodo,
  hojeLocal,
  limitesMes,
  momentoDe,
  somarDias,
  type ApuracaoDia,
  type Ausencia,
  type ContextoFuncionario,
  type JornadaModelo,
  type Marcacao,
  type Programacao,
  type TipoAusencia,
  type TipoMarcacao,
  type TotaisPeriodo,
} from "@/lib/ponto/calculo";
import { createClient } from "@/lib/supabase/server";

// Leitura do ponto. O que cada um enxerga é decidido pelo RLS (funcionário: o próprio; gerente: a filial;
// coordenador: a regional; RH e admin: tudo). As contas ficam em lib/ponto/calculo.ts.

const LOTE = 1000;
type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Lê todas as páginas de uma consulta (o PostgREST devolve no máximo 1000 por vez). */
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const out: T[] = [];
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < LOTE) break;
  }
  return out;
}

/** Divide uma lista de ids em lotes (o filtro `in` vai na URL). */
function lotes<T>(ids: T[], n = 150) {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
  return out;
}

export type FuncPonto = {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  branch_id: string;
  department_id: string | null;
  status: string;
  data_admissao: string | null;
  data_desligamento: string | null;
  filialCodigo: string;
  filialNome: string;
  departamento: string | null;
};

type LinhaEquipe = {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  branch_id: string;
  department_id: string | null;
  status: string;
  data_admissao: string | null;
  data_desligamento: string | null;
  filial_codigo: string;
  filial_nome: string;
  departamento: string | null;
};

function paraFunc(e: LinhaEquipe): FuncPonto {
  return {
    id: e.id,
    nome: e.nome,
    matricula: e.matricula,
    cargo: e.cargo,
    branch_id: e.branch_id,
    department_id: e.department_id,
    status: e.status,
    data_admissao: e.data_admissao,
    data_desligamento: e.data_desligamento,
    filialCodigo: e.filial_codigo,
    filialNome: e.filial_nome,
    departamento: e.departamento,
  };
}

/** O funcionário do usuário logado (profiles.employee_id), ou null. */
export const meuFuncionario = cache(async (): Promise<FuncPonto | null> => {
  const sessao = await getSessao();
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("employee_id").eq("id", sessao.id).maybeSingle();
  if (!p?.employee_id) return null;
  const r = await listarEquipe({ ids: [p.employee_id], desligados: true });
  return r[0] ?? null;
});

/** Quem gere o ponto (vê equipe, aprova, configura): admin, RH, gerente, coordenador. */
/** Chamados abertos de liberação de extra (o RH/DP escolhe um para liberar). */
export async function chamadosDeExtraAbertos() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, numero, titulo")
    .eq("categoria", "rh")
    .eq("subcategoria", "liberacao_extra")
    .not("status", "in", "(resolvido,cancelado)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data ?? [];
}

/** Extras liberadas de hoje em diante, por funcionário, com o número do chamado. */
export async function extrasLiberadas(employeeIds: string[]) {
  const mapa = new Map<string, { id: string; dia: string; numero: number | null }[]>();
  if (!employeeIds.length) return mapa;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ponto_extras_liberadas")
    .select("id, employee_id, dia, ticket_id")
    .in("employee_id", employeeIds)
    .is("cancelado_em", null)
    .gte("dia", hojeLocal())
    .order("dia");
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((l) => l.ticket_id))];
  const { data: tickets } = ids.length ? await supabase.from("tickets").select("id, numero").in("id", ids) : { data: [] };
  const numero = new Map((tickets ?? []).map((t) => [t.id, t.numero]));
  for (const l of data ?? []) mapa.set(l.employee_id, [...(mapa.get(l.employee_id) ?? []), { id: l.id, dia: l.dia, numero: numero.get(l.ticket_id) ?? null }]);
  return mapa;
}

export function gerePonto(s: Pick<Sessao, "papel">) {
  return ["admin", "rh", "gerente", "coordenador"].includes(s.papel);
}
/** Configura jornadas, feriados, fecha o mês: admin e RH. */
export function administraPonto(s: Pick<Sessao, "papel">) {
  return s.papel === "admin" || s.papel === "rh";
}

export type FiltroEquipe = { filial?: string; departamento?: string; q?: string; desligados?: boolean; ids?: string[] };

/**
 * Funcionários que o usuário enxerga no ponto (o próprio + as filiais que ele gere ou coordena), só com os campos do
 * ponto. Vem da função ponto_equipe: employees é restrita a admin, RH e gerente.
 */
export async function listarEquipe(f: FiltroEquipe = {}): Promise<FuncPonto[]> {
  if (f.ids && !f.ids.length) return [];
  const supabase = await createClient();
  const linhas = await todas<LinhaEquipe>((de, ate) =>
    supabase
      .rpc("ponto_equipe", {
        p_branch: f.filial ?? null,
        p_departamento: f.departamento ?? null,
        p_q: f.q ? f.q.replace(/[%_\\]/g, " ").trim() || null : null,
        p_ids: f.ids ?? null,
        p_desligados: !!f.desligados,
      })
      .range(de, ate),
  );
  return linhas.map(paraFunc);
}

export async function obterFuncPonto(id: string) {
  const r = await listarEquipe({ ids: [id], desligados: true });
  return r[0] ?? null;
}

// ------------------------------------------------------------------------------------------------ jornadas
export type JornadaCompleta = JornadaModelo & { descricao: string | null; branch_id: string | null; ativo: boolean; updated_at: string };

export const listarJornadas = cache(async (): Promise<JornadaCompleta[]> => {
  const supabase = await createClient();
  const [{ data: js, error }, { data: dias, error: e2 }] = await Promise.all([
    supabase.from("ponto_jornadas").select("id, nome, descricao, tipo, branch_id, ciclo_dias, data_base, tolerancia_min, ativo, updated_at").order("nome"),
    supabase.from("ponto_jornada_dias").select("jornada_id, posicao, folga, entrada, intervalo_inicio, intervalo_fim, saida").order("posicao"),
  ]);
  if (error) throw new Error(error.message);
  if (e2) throw new Error(e2.message);
  return (js ?? []).map((j) => ({
    ...j,
    tipo: j.tipo as "semanal" | "ciclo",
    dias: (dias ?? []).filter((d) => d.jornada_id === j.id).map((d) => ({ posicao: d.posicao, folga: d.folga, entrada: d.entrada, intervalo_inicio: d.intervalo_inicio, intervalo_fim: d.intervalo_fim, saida: d.saida })),
  }));
});

export type ConfigFilial = { jornada_padrao_id: string | null; exige_localizacao: boolean; inicio_controle: string };

export const configFiliais = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ponto_config_filial").select("branch_id, jornada_padrao_id, exige_localizacao, inicio_controle");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((c) => [c.branch_id, { jornada_padrao_id: c.jornada_padrao_id, exige_localizacao: c.exige_localizacao, inicio_controle: c.inicio_controle } as ConfigFilial]));
});

export type VinculoLinha = { id: string; employee_id: string; jornada_id: string; inicio: string; fim: string | null };

export async function listarVinculos(ids: string[]): Promise<VinculoLinha[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const out: VinculoLinha[] = [];
  for (const l of lotes(ids)) {
    const r = await todas<VinculoLinha>((de, ate) => supabase.from("ponto_vinculos").select("id, employee_id, jornada_id, inicio, fim").in("employee_id", l).order("inicio").range(de, ate));
    out.push(...r);
  }
  return out;
}

export async function listarFeriados(de: string, ate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("ponto_feriados").select("id, data, nome, abrangencia, branch_id").gte("data", de).lte("data", ate).order("data");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type AusenciaLinha = Ausencia & { employee_id: string; registrado_em: string };

export async function listarAusencias(ids: string[], de: string, ate: string): Promise<AusenciaLinha[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const out: AusenciaLinha[] = [];
  for (const l of lotes(ids)) {
    const r = await todas<AusenciaLinha>((a, b) =>
      supabase.from("ponto_ausencias").select("id, employee_id, tipo, inicio, fim, observacao, registrado_em").in("employee_id", l).lte("inicio", ate).gte("fim", de).order("inicio").range(a, b) as unknown as PromiseLike<{ data: AusenciaLinha[] | null; error: { message: string } | null }>,
    );
    out.push(...r.map((x) => ({ ...x, tipo: x.tipo as TipoAusencia })));
  }
  return out;
}

export type ProgramacaoLinha = Programacao & { employee_id: string };

export async function listarProgramacao(ids: string[], de: string, ate: string): Promise<ProgramacaoLinha[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const out: ProgramacaoLinha[] = [];
  for (const l of lotes(ids)) {
    const r = await todas<ProgramacaoLinha>((a, b) =>
      supabase.from("ponto_programacao").select("employee_id, data, folga, entrada, intervalo_inicio, intervalo_fim, saida, motivo").in("employee_id", l).gte("data", de).lte("data", ate).range(a, b),
    );
    out.push(...r);
  }
  return out;
}

export type MarcacaoLinha = Marcacao & {
  employee_id: string;
  branch_id: string;
  dispositivo: string | null;
  ip: string | null;
  latitude: number | null;
  longitude: number | null;
  precisao_m: number | null;
  registrado_por: string | null;
  ajuste_id: string | null;
  anulada_em: string | null;
  created_at: string;
};

/** Marcações (com as anuladas) entre as datas locais `de` e `ate`, com folga de um dia para os turnos da noite. */
export async function listarMarcacoes(ids: string[], de: string, ate: string): Promise<MarcacaoLinha[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const ini = momentoDe(somarDias(de, -1), "00:00");
  const fim = momentoDe(somarDias(ate, 2), "00:00");
  const out: MarcacaoLinha[] = [];
  for (const l of lotes(ids)) {
    const r = await todas<MarcacaoLinha>((a, b) =>
      supabase
        .from("ponto_marcacoes")
        .select("id, nsr, employee_id, branch_id, momento, tipo, metodo, origem, dispositivo, ip, latitude, longitude, precisao_m, registrado_por, ajuste_id, anulada, anulada_motivo, anulada_em, created_at")
        .in("employee_id", l)
        .gte("momento", ini)
        .lt("momento", fim)
        .order("momento")
        .range(a, b) as unknown as PromiseLike<{ data: MarcacaoLinha[] | null; error: { message: string } | null }>,
    );
    out.push(...r.map((m) => ({ ...m, tipo: m.tipo as TipoMarcacao })));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ apuração
export type ApuracaoFunc = { func: FuncPonto; dias: ApuracaoDia[]; totais: TotaisPeriodo; jornadaAtual: string | null; inicioControle: string | null };

/** Monta o contexto (jornada, escala, feriados, ausências) e apura `de`…`ate` de cada funcionário. */
export async function apurar(funcs: FuncPonto[], de: string, ate: string, opcoes: { agora?: Date } = {}): Promise<ApuracaoFunc[]> {
  if (!funcs.length) return [];
  const ids = funcs.map((f) => f.id);
  const [jornadas, configs, vinculos, feriados, ausencias, programacao, marcacoes] = await Promise.all([
    listarJornadas(),
    configFiliais(),
    listarVinculos(ids),
    listarFeriados(somarDias(de, -1), ate),
    listarAusencias(ids, de, ate),
    listarProgramacao(ids, de, ate),
    listarMarcacoes(ids, de, ate),
  ]);
  const mapaJ = new Map(jornadas.map((j) => [j.id, j as JornadaModelo]));
  const agora = opcoes.agora ?? new Date();
  const hoje = hojeLocal(agora);
  return funcs.map((f) => {
    const cfg = configs.get(f.branch_id);
    const vs = vinculos.filter((v) => v.employee_id === f.id);
    // o controle começa no primeiro vínculo ou na data em que a filial ligou a jornada padrão
    const candidatos = [vs[0]?.inicio, cfg?.jornada_padrao_id ? cfg.inicio_controle : undefined].filter(Boolean) as string[];
    const inicioControle = candidatos.length ? candidatos.sort()[0] : null;
    const admissao = [f.data_admissao, inicioControle].filter(Boolean).sort().pop() ?? null;
    const ctx: ContextoFuncionario = {
      jornadas: mapaJ,
      vinculos: vs,
      jornadaPadraoId: cfg?.jornada_padrao_id ?? null,
      programacao: new Map(programacao.filter((p) => p.employee_id === f.id).map((p) => [p.data, p])),
      feriados: new Map(feriados.filter((x) => !x.branch_id || x.branch_id === f.branch_id).map((x) => [x.data, x.nome])),
      ausencias: ausencias.filter((a) => a.employee_id === f.id),
      admissao: inicioControle ? admissao : f.data_admissao,
      desligamento: f.data_desligamento,
    };
    const { dias, totais } = apurarPeriodo(ctx, marcacoes.filter((m) => m.employee_id === f.id), de, ate, { hoje, agora });
    const jAtual = vs.find((v) => v.inicio <= hoje && (!v.fim || v.fim >= hoje))?.jornada_id ?? cfg?.jornada_padrao_id ?? null;
    return { func: f, dias, totais, jornadaAtual: jAtual ? (mapaJ.get(jAtual)?.nome ?? null) : null, inicioControle };
  });
}

// ------------------------------------------------------------------------------------------------ fechamento e banco
export type FechamentoLinha = {
  id: string;
  competencia: string;
  branch_id: string;
  status: "fechado" | "reaberto";
  resumo: unknown;
  fechado_por: string | null;
  fechado_em: string | null;
  reaberto_por: string | null;
  reaberto_em: string | null;
  motivo_reabertura: string | null;
};

export async function listarFechamentos(competencias?: string[]): Promise<FechamentoLinha[]> {
  const supabase = await createClient();
  let q = supabase.from("ponto_fechamentos").select("id, competencia, branch_id, status, resumo, fechado_por, fechado_em, reaberto_por, reaberto_em, motivo_reabertura").order("competencia", { ascending: false });
  if (competencias?.length) q = q.in("competencia", competencias);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FechamentoLinha[];
}

export type MovimentoBanco = { id: string; employee_id: string; data: string; minutos: number; tipo: string; descricao: string | null; fechamento_id: string | null; registrado_em: string };

export const MOVIMENTO_LABEL: Record<string, string> = {
  fechamento: "Saldo do mês (fechamento)",
  compensacao: "Compensação",
  pagamento: "Pago em folha",
  ajuste: "Ajuste manual",
  saldo_inicial: "Saldo inicial",
};

export async function listarMovimentos(ids: string[]): Promise<MovimentoBanco[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const out: MovimentoBanco[] = [];
  for (const l of lotes(ids)) {
    out.push(...(await todas<MovimentoBanco>((a, b) => supabase.from("ponto_banco_movimentos").select("id, employee_id, data, minutos, tipo, descricao, fechamento_id, registrado_em").in("employee_id", l).order("data").range(a, b))));
  }
  return out;
}

export type MesBanco = { competencia: string; saldo: number; fechado: boolean };
export type BancoFunc = { func: FuncPonto; movimentos: MovimentoBanco[]; meses: MesBanco[]; saldoMovimentos: number; saldoAberto: number; total: number; creditos: number; debitos: number };

const competenciaDe = (data: string) => data.slice(0, 7);
function proximoMes(c: string) {
  const [a, m] = c.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * Banco de horas de cada funcionário até hoje: movimentos gravados (meses fechados, compensações, pagamentos,
 * ajustes) + o saldo calculado dos meses ainda abertos (no máximo 12 meses para trás).
 */
export async function bancoDeHoras(funcs: FuncPonto[], opcoes: { agora?: Date } = {}): Promise<BancoFunc[]> {
  if (!funcs.length) return [];
  const agora = opcoes.agora ?? new Date();
  const hoje = hojeLocal(agora);
  const ids = funcs.map((f) => f.id);
  const [movs, fechs, configs, vinculos] = await Promise.all([listarMovimentos(ids), listarFechamentos(), configFiliais(), listarVinculos(ids)]);
  const fechado = new Set(fechs.filter((f) => f.status === "fechado").map((f) => `${f.branch_id}|${f.competencia.slice(0, 7)}`));
  const limite = competenciaDe(somarDias(hoje, -365));
  // apura de uma vez do primeiro mês aberto (desde o início do controle) até hoje
  const inicios = [
    ...vinculos.map((v) => v.inicio),
    ...funcs.flatMap((f) => {
      const c = configs.get(f.branch_id);
      return c?.jornada_padrao_id ? [c.inicio_controle] : [];
    }),
  ].sort();
  let de = inicios[0] && inicios[0] > `${limite}-01` ? inicios[0] : `${limite}-01`;
  const filiais = [...new Set(funcs.map((f) => f.branch_id))];
  for (let c = competenciaDe(de); c < competenciaDe(hoje) && filiais.every((b) => fechado.has(`${b}|${c}`)); c = proximoMes(c)) de = `${proximoMes(c)}-01`;
  const ap = await apurar(funcs, de > hoje ? hoje : de, hoje, { agora });
  const porFunc = new Map(ap.map((a) => [a.func.id, a]));
  return funcs.map((f) => {
    const a = porFunc.get(f.id)!;
    const ms = movs.filter((m) => m.employee_id === f.id);
    const meses = new Map<string, number>();
    for (const d of a.dias) {
      if (d.situacao === "futuro" || d.situacao === "fora_contrato") continue;
      const c = competenciaDe(d.data);
      meses.set(c, (meses.get(c) ?? 0) + d.saldo);
    }
    const lista: MesBanco[] = [];
    const inicio = a.inicioControle ? competenciaDe(a.inicioControle > `${limite}-01` ? a.inicioControle : `${limite}-01`) : competenciaDe(hoje);
    for (let c = inicio; c <= competenciaDe(hoje); c = proximoMes(c)) {
      const fec = fechado.has(`${f.branch_id}|${c}`);
      const doFechamento = ms.filter((m) => m.tipo === "fechamento" && competenciaDe(m.data) === c).reduce((s, m) => s + m.minutos, 0);
      lista.push({ competencia: c, saldo: fec ? doFechamento : (meses.get(c) ?? 0), fechado: fec });
    }
    const saldoMovimentos = ms.reduce((s, m) => s + m.minutos, 0);
    const saldoAberto = lista.filter((m) => !m.fechado).reduce((s, m) => s + m.saldo, 0);
    const todosMinutos = [...ms.map((m) => m.minutos), ...lista.filter((m) => !m.fechado).map((m) => m.saldo)];
    return {
      func: f,
      movimentos: ms,
      meses: lista,
      saldoMovimentos,
      saldoAberto,
      total: saldoMovimentos + saldoAberto,
      creditos: todosMinutos.filter((x) => x > 0).reduce((s, x) => s + x, 0),
      debitos: -todosMinutos.filter((x) => x < 0).reduce((s, x) => s + x, 0),
    };
  });
}

// ------------------------------------------------------------------------------------------------ ajustes
export type AjusteLinha = {
  id: string;
  employee_id: string;
  branch_id: string;
  data: string;
  acao: "incluir" | "alterar" | "anular";
  tipo_marcacao: TipoMarcacao | null;
  marcacao_id: string | null;
  horario_original: string | null;
  horario_solicitado: string | null;
  motivo_tipo: string;
  motivo: string;
  status: "pendente" | "aprovado" | "recusado" | "cancelado";
  solicitado_por: string | null;
  solicitado_em: string;
  decidido_por: string | null;
  decidido_em: string | null;
  resposta: string | null;
  funcionario: string;
  filial: string;
  solicitante: string | null;
  decisor: string | null;
};

export type FiltroAjustes = { status?: string; filial?: string; funcionario?: string; de?: string; ate?: string; meus?: boolean; limite?: number };

export async function listarAjustes(f: FiltroAjustes = {}): Promise<AjusteLinha[]> {
  const supabase = await createClient();
  const sessao = await getSessao();
  let q = supabase
    .from("ponto_ajustes")
    .select("id, employee_id, branch_id, data, acao, tipo_marcacao, marcacao_id, horario_original, horario_solicitado, motivo_tipo, motivo, status, solicitado_por, solicitado_em, decidido_por, decidido_em, resposta, employees(nome), branches(codigo, nome)")
    .order("solicitado_em", { ascending: false })
    .limit(f.limite ?? 300);
  if (f.status) q = q.eq("status", f.status);
  if (f.filial) q = q.eq("branch_id", f.filial);
  if (f.funcionario) q = q.eq("employee_id", f.funcionario);
  if (f.de) q = q.gte("data", f.de);
  if (f.ate) q = q.lte("data", f.ate);
  if (f.meus) {
    const meu = await meuFuncionario();
    q = meu ? q.or(`solicitado_por.eq.${sessao.id},employee_id.eq.${meu.id}`) : q.eq("solicitado_por", sessao.id);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as unknown as (Omit<AjusteLinha, "funcionario" | "filial" | "solicitante" | "decisor"> & { employees: { nome: string } | null; branches: { codigo: string; nome: string } | null })[];
  const pessoas = [...new Set(linhas.flatMap((l) => [l.solicitado_por, l.decidido_por]).filter(Boolean) as string[])];
  const nomes = await nomesDePerfis(supabase, pessoas);
  return linhas.map(({ employees, branches, ...l }) => ({
    ...l,
    funcionario: employees?.nome ?? "—",
    filial: branches ? `${branches.codigo} ${branches.nome}` : "—",
    solicitante: l.solicitado_por ? (nomes.get(l.solicitado_por) ?? null) : null,
    decisor: l.decidido_por ? (nomes.get(l.decidido_por) ?? null) : null,
  }));
}

/** Nomes de quem pediu/decidiu/fechou (profiles é restrita; a função só devolve quem aparece no ponto visível). */
export async function nomesDePerfis(supabase: Cliente, ids: string[]) {
  const mapa = new Map<string, string>();
  for (const l of lotes(ids)) {
    const { data } = await supabase.rpc("ponto_nomes", { p_ids: l });
    for (const p of data ?? []) mapa.set(p.id, p.nome);
  }
  return mapa;
}

/** Pedidos de ajuste pendentes que o usuário pode decidir (para o sino e o dashboard). */
export async function contarAjustesPendentes(sessao: Sessao) {
  if (!gerePonto(sessao) || sessao.papel === "coordenador") return 0;
  const supabase = await createClient();
  const { count } = await supabase.from("ponto_ajustes").select("id", { count: "exact", head: true }).eq("status", "pendente").neq("solicitado_por", sessao.id);
  return count ?? 0;
}

// ------------------------------------------------------------------------------------------------ filtros comuns
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MES_RE = /^\d{4}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerUuid(v: unknown) {
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}
export function lerData(v: unknown) {
  return typeof v === "string" && DATA_RE.test(v) ? v : undefined;
}
/** "2026-10" (padrão: mês atual). */
export function lerMes(v: unknown, agora = new Date()) {
  return typeof v === "string" && MES_RE.test(v) ? v : hojeLocal(agora).slice(0, 7);
}

/** Período do mês, cortado em hoje quando é o mês corrente (dias futuros não entram). */
export function periodoDoMes(mes: string, agora = new Date()) {
  const { de, ate } = limitesMes(mes);
  return { de, ate, hoje: hojeLocal(agora) };
}

export function rotuloMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function mesAnterior(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}
export { proximoMes };
