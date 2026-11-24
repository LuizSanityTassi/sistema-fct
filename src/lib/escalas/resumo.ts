// Escalas 5x2: conversão das linhas do banco para o motor e os resumos que as telas, o PDF e o Excel mostram.
// Sem acesso ao banco (serve no servidor e no navegador).
import {
  DIAS,
  ROTULO_DIA,
  ehFuncao,
  ehRegime,
  ehSituacao,
  type Alerta,
  type Colaborador,
  type ConfigFilial,
  type Dia,
  type Escala,
  type Faixa,
  type Funcao,
  type PeriodoEscala,
  inicioFolha,
  ordenarDatas,
  rotuloData,
  rotuloPeriodo,
} from "./motor";

export type LinhaFilialEscala = {
  branch_id: string;
  semana_abre: string | null;
  semana_fecha: string | null;
  sabado_abre: string | null;
  sabado_fecha: string | null;
  domingo_abre: string | null;
  domingo_fecha: string | null;
  min_farmaceuticos: number;
  acordo_jornada_estendida: boolean;
  folgas_permitidas: number[];
};
export type LinhaColaborador = {
  id: string;
  nome: string;
  funcao: string;
  situacao: string;
  horas_dia: number | null;
  intervalo_min: number;
  registro: string | null;
  regime?: string | null;
};

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Linha de esc_filiais → configuração do motor. Seg–Sex sem horário fica "aberta e pendente"; sábado e domingo vazios = fechada. */
export function configDaLinha(l: LinhaFilialEscala, filial: { codigo: string; nome: string }): ConfigFilial {
  const semana: Faixa = { abre: hm(l.semana_abre), fecha: hm(l.semana_fecha) };
  const faixa = (abre: string | null, fecha: string | null): Faixa => (abre && fecha ? { abre: hm(abre), fecha: hm(fecha) } : null);
  return {
    branchId: l.branch_id,
    codigo: filial.codigo,
    nome: filial.nome,
    horarios: { dom: faixa(l.domingo_abre, l.domingo_fecha), seg: semana, ter: semana, qua: semana, qui: semana, sex: semana, sab: faixa(l.sabado_abre, l.sabado_fecha) },
    minimos: { farmaceutico: Number(l.min_farmaceuticos ?? 0) },
    acordoJornadaEstendida: !!l.acordo_jornada_estendida,
    folgasPermitidas: (l.folgas_permitidas ?? [2, 3, 4]).map(Number),
  };
}

export function colaboradorDaLinha(l: LinhaColaborador): Colaborador {
  return {
    id: l.id,
    nome: l.nome,
    funcao: ehFuncao(l.funcao) ? l.funcao : "outros",
    situacao: ehSituacao(l.situacao) ? l.situacao : "ativo",
    horasDia: l.horas_dia === null ? null : Number(l.horas_dia),
    intervaloMin: Number(l.intervalo_min ?? 60),
    registro: l.registro,
    regime: ehRegime(l.regime) ? l.regime : "5x2",
  };
}

export const horarioPendente = (l: Pick<LinhaFilialEscala, "semana_abre" | "semana_fecha">) => !l.semana_abre || !l.semana_fecha;

/** "Seg–Sex 07:00–20:00 · Sáb 08:00–18:00 · Dom fechada" */
export function textoFuncionamento(cfg: ConfigFilial) {
  const f = (x: Faixa) => (x === null ? "fechada" : x.abre && x.fecha ? `${x.abre}–${x.fecha}` : "pendente");
  return `Seg–Sex ${f(cfg.horarios.seg)} · Sáb ${f(cfg.horarios.sab)} · Dom ${f(cfg.horarios.dom)}`;
}

export const modeloFilial = (cfg: ConfigFilial) => (cfg.horarios.dom !== null ? "Seg–Dom" : cfg.horarios.sab !== null ? "Seg–Sáb" : "Seg–Sex");

/** Dias da semana (0 = domingo) em texto: "ter, qua, qui". */
export function rotuloDias(dias: number[] | null | undefined) {
  const l = [...new Set((dias ?? []).map(Number))]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => ROTULO_DIA[DIAS[d]])
    .filter(Boolean);
  return l.length ? l.join(", ") : "nenhum";
}

/** Ordem de exibição dos dias (segunda primeiro). */
export const DIAS_SEMANA_ORDEM = [1, 2, 3, 4, 5, 6, 0] as const;

export type GrupoAlerta = Alerta & { ocorrencias: number; datas: number[]; faixasTodas: string[]; sugestoesTodas: string[] };

/** Junta os alertas repetidos (mesma mensagem, pessoa e função) com as datas e faixas de cada um. */
export function agruparAlertas(alertas: Alerta[]): GrupoAlerta[] {
  const grupos = new Map<string, GrupoAlerta>();
  for (const a of alertas) {
    const k = [a.severidade, a.funcao ?? "", a.pessoaId ?? "", a.mensagem].join("|");
    const g = grupos.get(k) ?? { ...a, ocorrencias: 0, datas: [], faixasTodas: [], sugestoesTodas: [] };
    g.ocorrencias += 1;
    if (a.data && !g.datas.includes(a.data)) g.datas.push(a.data);
    for (const h of a.faixas ?? []) if (!g.faixasTodas.includes(h)) g.faixasTodas.push(h);
    for (const s of a.sugestoes ?? []) if (!g.sugestoesTodas.includes(s)) g.sugestoesTodas.push(s);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, datas: g.datas.sort((x, y) => x - y), faixasTodas: g.faixasTodas.sort() }))
    .sort((a, b) => Number(b.severidade === "alta") - Number(a.severidade === "alta"));
}

/** Datas do período em texto, na ordem do período: "21/11, 25/11, 02/12". */
export const datasTexto = (datas: number[], p: PeriodoEscala) => (datas.length ? ordenarDatas(p, datas).map((d) => rotuloData(p, d)).join(", ") : "sem data específica");

/** Folgas da equipe ativa: quantas caem em ter–qui (preferência) e quantas em seg/sex (dias de venda). */
export function estatFolgas(e: Pick<Escala, "equipe">) {
  const folgas = e.equipe.filter((p) => p.situacao === "ativo").flatMap((p) => p.turnos.filter((t) => t.status === "folga"));
  const preferidas = folgas.filter((t) => ["ter", "qua", "qui"].includes(t.dia)).length;
  const venda = folgas.filter((t) => ["seg", "sex"].includes(t.dia)).length;
  const porDia = Object.fromEntries(DIAS.map((d) => [d, 0])) as Record<Dia, number>;
  for (const t of folgas) porDia[t.dia] += 1;
  return { total: folgas.length, preferidas, venda, pct: folgas.length ? Math.round((preferidas / folgas.length) * 100) : 0, porDia };
}

/** Faixas de uma hora sem o mínimo de uma função (ex.: farmacêutico) no mês. */
export function lacunas(e: Pick<Escala, "cobertura">, funcao: Funcao, minimo: number) {
  const faltas = e.cobertura.flatMap((d) => (d.aberto ? d.faixas.filter((f) => (f.porFuncao[funcao] ?? 0) < minimo).map((f) => ({ ...f, data: d.data, dia: d.dia })) : []));
  const abertos = e.cobertura.filter((d) => d.aberto);
  const diasCobertos = abertos.filter((d) => d.faixas.length && d.faixas.every((f) => (f.porFuncao[funcao] ?? 0) >= minimo)).length;
  const porDia = new Map<Dia, { datas: Set<number>; horas: Set<string> }>();
  for (const f of faltas) {
    const g = porDia.get(f.dia) ?? { datas: new Set(), horas: new Set() };
    g.datas.add(f.data);
    g.horas.add(f.hora);
    porDia.set(f.dia, g);
  }
  const detalhe = [...porDia.entries()]
    .sort((a, b) => ((DIAS.indexOf(a[0]) + 6) % 7) - ((DIAS.indexOf(b[0]) + 6) % 7))
    .map(([d, g]) => `${ROTULO_DIA[d]}: ${g.datas.size} dia(s), ${[...g.horas].sort().join(", ")}`)
    .join(" · ");
  return { faixas: faltas.length, dias: new Set(faltas.map((f) => f.data)).size, diasCobertos, diasAbertos: abertos.length, detalhe };
}

export const horasEquipe = (e: Pick<Escala, "equipe">) => e.equipe.reduce((s, p) => s + p.totalHoras, 0);
export const excedenteEquipe = (e: Pick<Escala, "equipe">) => e.equipe.reduce((s, p) => s + p.excedente, 0);

/** Texto curto da célula do calendário: hora de entrada, F (folga), — (fechado), A (afastado), I (inativo). */
export function celula(status: string, inicio?: string) {
  if (status === "trabalho") return inicio || "Trab.";
  if (status === "folga") return "F";
  if (status === "afastamento") return "A";
  if (status === "inativo") return "I";
  return "—";
}

export const nomeMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
export const mesCurto = (ano: number, mes: number) => `${String(mes).padStart(2, "0")}/${ano}`;

/** Competência do período que está correndo hoje (Brasília): do dia 21 em diante já é a do mês seguinte, como a folha. */
export function competenciaAtual(agora = new Date()) {
  const [a, m, d] = agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number);
  if (d < 21) return { ano: a, mes: m };
  return m === 12 ? { ano: a + 1, mes: 1 } : { ano: a, mes: m + 1 };
}

/** Próximo período a planejar (o seguinte ao que está correndo): padrão do simulador e da pré-análise. */
export function proximoMes(agora = new Date()) {
  const { ano, mes } = competenciaAtual(agora);
  return mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
}

/** Competência com o período da folha: "dez/2026 (21/11 a 20/12)". */
export function rotuloCompetencia(ano: number, mes: number) {
  const nome = new Date(Date.UTC(ano, mes - 1, 15)).toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" }).replace(".", "");
  const [de, ate] = rotuloPeriodo({ ano, mes, inicio: inicioFolha(ano, mes) }).split(" a ");
  return `${nome}/${ano} (${de.slice(0, 5)} a ${ate.slice(0, 5)})`;
}

/** Como a escala aparece nas listas: o período escolhido ("05/12 a 04/01/2027"), a competência da folha ou o mês civil (antigas). */
export function rotuloDaEscala(e: { ano: number; mes: number; inicio?: string | null; fim?: string | null }) {
  if (e.inicio && e.fim) {
    const [de, ate] = rotuloPeriodo(e).split(" a ");
    return `${de.slice(0, 5)} a ${ate}`;
  }
  return e.inicio ? rotuloCompetencia(e.ano, e.mes) : mesCurto(e.ano, e.mes);
}

/** Período de uma escala em texto: "21/11/2026 a 20/12/2026" (as antigas, do mês civil: "01/11/2026 a 30/11/2026"). */
export const textoPeriodo = (p: PeriodoEscala) => rotuloPeriodo(p);

/** Lê "AAAA-MM". */
export function lerMesAno(v: unknown): { ano: number; mes: number } | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})$/.exec(v) : null;
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  return ano >= 2024 && ano <= 2035 && mes >= 1 && mes <= 12 ? { ano, mes } : null;
}
