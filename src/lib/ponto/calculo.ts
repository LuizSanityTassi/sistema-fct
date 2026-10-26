// Cálculo do ponto: jornada prevista do dia, horas trabalhadas, tolerância, extras, débitos, adicional noturno e
// inconsistências. Funções puras (sem banco): o espelho, o banco de horas, o dashboard, os relatórios e o fechamento
// usam as MESMAS regras daqui.
//
// Regras (CLT):
//   • tolerância diária (art. 58 §1º): diferença de até `tolerancia_min` (padrão 10) entre trabalhado e previsto não
//     conta; passou disso, conta a diferença inteira;
//   • atraso / saída antecipada: aparecem a partir de 5 minutos por marcação;
//   • intervalo (art. 71): mais de 6h trabalhadas pedem 1h de intervalo; de 4h a 6h, 15 minutos;
//   • interjornada (art. 66): 11h entre a saída de um dia e a entrada do outro;
//   • limite de 2h extras por dia (art. 59): mais de 10h no dia vira alerta;
//   • adicional noturno: minutos entre 22h e 5h;
//   • trabalho em folga ou feriado sem escala: extra a 100%.
// Horário de Brasília sem horário de verão (desde 2019): UTC−3 fixo.

export const TIPOS_MARCACAO = ["entrada", "intervalo_inicio", "intervalo_fim", "saida"] as const;
export type TipoMarcacao = (typeof TIPOS_MARCACAO)[number];

export const TIPO_MARCACAO_LABEL: Record<TipoMarcacao, string> = {
  entrada: "Entrada",
  intervalo_inicio: "Saída para intervalo",
  intervalo_fim: "Volta do intervalo",
  saida: "Saída",
};
/** Rótulo curto (tabelas e espelho). */
export const TIPO_MARCACAO_CURTO: Record<TipoMarcacao, string> = {
  entrada: "Entrada",
  intervalo_inicio: "Intervalo",
  intervalo_fim: "Retorno",
  saida: "Saída",
};

export const TIPOS_AUSENCIA = ["ferias", "afastamento", "atestado", "licenca", "abono", "folga_compensatoria"] as const;
export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number];
export const AUSENCIA_LABEL: Record<TipoAusencia, string> = {
  ferias: "Férias",
  afastamento: "Afastamento",
  atestado: "Atestado",
  licenca: "Licença",
  abono: "Abono",
  folga_compensatoria: "Folga compensatória",
};

export const METODO_LABEL: Record<string, string> = {
  web: "Computador (web)",
  relogio_pin: "Relógio da filial (PIN)",
  celular: "Celular",
  qrcode: "QR Code",
  biometria: "Biometria",
  facial: "Reconhecimento facial",
  importacao: "Importação",
  ajuste: "Ajuste aprovado",
};

export const MOTIVOS_AJUSTE = ["esqueci_entrada", "esqueci_saida", "horario_incorreto", "trabalho_externo", "problema_sistema", "autorizado_gestor", "outro"] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];
export const MOTIVO_AJUSTE_LABEL: Record<MotivoAjuste, string> = {
  esqueci_entrada: "Esqueci de marcar a entrada",
  esqueci_saida: "Esqueci de marcar a saída",
  horario_incorreto: "Horário registrado errado",
  trabalho_externo: "Trabalho externo",
  problema_sistema: "Problema no sistema / relógio",
  autorizado_gestor: "Autorizado pelo gestor",
  outro: "Outro",
};

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const FUSO_MIN = -180; // America/Sao_Paulo
const TOLERANCIA_MARCACAO = 5;

export type Horarios = { entrada: string | null; intervalo_inicio: string | null; intervalo_fim: string | null; saida: string | null };
export type DiaModelo = Horarios & { posicao: number; folga: boolean };
export type JornadaModelo = {
  id: string;
  nome: string;
  tipo: "semanal" | "ciclo";
  ciclo_dias: number | null;
  data_base: string | null;
  tolerancia_min: number;
  dias: DiaModelo[];
};
export type Vinculo = { jornada_id: string; inicio: string; fim: string | null };
export type Programacao = Horarios & { data: string; folga: boolean; motivo: string | null };
export type Ausencia = { id: string; tipo: TipoAusencia; inicio: string; fim: string; observacao: string | null };
export type Marcacao = {
  id: string;
  momento: string;
  tipo: TipoMarcacao;
  metodo: string;
  origem: string;
  anulada: boolean;
  nsr?: number | null;
  anulada_motivo?: string | null;
};

/** Tudo o que define o previsto de um funcionário. */
export type ContextoFuncionario = {
  jornadas: Map<string, JornadaModelo>;
  vinculos: Vinculo[];
  /** jornada padrão da filial (quem não tem vínculo usa esta) */
  jornadaPadraoId: string | null;
  programacao: Map<string, Programacao>;
  /** data → nome do feriado (nacionais + da filial) */
  feriados: Map<string, string>;
  ausencias: Ausencia[];
  admissao?: string | null;
  desligamento?: string | null;
};

// ------------------------------------------------------------------------------------------------ tempo
/** "08:30" ou "08:30:00" → minutos desde 00:00. */
export function hm(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 510 → "08:30" */
export function hhmm(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Duração: 485 → "8:05"; 0 → "0:00". */
export function duracao(min: number) {
  const m = Math.abs(Math.round(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Saldo com sinal: +1:05 / −0:35 / 0:00. */
export function saldoTexto(min: number) {
  const r = Math.round(min);
  return r === 0 ? "0:00" : `${r > 0 ? "+" : "−"}${duracao(r)}`;
}

/** Data e minuto do dia no horário de Brasília. */
export function local(iso: string): { data: string; min: number } {
  const t = Date.parse(iso) + FUSO_MIN * 60_000;
  const d = new Date(t);
  return { data: d.toISOString().slice(0, 10), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/** Data + "HH:MM" (Brasília) → ISO. */
export function momentoDe(data: string, horario: string) {
  return new Date(`${data}T${horario.slice(0, 5)}:00-03:00`).toISOString();
}

export function hojeLocal(agora = new Date()) {
  return local(agora.toISOString()).data;
}

export function somarDias(data: string, n: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function diaSemana(data: string) {
  return new Date(`${data}T00:00:00Z`).getUTCDay();
}

/** Todos os dias de `de` a `ate` (inclusive). */
export function intervaloDias(de: string, ate: string) {
  const out: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) out.push(d);
  return out;
}

/** "2026-10" → primeiro e último dia. */
export function limitesMes(competencia: string) {
  const [a, m] = competencia.split("-").map(Number);
  const de = `${a}-${String(m).padStart(2, "0")}-01`;
  const ate = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  return { de, ate };
}

const minutosAbs = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

// ------------------------------------------------------------------------------------------------ previsto
/** Minutos previstos de um dia de jornada: saída − entrada (virando a noite se preciso) − intervalo. */
export function minutosPrevistos(h: Horarios | null, folga = false) {
  if (!h || folga) return 0;
  const e = hm(h.entrada);
  const s = hm(h.saida);
  if (e === null || s === null) return 0;
  let total = s - e;
  if (total <= 0) total += 1440;
  const ii = hm(h.intervalo_inicio);
  const fi = hm(h.intervalo_fim);
  if (ii !== null && fi !== null) {
    let intervalo = fi - ii;
    if (intervalo < 0) intervalo += 1440;
    total -= intervalo;
  }
  return Math.max(0, total);
}

/** Carga semanal média do modelo (para mostrar "44h semanais"). */
export function cargaSemanal(j: Pick<JornadaModelo, "tipo" | "ciclo_dias" | "dias">) {
  const soma = j.dias.reduce((s, d) => s + minutosPrevistos(d, d.folga), 0);
  if (j.tipo === "semanal") return soma;
  const ciclo = j.ciclo_dias ?? j.dias.length;
  return ciclo > 0 ? Math.round((soma / ciclo) * 7) : 0;
}

/** Dia do modelo que vale em `data`. */
export function diaDoModelo(j: JornadaModelo, data: string): DiaModelo | null {
  let pos: number;
  if (j.tipo === "semanal") pos = diaSemana(data);
  else {
    const ciclo = j.ciclo_dias ?? 0;
    if (!ciclo || !j.data_base) return null;
    pos = ((diasEntre(j.data_base, data) % ciclo) + ciclo) % ciclo;
  }
  return j.dias.find((d) => d.posicao === pos) ?? { posicao: pos, folga: true, entrada: null, intervalo_inicio: null, intervalo_fim: null, saida: null };
}

export function jornadaDoDia(ctx: ContextoFuncionario, data: string): JornadaModelo | null {
  const v = ctx.vinculos.find((x) => x.inicio <= data && (!x.fim || x.fim >= data));
  const id = v?.jornada_id ?? ctx.jornadaPadraoId;
  return (id && ctx.jornadas.get(id)) || null;
}

export type OrigemPrevisto = "jornada" | "escala" | "feriado" | "ausencia" | "sem_jornada" | "fora_contrato";

export type Previsto = {
  data: string;
  origem: OrigemPrevisto;
  folga: boolean;
  horarios: Horarios | null;
  minutos: number;
  tolerancia: number;
  jornada: string | null;
  feriado: string | null;
  ausencia: Ausencia | null;
  motivoEscala: string | null;
};

/** O que estava previsto para o funcionário no dia (escala do dia > feriado > jornada; ausência por cima de tudo). */
export function previstoDoDia(ctx: ContextoFuncionario, data: string): Previsto {
  const feriado = ctx.feriados.get(data) ?? null;
  const ausencia = ctx.ausencias.find((a) => a.inicio <= data && a.fim >= data) ?? null;
  const base = { data, feriado, ausencia, motivoEscala: null as string | null };
  if ((ctx.admissao && data < ctx.admissao) || (ctx.desligamento && data > ctx.desligamento)) {
    return { ...base, origem: "fora_contrato", folga: true, horarios: null, minutos: 0, tolerancia: 0, jornada: null };
  }
  const j = jornadaDoDia(ctx, data);
  const tolerancia = j?.tolerancia_min ?? 10;
  const prog = ctx.programacao.get(data);
  let origem: OrigemPrevisto;
  let horarios: Horarios | null;
  let folga: boolean;
  if (prog) {
    origem = "escala";
    folga = prog.folga;
    horarios = prog.folga ? null : prog;
    base.motivoEscala = prog.motivo;
  } else if (!j) {
    return { ...base, origem: ausencia ? "ausencia" : "sem_jornada", folga: true, horarios: null, minutos: 0, tolerancia, jornada: null };
  } else if (feriado) {
    origem = "feriado";
    folga = true;
    horarios = null;
  } else {
    const d = diaDoModelo(j, data);
    origem = "jornada";
    folga = !d || d.folga;
    horarios = folga ? null : d;
  }
  const minutos = minutosPrevistos(horarios, folga);
  if (ausencia && ausencia.tipo !== "folga_compensatoria") {
    // férias, atestado, abono…: nada a cumprir no dia (não é falta)
    return { ...base, origem: "ausencia", folga: true, horarios, minutos: 0, tolerancia, jornada: j?.nome ?? null };
  }
  return { ...base, origem, folga, horarios: horarios && { entrada: horarios.entrada, intervalo_inicio: horarios.intervalo_inicio, intervalo_fim: horarios.intervalo_fim, saida: horarios.saida }, minutos, tolerancia, jornada: j?.nome ?? null };
}

// ------------------------------------------------------------------------------------------------ marcações → dias
/**
 * Data de trabalho de cada marcação. Uma marcação que não é entrada continua no turno aberto (até 16h depois da
 * entrada), mesmo passando da meia-noite: entrada 22h + saída 6h = o dia da entrada.
 */
export function agruparPorDia(marcacoes: Marcacao[]): Map<string, Marcacao[]> {
  const validas = marcacoes.filter((m) => !m.anulada).sort((a, b) => a.momento.localeCompare(b.momento));
  const dias = new Map<string, Marcacao[]>();
  let turno: { data: string; inicio: number; ultimo: TipoMarcacao } | null = null;
  for (const m of validas) {
    const t = minutosAbs(m.momento);
    let data: string;
    if (turno && m.tipo !== "entrada" && turno.ultimo !== "saida" && t - turno.inicio <= 16 * 60) data = turno.data;
    else {
      data = local(m.momento).data;
      turno = { data, inicio: t, ultimo: m.tipo };
    }
    turno.ultimo = m.tipo;
    dias.set(data, [...(dias.get(data) ?? []), m]);
  }
  return dias;
}

// ------------------------------------------------------------------------------------------------ apuração
export type Ocorrencia = { codigo: string; texto: string; grave: boolean };

export type SituacaoDia =
  | "futuro"
  | "em_andamento"
  | "ok"
  | "extra"
  | "debito"
  | "falta"
  | "incompleto"
  | "folga"
  | "feriado"
  | "ausencia"
  | "compensacao"
  | "sem_jornada"
  | "fora_contrato";

export const SITUACAO_DIA_LABEL: Record<SituacaoDia, string> = {
  futuro: "—",
  em_andamento: "Em andamento",
  ok: "Normal",
  extra: "Hora extra",
  debito: "Débito",
  falta: "Falta",
  incompleto: "Incompleto",
  folga: "Folga",
  feriado: "Feriado",
  ausencia: "Ausência",
  compensacao: "Folga compensatória",
  sem_jornada: "Sem jornada",
  fora_contrato: "—",
};

export type ApuracaoDia = {
  data: string;
  previsto: Previsto;
  marcacoes: Marcacao[];
  trabalhado: number;
  intervalo: number;
  /** trabalhado − previsto depois da tolerância (o que vai para o banco) */
  saldo: number;
  extra: number;
  /** parte da extra a 100% (folga ou feriado trabalhado) */
  extra100: number;
  debito: number;
  atraso: number;
  saidaAntecipada: number;
  noturno: number;
  falta: boolean;
  situacao: SituacaoDia;
  ocorrencias: Ocorrencia[];
};

/** Minutos de [a, b) (minutos absolutos UTC) que caem entre 22h e 5h de Brasília. */
export function minutosNoturnos(a: number, b: number) {
  let total = 0;
  // percorre por blocos de dia local
  const off = FUSO_MIN;
  let ini = a;
  while (ini < b) {
    const localMin = ini + off;
    const diaIni = Math.floor(localMin / 1440) * 1440 - off; // 00:00 local em minutos absolutos
    const fimDia = Math.min(b, diaIni + 1440);
    // janelas noturnas do dia local: [00:00, 05:00) e [22:00, 24:00)
    for (const [x, y] of [
      [diaIni, diaIni + 300],
      [diaIni + 1320, diaIni + 1440],
    ]) {
      const s = Math.max(ini, x);
      const e = Math.min(fimDia, y);
      if (e > s) total += e - s;
    }
    ini = fimDia;
  }
  return total;
}

const ORDEM_ESPERADA: TipoMarcacao[][] = [
  ["entrada", "intervalo_fim"],
  ["intervalo_inicio", "saida"],
];

/**
 * Apura um dia. `hoje` (data local) separa o passado (falta conta) do dia em curso; `agora` conta o trecho aberto do
 * dia em curso (para o "Meu ponto").
 */
export function apurarDia(previsto: Previsto, marcacoesDoDia: Marcacao[], opcoes: { hoje: string; agora?: Date; ultimaDoDiaAnterior?: string | null }): ApuracaoDia {
  const ms = marcacoesDoDia.filter((m) => !m.anulada).sort((a, b) => a.momento.localeCompare(b.momento));
  const { data } = previsto;
  const passado = data < opcoes.hoje;
  const emCurso = data === opcoes.hoje;
  const ocorrencias: Ocorrencia[] = [];

  let trabalhado = 0;
  let intervalo = 0;
  let noturno = 0;
  for (let i = 0; i + 1 < ms.length; i += 2) {
    const a = minutosAbs(ms[i].momento);
    const b = minutosAbs(ms[i + 1].momento);
    trabalhado += b - a;
    noturno += minutosNoturnos(a, b);
    if (i + 2 < ms.length) intervalo += minutosAbs(ms[i + 2].momento) - b;
  }
  const impar = ms.length % 2 === 1;
  if (impar && emCurso && opcoes.agora) {
    const a = minutosAbs(ms[ms.length - 1].momento);
    const b = Math.floor(opcoes.agora.getTime() / 60_000);
    if (b > a) {
      trabalhado += b - a;
      noturno += minutosNoturnos(a, b);
    }
  }
  if (ms.some((m, i) => !ORDEM_ESPERADA[i % 2].includes(m.tipo))) {
    ocorrencias.push({ codigo: "sequencia", texto: "Marcações fora da sequência (entrada → intervalo → retorno → saída)", grave: false });
  }

  const p = previsto;
  const ausente = p.origem === "ausencia";
  const compensacao = p.ausencia?.tipo === "folga_compensatoria";
  let saldo = 0;
  let falta = false;
  let situacao: SituacaoDia;

  if (p.origem === "fora_contrato") situacao = "fora_contrato";
  else if (ausente) {
    situacao = "ausencia";
    if (ms.length) ocorrencias.push({ codigo: "marcou_ausente", texto: `Marcou ponto durante ${AUSENCIA_LABEL[p.ausencia!.tipo].toLowerCase()}`, grave: false });
  } else if (ms.length === 0) {
    if (compensacao) {
      saldo = passado ? -p.minutos : 0;
      situacao = passado ? "compensacao" : "futuro";
    } else if (p.minutos > 0 && passado) {
      falta = true;
      saldo = -p.minutos;
      situacao = "falta";
      ocorrencias.push({ codigo: "falta", texto: "Falta (nenhuma marcação no dia previsto)", grave: true });
    } else if (p.minutos > 0) situacao = emCurso ? "em_andamento" : "futuro";
    else situacao = p.origem === "sem_jornada" ? "sem_jornada" : p.origem === "feriado" ? "feriado" : "folga";
  } else if (impar && emCurso) {
    situacao = "em_andamento";
  } else if (impar) {
    situacao = "incompleto";
    ocorrencias.push({ codigo: "impar", texto: `Marcação faltando (${ms.length} no dia): peça o ajuste`, grave: true });
  } else if (p.origem === "sem_jornada") {
    situacao = "sem_jornada";
    ocorrencias.push({ codigo: "sem_jornada", texto: "Trabalhou sem jornada definida: defina a jornada para apurar o saldo", grave: false });
  } else {
    const diff = trabalhado - p.minutos;
    saldo = Math.abs(diff) <= p.tolerancia ? 0 : diff;
    situacao = saldo > 0 ? "extra" : saldo < 0 ? "debito" : "ok";
    if (compensacao) situacao = "compensacao";
  }

  // atraso e saída antecipada (informativos)
  let atraso = 0;
  let saidaAntecipada = 0;
  if (p.horarios && ms.length && !ausente) {
    const ent = hm(p.horarios.entrada);
    const sai = hm(p.horarios.saida);
    const primeira = local(ms[0].momento);
    if (ent !== null && primeira.data === data) {
      const d = primeira.min - ent;
      if (d > TOLERANCIA_MARCACAO && d < 12 * 60) {
        atraso = d;
        ocorrencias.push({ codigo: "atraso", texto: `Atraso de ${duracao(d)} na entrada`, grave: false });
      }
    }
    if (sai !== null && !impar && ms.length >= 2) {
      const ultima = local(ms[ms.length - 1].momento);
      const fimPrev = ent !== null && sai < ent ? sai + 1440 : sai;
      const fimReal = ultima.min + (ultima.data > data ? 1440 : 0);
      const d = fimPrev - fimReal;
      if (d > TOLERANCIA_MARCACAO && d < 12 * 60) {
        saidaAntecipada = d;
        ocorrencias.push({ codigo: "saida_antecipada", texto: `Saída ${duracao(d)} antes do previsto`, grave: false });
      }
    }
  }

  // intervalo, limite diário, interjornada
  if (!impar && ms.length >= 2) {
    if (trabalhado > 360 && ms.length === 2) ocorrencias.push({ codigo: "sem_intervalo", texto: "Mais de 6h sem intervalo registrado", grave: true });
    else if (trabalhado > 360 && intervalo < 60 - TOLERANCIA_MARCACAO) ocorrencias.push({ codigo: "intervalo_curto", texto: `Intervalo de ${duracao(intervalo)} (mínimo 1:00)`, grave: true });
    if (trabalhado > 600) ocorrencias.push({ codigo: "mais_10h", texto: `${duracao(trabalhado)} trabalhadas no dia (limite de 2h extras)`, grave: true });
  }
  if (opcoes.ultimaDoDiaAnterior && ms.length) {
    const gap = minutosAbs(ms[0].momento) - minutosAbs(opcoes.ultimaDoDiaAnterior);
    if (gap >= 0 && gap < 11 * 60) ocorrencias.push({ codigo: "interjornada", texto: `Descanso de ${duracao(gap)} entre jornadas (mínimo 11:00)`, grave: true });
  }

  const extra = Math.max(0, saldo);
  const debito = Math.max(0, -saldo);
  const extra100 = p.folga ? extra : 0;
  return { data, previsto: p, marcacoes: ms, trabalhado, intervalo, saldo, extra, extra100, debito, atraso, saidaAntecipada, noturno, falta, situacao, ocorrencias };
}

export type TotaisPeriodo = {
  previsto: number;
  trabalhado: number;
  saldo: number;
  extra: number;
  extra100: number;
  debito: number;
  noturno: number;
  faltas: number;
  atrasos: number;
  minutosAtraso: number;
  diasTrabalhados: number;
  incompletos: number;
  inconsistencias: number;
};

export function somarTotais(dias: ApuracaoDia[]): TotaisPeriodo {
  const t: TotaisPeriodo = { previsto: 0, trabalhado: 0, saldo: 0, extra: 0, extra100: 0, debito: 0, noturno: 0, faltas: 0, atrasos: 0, minutosAtraso: 0, diasTrabalhados: 0, incompletos: 0, inconsistencias: 0 };
  for (const d of dias) {
    if (d.situacao === "futuro" || d.situacao === "fora_contrato") continue;
    t.previsto += d.situacao === "em_andamento" ? 0 : d.previsto.minutos;
    t.trabalhado += d.trabalhado;
    t.saldo += d.saldo;
    t.extra += d.extra;
    t.extra100 += d.extra100;
    t.debito += d.debito;
    t.noturno += d.noturno;
    if (d.falta) t.faltas++;
    if (d.atraso) {
      t.atrasos++;
      t.minutosAtraso += d.atraso;
    }
    if (d.marcacoes.length) t.diasTrabalhados++;
    if (d.situacao === "incompleto") t.incompletos++;
    if (d.ocorrencias.some((o) => o.grave)) t.inconsistencias++;
  }
  return t;
}

/** Apura `de`…`ate` de um funcionário. Marcações podem vir de um intervalo maior (o dia anterior serve à interjornada). */
export function apurarPeriodo(ctx: ContextoFuncionario, marcacoes: Marcacao[], de: string, ate: string, opcoes: { hoje: string; agora?: Date }) {
  const porDia = agruparPorDia(marcacoes);
  const dias: ApuracaoDia[] = [];
  let ultimaAnterior: string | null = null;
  const anterior = porDia.get(somarDias(de, -1));
  if (anterior?.length) ultimaAnterior = anterior[anterior.length - 1].momento;
  for (const data of intervaloDias(de, ate)) {
    const ms = porDia.get(data) ?? [];
    const dia = apurarDia(previstoDoDia(ctx, data), ms, { ...opcoes, ultimaDoDiaAnterior: ultimaAnterior });
    dias.push(dia);
    ultimaAnterior = ms.length ? ms[ms.length - 1].momento : null;
  }
  return { dias, totais: somarTotais(dias) };
}

/** Próxima marcação esperada do dia, pela quantidade já feita. */
export function proximoTipo(qtdNoDia: number): TipoMarcacao {
  return TIPOS_MARCACAO[qtdNoDia % 4];
}
