// Motor da escala 5x2: distribui as folgas da equipe nos dias permitidos, monta os turnos de cada dia, mede a cobertura
// por faixa de uma hora (farmacêutico presente em todo o horário da loja) e audita jornada, intervalo e descanso.
// Funções puras (sem banco): rodam no servidor e no navegador.

export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
export type Dia = (typeof DIAS)[number];
export const ROTULO_DIA: Record<Dia, string> = { dom: "dom", seg: "seg", ter: "ter", qua: "qua", qui: "qui", sex: "sex", sab: "sáb" };
export const NOME_DIA: Record<Dia, string> = { dom: "domingo", seg: "segunda-feira", ter: "terça-feira", qua: "quarta-feira", qui: "quinta-feira", sex: "sexta-feira", sab: "sábado" };

export const FUNCOES = ["farmaceutico", "atendente", "caixa", "gerente", "gerente_farmaceutico", "estoquista", "motorista", "auditor", "servicos_gerais", "outros"] as const;
export type Funcao = (typeof FUNCOES)[number];
export const ROTULO_FUNCAO: Record<Funcao, string> = {
  farmaceutico: "Farmacêutico",
  atendente: "Atendente",
  caixa: "Caixa",
  gerente: "Gerente",
  gerente_farmaceutico: "Gerente farmacêutico",
  estoquista: "Estoquista",
  motorista: "Motorista",
  auditor: "Auditor",
  servicos_gerais: "Serviços gerais",
  outros: "Outros",
};
const PLURAL_FUNCAO: Record<Funcao, string> = {
  farmaceutico: "farmacêuticos",
  atendente: "atendentes",
  caixa: "caixas",
  gerente: "gerentes",
  gerente_farmaceutico: "gerentes farmacêuticos",
  estoquista: "estoquistas",
  motorista: "motoristas",
  auditor: "auditores",
  servicos_gerais: "serviços gerais",
  outros: "outros",
};
export const ehFuncao = (v: unknown): v is Funcao => typeof v === "string" && (FUNCOES as readonly string[]).includes(v);
/** Função que conta na cobertura: o gerente farmacêutico cobre a farmácia como farmacêutico. */
export const funcaoNaCobertura = (f: Funcao): Funcao => (f === "gerente_farmaceutico" ? "farmaceutico" : f);
export const contaComoFarmaceutico = (f: string | null | undefined) => f === "farmaceutico" || f === "gerente_farmaceutico";

export const SITUACOES = ["ativo", "afastado", "inativo"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const ROTULO_SITUACAO: Record<Situacao, string> = { ativo: "Ativo", afastado: "Afastado", inativo: "Inativo" };
export const ehSituacao = (v: unknown): v is Situacao => typeof v === "string" && (SITUACOES as readonly string[]).includes(v);

/** Regime da pessoa: 5x2 (cinco dias e duas folgas na semana) ou 12x36 (um dia sim, um dia não, 12 horas corridas). */
export const REGIMES = ["5x2", "12x36"] as const;
export type Regime = (typeof REGIMES)[number];
export const ehRegime = (v: unknown): v is Regime => typeof v === "string" && (REGIMES as readonly string[]).includes(v);
export const eh12x36 = (p: { regime?: string | null }) => p.regime === "12x36";
/** Turno do 12x36: 12 horas da entrada à saída, com o intervalo dentro. */
const MINUTOS_12X36 = 720;

/** Horário de um dia. `null` = loja fechada; abre/fecha vazios = aberta, mas com o horário ainda não informado. */
export type Faixa = { abre: string; fecha: string } | null;

export type ConfigFilial = {
  branchId: string;
  codigo: string;
  nome: string;
  horarios: Record<Dia, Faixa>;
  minimos: Partial<Record<Funcao, number>>;
  acordoJornadaEstendida: boolean;
  folgasPermitidas: number[];
};

export type Colaborador = {
  id: string;
  nome: string;
  funcao: Funcao;
  situacao: Situacao;
  horasDia: number | null;
  intervaloMin: number;
  registro?: string | null;
  /** Ausente nas escalas antigas = 5x2. */
  regime?: Regime;
};

export type StatusTurno = "trabalho" | "folga" | "fechado" | "afastamento" | "inativo";
export type Turno = {
  data: number;
  dia: Dia;
  status: StatusTurno;
  horas: number;
  inicio?: string;
  fim?: string;
  intervaloInicio?: string;
  intervaloFim?: string;
  intervaloMin?: number;
  /** Ajuste manual feito na tela. */
  ajustado?: boolean;
  /** Horas do dia antes do primeiro ajuste (para a média semanal). */
  horasBase?: number;
};
export type PessoaEscala = Colaborador & { turnos: Turno[]; totalHoras: number; mediaSemanal: number; excedente: number };
export type FaixaCobertura = { hora: string; porFuncao: Partial<Record<Funcao, number>> };
export type DiaCobertura = { data: number; dia: Dia; aberto: boolean; porFuncao: Partial<Record<Funcao, number>>; total: number; faixas: FaixaCobertura[] };
export type Alerta = {
  severidade: "alta" | "media";
  mensagem: string;
  data?: number;
  funcao?: Funcao;
  pessoaId?: string;
  faixas?: string[];
  sugestoes?: string[];
};

export type Analise = {
  anteriores: number;
  atuais: number;
  resolvidas: number;
  continuam: number;
  novas: number;
  temReferencia: boolean;
  tinhaAjustes: boolean;
  mudancas: { mensagem: string; antes: number; agora: number }[];
};

/** Uma opção de escala do período (o que fica gravado em esc_simulacoes). */
export type Escala = {
  /** competência: o período vai do dia 21 do mês anterior ao dia 20 deste mês (ver `diasDoPeriodo`) */
  ano: number;
  mes: number;
  /** 1º dia do período (AAAA-MM-DD). Ausente nas opções antigas, que eram do mês civil. */
  inicio?: string | null;
  /** Último dia, só no período escolhido pelo RH (de um dia até outro). Ausente = período da folha (até o dia 20). */
  fim?: string | null;
  jornadaSemanal: number;
  folgasPermitidas: number[];
  equipe: PessoaEscala[];
  cobertura: DiaCobertura[];
  alertas: Alerta[];
  alertasBase?: Alerta[] | null;
  analise?: Analise | null;
  analisePendente?: boolean;
};

// ---------------------------------------------------------------------------------------------------------------
// Relógio e calendário
// ---------------------------------------------------------------------------------------------------------------

export const horaValida = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function minutos(hora: string) {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + m;
}
export function hora(min: number) {
  const t = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
export const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const diaDaSemana = (ano: number, mes: number, data: number) => new Date(Date.UTC(ano, mes - 1, data)).getUTCDay();
export const diaChave = (ano: number, mes: number, data: number): Dia => DIAS[diaDaSemana(ano, mes, data)];
// ---------------------------------------------------------------------------------------------------------------
// Período da escala
// ---------------------------------------------------------------------------------------------------------------
// As escalas seguem o período da folha: do dia 21 do mês anterior ao dia 20 do mês (competência = mês do dia 20).
// As opções antigas (sem `inicio`) eram do mês civil e continuam assim. Em qualquer caso `data` é o dia do mês e não
// se repete dentro do período (21…31 de um mês e 1…20 do outro); a ordem e a semana vêm de `diasDoPeriodo`.

export type PeriodoEscala = { ano: number; mes: number; inicio?: string | null; fim?: string | null };
export type DiaPeriodo = { data: number; ano: number; mes: number; iso: string; dia: Dia; pos: number };

const isoUTC = (d: Date) => d.toISOString().slice(0, 10);
/** 1º dia do período da competência (dia 21 do mês anterior). */
export const inicioFolha = (ano: number, mes: number) => isoUTC(new Date(Date.UTC(ano, mes - 2, 21)));

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** O mesmo dia do mês seguinte (31/01 → 28/02): o período escolhido termina antes dele, para o dia do mês não se repetir. */
const mesmoDiaMesSeguinte = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  return isoUTC(new Date(Date.UTC(a, m, Math.min(d, new Date(Date.UTC(a, m + 1, 0)).getUTCDate()))));
};
/** Competência do período escolhido: o mês do último dia. */
export const competenciaDoFim = (fim: string) => ({ ano: Number(fim.slice(0, 4)), mes: Number(fim.slice(5, 7)) });
/** Último dia que o período escolhido pode ter (inclusive), começando em `inicio`. */
export const fimMaximo = (inicio: string) => isoUTC(new Date(Date.parse(`${mesmoDiaMesSeguinte(inicio)}T00:00:00Z`) - 86_400_000));
/** Quantos dias tem o período escolhido. */
export const diasEntre = (inicio: string, fim: string) => Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86_400_000) + 1;
export const MIN_DIAS_PERIODO = 7;
/** Erro do período escolhido pelo RH (de … até …), ou null se serve. */
export function erroPeriodoLivre(inicio: string, fim: string): string | null {
  if (!DATA_ISO.test(inicio) || Number.isNaN(Date.parse(`${inicio}T00:00:00Z`))) return "Escolha o primeiro dia.";
  if (!DATA_ISO.test(fim) || Number.isNaN(Date.parse(`${fim}T00:00:00Z`))) return "Escolha o último dia.";
  const ano = Number(inicio.slice(0, 4));
  if (ano < 2024 || ano > 2035) return "Escolha um período entre 2024 e 2035.";
  if (fim < inicio) return "O último dia não pode ser antes do primeiro.";
  if (diasEntre(inicio, fim) < MIN_DIAS_PERIODO) return `O período precisa ter pelo menos ${MIN_DIAS_PERIODO} dias.`;
  if (fim > fimMaximo(inicio)) return `O período vai até 1 mês: começando em ${inicio.split("-").reverse().join("/")}, o último dia pode ser ${fimMaximo(inicio).split("-").reverse().join("/")}.`;
  return null;
}
/** O período tem pelo menos uma semana inteira (segunda a domingo)? Sem ela não dá para a escala seguir nos próximos meses. */
export const temSemanaCompleta = (p: PeriodoEscala) => {
  const contagem = new Map<number, number>();
  for (const d of diasDoPeriodo(p)) {
    const s = semanaDoPeriodo(p, d.data);
    contagem.set(s, (contagem.get(s) ?? 0) + 1);
  }
  return [...contagem.values()].some((n) => n === 7);
};

const cachePeriodo = new Map<string, DiaPeriodo[]>();
/** Dias do período em ordem (não altere o que volta: é compartilhado). */
export function diasDoPeriodo(p: PeriodoEscala): DiaPeriodo[] {
  const chave = `${p.ano}-${p.mes}-${p.inicio ?? ""}-${p.fim ?? ""}`;
  const pronto = cachePeriodo.get(chave);
  if (pronto) return pronto;
  const ini = p.inicio ? new Date(`${p.inicio.slice(0, 10)}T00:00:00Z`) : new Date(Date.UTC(p.ano, p.mes - 1, 1));
  // período escolhido: até `fim`; período da folha: até o dia 20; antigas: até o fim do mês
  const fim = p.inicio && p.fim ? new Date(`${p.fim.slice(0, 10)}T00:00:00Z`) : p.inicio ? new Date(Date.UTC(p.ano, p.mes - 1, 20)) : new Date(Date.UTC(p.ano, p.mes, 0));
  const dias: DiaPeriodo[] = [];
  for (const d = new Date(ini); d <= fim && dias.length < 62; d.setUTCDate(d.getUTCDate() + 1)) {
    dias.push({ data: d.getUTCDate(), ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, iso: isoUTC(d), dia: DIAS[d.getUTCDay()], pos: dias.length });
  }
  cachePeriodo.set(chave, dias);
  return dias;
}
const diaDoPeriodo = (p: PeriodoEscala, data: number) => diasDoPeriodo(p).find((d) => d.data === data);
/** Posição do dia no período (0 = primeiro dia). */
export const posicaoNoPeriodo = (p: PeriodoEscala, data: number) => diaDoPeriodo(p, data)?.pos ?? data - 1;
/** Semanas começam na segunda: quantos dias do 1º dia até a segunda daquela semana. */
const deslocamentoPeriodo = (p: PeriodoEscala) => {
  const d = diasDoPeriodo(p)[0];
  return d ? (DIAS.indexOf(d.dia) + 6) % 7 : 0;
};
/** Semana do período (0 = a semana do 1º dia), começando na segunda. */
export const semanaDoPeriodo = (p: PeriodoEscala, data: number) => Math.floor((posicaoNoPeriodo(p, data) + deslocamentoPeriodo(p)) / 7);
export const semanasDoPeriodo = (p: PeriodoEscala) => Math.ceil((diasDoPeriodo(p).length + deslocamentoPeriodo(p)) / 7);
/** "21/11" (com o mês certo do dia dentro do período). */
export const rotuloData = (p: PeriodoEscala, data: number) => `${String(data).padStart(2, "0")}/${String(diaDoPeriodo(p, data)?.mes ?? p.mes).padStart(2, "0")}`;
/** "21/11/2026 a 20/12/2026". */
export function rotuloPeriodo(p: PeriodoEscala) {
  const ds = diasDoPeriodo(p);
  const f = (d: DiaPeriodo) => `${String(d.data).padStart(2, "0")}/${String(d.mes).padStart(2, "0")}/${d.ano}`;
  return ds.length ? `${f(ds[0])} a ${f(ds[ds.length - 1])}` : "";
}
/** Ordena números de dia na ordem do período (21…31, 1…20). */
export const ordenarDatas = (p: PeriodoEscala, datas: number[]) => [...datas].sort((a, b) => posicaoNoPeriodo(p, a) - posicaoNoPeriodo(p, b));

export const aberto = (cfg: ConfigFilial, dia: Dia) => cfg.horarios[dia] !== null;
const faixaDoDia = (cfg: ConfigFilial, dia: Dia) => {
  const f = cfg.horarios[dia];
  return f && horaValida(f.abre) && horaValida(f.fecha) && minutos(f.fecha) > minutos(f.abre) ? f : null;
};
export const horasAbertas = (cfg: ConfigFilial, dia: Dia) => {
  const f = faixaDoDia(cfg, dia);
  return f ? (minutos(f.fecha) - minutos(f.abre)) / 60 : 0;
};
export const diasAbertos = (cfg: ConfigFilial) => DIAS.map((_, i) => i).filter((i) => aberto(cfg, DIAS[i]));
const naEscala = (p: { situacao: Situacao }) => p.situacao === "ativo";

/** Horas trabalhadas no dia: 12x36 = 12 h corridas menos o intervalo; 5x2 = horas da pessoa ou jornada ÷ 5. */
export const horasDoTurno = (p: Pick<Colaborador, "horasDia" | "intervaloMin" | "regime">, horasPadrao: number) =>
  eh12x36(p) ? Math.max(1, (MINUTOS_12X36 - Number(p.intervaloMin ?? 60)) / 60) : Number(p.horasDia || horasPadrao);
/** Dias corridos desde 01/01/1970: o revezamento do 12x36 segue de um período para o outro sem quebrar. */
const diaCorrido = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

/** Limite semanal pela transição da EC 141/2026: 44 h até nov/2026, 42 h de dez/2026 a nov/2027 e 40 h a partir de dez/2027. */
export function limiteSemanal(ano: number, mes: number) {
  if (ano > 2027 || (ano === 2027 && mes >= 12)) return 40;
  if (ano > 2026 || (ano === 2026 && mes >= 12)) return 42;
  return 44;
}

/** Valida os dias de folga escolhidos para a filial (o mesmo teste antes de gerar). */
export function erroFolgas(cfg: ConfigFilial, folgas: number[]): string | null {
  const abertos = diasAbertos(cfg);
  const usaveis = folgas.filter((d) => abertos.includes(d)).length;
  if (abertos.length === 7 && usaveis < 2) return `${cfg.codigo} abre todos os dias: marque pelo menos dois dias abertos para as duas folgas da semana.`;
  if (abertos.length === 6 && usaveis < 1) return `${cfg.codigo}: marque pelo menos um dia em que a loja abre para a folga da semana.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Geração das opções
// ---------------------------------------------------------------------------------------------------------------

type Pessoa = Colaborador;

/** Quem do 12x36 está fora em cada dia da semana (0 = domingo): as folgas do 5x2 evitam esses dias. */
type Ausentes12x36 = { total: Map<number, number>; farm: Map<number, number>; farmNoRegime: number };

function distribuirFolgas(equipe: Pessoa[], abertos: number[], opcao: number, semana: number, candidatos: number[], ausentes?: Ausentes12x36) {
  const folgas = new Map<string, number[]>();
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const fechados = todos.filter((d) => !abertos.includes(d));
  // terça, quarta e quinta primeiro; sábado e domingo depois; segunda e sexta (dias de venda) por último
  const penalidade = (d: number) => ([2, 3, 4].includes(d) ? 0 : [0, 6].includes(d) ? 0.5 : 1.5);
  const total = new Map(todos.map((d) => [d, ausentes?.total.get(d) ?? 0]));
  const farm = new Map(todos.map((d) => [d, ausentes?.farm.get(d) ?? 0]));
  // o 12x36 não entra no rodízio de folgas: trabalha um dia sim, um dia não
  const ativos = equipe
    .map((pessoa, indice) => ({ pessoa, indice }))
    .filter(({ pessoa }) => naEscala(pessoa) && !eh12x36(pessoa))
    .sort((a, b) => Number(contaComoFarmaceutico(b.pessoa.funcao)) - Number(contaComoFarmaceutico(a.pessoa.funcao)) || a.indice - b.indice);
  const qtdFarm = ativos.filter(({ pessoa }) => contaComoFarmaceutico(pessoa.funcao)).length + (ausentes?.farmNoRegime ?? 0);
  const marcar = (p: Pessoa, dias: number[]) => {
    folgas.set(p.id, dias);
    for (const d of dias) {
      total.set(d, (total.get(d) ?? 0) + 1);
      if (contaComoFarmaceutico(p.funcao)) farm.set(d, (farm.get(d) ?? 0) + 1);
    }
  };
  const escolher = <T>(itens: T[], notas: number[], indice: number) => {
    const melhor = Math.min(...notas);
    const empatados = itens.filter((_, i) => notas[i] === melhor);
    return empatados[(indice + opcao + semana) % empatados.length];
  };
  const umDia = (p: Pessoa, indice: number) => {
    if (contaComoFarmaceutico(p.funcao) && qtdFarm >= 2) return escolher(candidatos, candidatos.map((d) => penalidade(d) * 2 + (farm.get(d) ?? 0) * 100 + (total.get(d) ?? 0) * 0.1), indice);
    return escolher(
      candidatos,
      candidatos.map((d) => penalidade(d) * 2 + (total.get(d) ?? 0) + (contaComoFarmaceutico(p.funcao) ? 3 : 1) * (farm.get(d) ?? 0)),
      indice,
    );
  };

  if (abertos.length <= 5) {
    // a loja já fecha dois dias (ou mais): as folgas caem nos dias fechados
    for (const { pessoa } of ativos) marcar(pessoa, [...fechados]);
  } else if (abertos.length === 6) {
    for (const { pessoa, indice } of ativos) marcar(pessoa, [fechados[0], umDia(pessoa, indice)]);
  } else {
    const pares = candidatos.flatMap((d, i) => candidatos.slice(i + 1).map((o) => [d, o]));
    for (const { pessoa, indice } of ativos) {
      if (contaComoFarmaceutico(pessoa.funcao)) {
        const notas =
          qtdFarm < 2
            ? pares.map((par) => par.reduce((s, d) => s + penalidade(d) * 2, 0))
            : pares.map((par) => par.reduce((s, d) => s + penalidade(d) * 2 + (farm.get(d) ?? 0) * 100 + (total.get(d) ?? 0) * 0.1, 0));
        marcar(pessoa, escolher(pares, notas, indice));
      } else {
        marcar(pessoa, escolher(pares, pares.map((par) => par.reduce((s, d) => s + penalidade(d) * 2 + (total.get(d) ?? 0) + 3 * (farm.get(d) ?? 0), 0)), indice));
      }
    }
  }
  for (const p of equipe) if (!folgas.has(p.id)) folgas.set(p.id, [...fechados]);
  return folgas;
}

/** Gera as opções de escala do mês para a filial. Lança erro com a explicação quando os dias de folga não fecham. */
export function gerarOpcoes(
  cfg: ConfigFilial,
  equipe: Colaborador[],
  {
    ano,
    mes,
    jornadaSemanal = 40,
    opcoes = 3,
    folgasPermitidas,
    inicio,
    fim,
  }: { ano: number; mes: number; jornadaSemanal?: number; opcoes?: number; folgasPermitidas?: number[]; /** período escolhido (de … até …) */ inicio?: string; fim?: string },
): Escala[] {
  const abertos = diasAbertos(cfg);
  const escolhidas = [...new Set((folgasPermitidas ?? cfg.folgasPermitidas).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const candidatos = escolhidas.filter((d) => abertos.includes(d));
  const erro = erroFolgas(cfg, escolhidas);
  if (erro) throw new Error(erro);
  const horasPadrao = jornadaSemanal / 5;
  // período escolhido pelo RH (de … até …) ou o da folha: do dia 21 do mês anterior ao dia 20 da competência
  if (inicio && fim) {
    const erroPeriodo = erroPeriodoLivre(inicio, fim);
    if (erroPeriodo) throw new Error(erroPeriodo);
  }
  const periodo: PeriodoEscala = inicio && fim ? { ano, mes, inicio, fim } : { ano, mes, inicio: inicioFolha(ano, mes) };
  const nSemanas = semanasDoPeriodo(periodo);
  const resultado: Escala[] = [];
  // 12x36: quem é da mesma função se reveza (um trabalha no dia em que o outro está fora); cada opção troca os dias
  const doze = equipe.filter((p) => naEscala(p) && eh12x36(p));
  const fase = new Map<string, number>();
  const porFuncao12 = new Map<Funcao, number>();
  for (const p of doze) {
    const f = funcaoNaCobertura(p.funcao);
    fase.set(p.id, porFuncao12.get(f) ?? 0);
    porFuncao12.set(f, (porFuncao12.get(f) ?? 0) + 1);
  }
  const farmNoRegime = doze.filter((p) => contaComoFarmaceutico(p.funcao)).length;

  for (let opcao = 0; opcao < opcoes; opcao += 1) {
    const trabalha12 = (p: Pessoa, iso: string) => (diaCorrido(iso) + (fase.get(p.id) ?? 0) + opcao) % 2 === 0;
    const ausentesDaSemana = (s: number): Ausentes12x36 => {
      const a: Ausentes12x36 = { total: new Map(), farm: new Map(), farmNoRegime };
      for (const d of diasDoPeriodo(periodo)) {
        if (semanaDoPeriodo(periodo, d.data) !== s) continue;
        const i = DIAS.indexOf(d.dia);
        for (const p of doze) {
          if (trabalha12(p, d.iso)) continue;
          a.total.set(i, (a.total.get(i) ?? 0) + 1);
          if (contaComoFarmaceutico(p.funcao)) a.farm.set(i, (a.farm.get(i) ?? 0) + 1);
        }
      }
      return a;
    };
    const folgasSemana = new Map(Array.from({ length: nSemanas }, (_, s) => [s, distribuirFolgas(equipe, abertos, opcao, s, candidatos, doze.length ? ausentesDaSemana(s) : undefined)]));
    const pessoas: PessoaEscala[] = equipe.map((p) => ({ ...p, turnos: [], totalHoras: 0, mediaSemanal: 0, excedente: 0 }));
    const cobertura: DiaCobertura[] = [];

    for (const { data, dia, iso } of diasDoPeriodo(periodo)) {
      const indiceDia = DIAS.indexOf(dia);
      const semana = semanaDoPeriodo(periodo, data);
      const abre = aberto(cfg, dia);
      const faixa = faixaDoDia(cfg, dia);
      const trabalhando = pessoas.filter((p) => naEscala(p) && abre && (eh12x36(p) ? trabalha12(p, iso) : !(folgasSemana.get(semana)?.get(p.id) ?? []).includes(indiceDia)));

      for (const p of trabalhando) {
        const duracao = horasDoTurno(p, horasPadrao);
        const intervalo = Number(p.intervaloMin ?? 60);
        // o 12x36 vem primeiro: entra na abertura todo dia (horário fixo); o 5x2 escalona depois dele
        const mesmaFuncao = trabalhando.filter((c) => funcaoNaCobertura(c.funcao) === funcaoNaCobertura(p.funcao)).sort((a, b) => Number(eh12x36(b)) - Number(eh12x36(a)));
        const posicao = mesmaFuncao.findIndex((c) => c.id === p.id);
        const turno: Turno = { data, dia, status: "trabalho", horas: duracao, intervaloMin: intervalo, inicio: "", fim: "", intervaloInicio: "", intervaloFim: "" };
        if (faixa) {
          // entradas escalonadas entre a abertura e a última entrada que ainda cobre o fechamento
          const turnos = mesmaFuncao.map((c, i) => {
            const dur = horasDoTurno(c, horasPadrao);
            const int = Number(c.intervaloMin ?? 60);
            const ultima = Math.max(minutos(faixa.abre), minutos(faixa.fecha) - (dur * 60 + int));
            const ini = mesmaFuncao.length > 1 ? minutos(faixa.abre) + Math.round(((ultima - minutos(faixa.abre)) * i) / (mesmaFuncao.length - 1)) : minutos(faixa.abre);
            return { ini, fim: ini + dur * 60 + int, int };
          });
          const ini = turnos[posicao].ini;
          turno.inicio = hora(ini);
          turno.fim = hora(ini + duracao * 60 + intervalo);
          let almoco: number | null = null;
          if (mesmaFuncao.length > 1) {
            // almoços em fila dentro do período em que todos estão na loja
            const juntosDe = Math.max(...turnos.map((t) => t.ini));
            const juntosAte = Math.min(...turnos.map((t) => t.fim));
            const livre = juntosAte - juntosDe - turnos.reduce((s, t) => s + t.int, 0);
            if (livre >= 0) {
              const espaco = livre / (mesmaFuncao.length + 1);
              const antes = turnos.slice(0, posicao).reduce((s, t) => s + t.int, 0);
              almoco = juntosDe + Math.round(espaco * (posicao + 1) + antes);
            }
          }
          if (almoco === null) almoco = ini + Math.min(duracao * 60 - intervalo, Math.min(240, Math.floor(duracao * 30)));
          if (intervalo > 0) {
            turno.intervaloInicio = hora(almoco);
            turno.intervaloFim = hora(almoco + intervalo);
          }
        }
        p.turnos.push(turno);
      }
      for (const p of pessoas.filter((x) => !trabalhando.includes(x))) {
        const deFolga = eh12x36(p) || (folgasSemana.get(semana)?.get(p.id) ?? []).includes(indiceDia);
        const status: StatusTurno = p.situacao === "afastado" ? "afastamento" : p.situacao === "inativo" ? "inativo" : deFolga && abre ? "folga" : "fechado";
        p.turnos.push({ data, dia, status, horas: 0 });
      }
      cobertura.push(coberturaDoDia(cfg, data, dia, pessoas));
    }
    for (const p of pessoas) resumirPessoa(p, jornadaSemanal, nSemanas);
    const escala: Escala = { ano, mes, inicio: periodo.inicio, fim: periodo.fim ?? null, jornadaSemanal, folgasPermitidas: escolhidas, equipe: pessoas, cobertura, alertas: [] };
    escala.alertas = auditar(cfg, escala);
    escala.alertasBase = structuredClone(escala.alertas);
    resultado.push(escala);
  }
  return resultado;
}

function coberturaDoDia(cfg: ConfigFilial, data: number, dia: Dia, pessoas: PessoaEscala[]): DiaCobertura {
  const abre = aberto(cfg, dia);
  const faixa = faixaDoDia(cfg, dia);
  const trabalhando = pessoas.filter((p) => naEscala(p)).map((p) => ({ p, t: p.turnos.find((t) => t.data === data) })).filter(({ t }) => t?.status === "trabalho");
  const porFuncao: Partial<Record<Funcao, number>> = {};
  for (const { p } of trabalhando) {
    const f = funcaoNaCobertura(p.funcao);
    porFuncao[f] = (porFuncao[f] ?? 0) + 1;
  }
  const faixas: FaixaCobertura[] = [];
  if (abre && faixa) {
    for (let m = minutos(faixa.abre); m < minutos(faixa.fecha); m += 60) {
      const presentes: Partial<Record<Funcao, number>> = {};
      for (const { p, t } of trabalhando) {
        if (!t?.inicio || !t.fim) continue;
        const almocoDe = t.intervaloInicio ? minutos(t.intervaloInicio) : -1;
        const almocoAte = t.intervaloInicio ? almocoDe + Number(t.intervaloMin ?? 0) : -1;
        const cobre = minutos(t.inicio) <= m && minutos(t.fim) >= m + 60 && !(almocoDe < m + 60 && almocoAte > m);
        const f = funcaoNaCobertura(p.funcao);
        if (cobre) presentes[f] = (presentes[f] ?? 0) + 1;
      }
      faixas.push({ hora: hora(m), porFuncao: presentes });
    }
  }
  return { data, dia, aberto: abre, porFuncao, total: trabalhando.length, faixas };
}

function resumirPessoa(p: PessoaEscala, jornadaSemanal: number, nSemanas: number) {
  const horasDia = Number(p.horasDia || jornadaSemanal / 5);
  p.totalHoras = Number(p.turnos.reduce((s, t) => s + (t.status === "trabalho" ? Number(t.horas || 0) : 0), 0).toFixed(1));
  if (eh12x36(p)) {
    // 12x36: média pelas horas do período; o próprio regime compensa as horas (CLT art. 59-A), sem excedente semanal
    p.mediaSemanal = naEscala(p) ? Number(((p.totalHoras * 7) / Math.max(p.turnos.length, 1)).toFixed(1)) : 0;
    p.excedente = 0;
    return;
  }
  // um ciclo completo tem cinco dias de trabalho: a primeira e a última semana do mês (parciais) não viram hora extra
  const ajuste = p.turnos.filter((t) => t.ajustado).reduce((s, t) => s + Number(t.horas || 0) - Number(t.horasBase ?? 0), 0);
  p.mediaSemanal = naEscala(p) ? Number((horasDia * 5 + ajuste / Math.max(nSemanas, 1)).toFixed(1)) : 0;
  p.excedente = Math.max(0, Number((p.mediaSemanal - jornadaSemanal).toFixed(1)));
}

// ---------------------------------------------------------------------------------------------------------------
// Ajustes e reanálise
// ---------------------------------------------------------------------------------------------------------------

export type AjusteTurno = { pessoaId: string; data: number; status: "trabalho" | "folga"; inicio?: string; fim?: string; intervaloInicio?: string; intervaloFim?: string };

type HorarioTurno = Pick<Turno, "status" | "inicio" | "fim">;

/** Mesmo horário de trabalho (mesma entrada e mesma saída) em dois dias. O almoço pode variar: o motor reveza. */
export function mesmoHorario(a: HorarioTurno, b: HorarioTurno) {
  return a.status === "trabalho" && b.status === "trabalho" && !!a.inicio && a.inicio === b.inicio && (a.fim ?? "") === (b.fim ?? "");
}

/** Outros dias (com a loja aberta) em que a pessoa trabalha no mesmo horário do dia escolhido. */
export function diasComMesmoHorario(escala: Pick<Escala, "equipe" | "cobertura">, pessoaId: string, data: number): number[] {
  const p = escala.equipe.find((x) => x.id === pessoaId);
  const base = p?.turnos.find((x) => x.data === data);
  if (!p || !base || base.status !== "trabalho") return [];
  const aberto = new Set(escala.cobertura.filter((c) => c.aberto).map((c) => c.data));
  return p.turnos.filter((x) => x.data !== data && aberto.has(x.data) && mesmoHorario(x, base)).map((x) => x.data);
}

/** Grupos de dias para levar um horário junto: segunda a sexta, sábados ou domingos (pedido da Angela, DP). */
export type GrupoDias = "seg_sex" | "sabados" | "domingos";
export const ROTULO_GRUPO: Record<GrupoDias, string> = { seg_sex: "de segunda a sexta", sabados: "sábados", domingos: "domingos" };
export function grupoDoDia(dia: Dia): GrupoDias {
  return dia === "sab" ? "sabados" : dia === "dom" ? "domingos" : "seg_sex";
}

/**
 * Outros dias do período (com a loja aberta) do mesmo grupo do dia escolhido — segunda a sexta, sábados ou domingos —
 * em que a pessoa trabalha. Folga não entra (continua folga).
 */
export function diasDoMesmoGrupo(escala: Pick<Escala, "equipe" | "cobertura">, pessoaId: string, data: number): number[] {
  const p = escala.equipe.find((x) => x.id === pessoaId);
  const base = p?.turnos.find((x) => x.data === data);
  if (!p || !base) return [];
  const grupo = grupoDoDia(base.dia);
  const aberto = new Set(escala.cobertura.filter((c) => c.aberto).map((c) => c.data));
  return p.turnos.filter((x) => x.data !== data && aberto.has(x.data) && x.status === "trabalho" && grupoDoDia(x.dia) === grupo).map((x) => x.data);
}

/** Onde o ajuste vale: só no dia, nos dias com o mesmo horário ou em todos os dias do grupo (seg a sex / sábados / domingos). */
export type ModoAjuste = "dia" | "mesmo_horario" | "grupo";

export function diasParaReplicar(escala: Pick<Escala, "equipe" | "cobertura">, a: Pick<AjusteTurno, "pessoaId" | "data" | "status">, modo: ModoAjuste): number[] {
  if (a.status !== "trabalho" || modo === "dia") return [];
  return modo === "grupo" ? diasDoMesmoGrupo(escala, a.pessoaId, a.data) : diasComMesmoHorario(escala, a.pessoaId, a.data);
}

/**
 * Ajusta o dia escolhido e leva o novo horário (entrada e saída) para os outros dias do modo escolhido. O almoço de cada
 * dia guarda a distância que tinha da entrada, mais o que o almoço do dia escolhido andou (o revezamento continua; nos
 * dias com o mesmo horário é o mesmo que andar o mesmo tanto); se não couber no turno novo, fica o almoço do dia
 * escolhido. Devolve os outros dias ajustados.
 */
export function ajustarVariosDias(cfg: ConfigFilial, escala: Escala, a: AjusteTurno, modo: ModoAjuste): { movidaDe: number | null; outrosDias: number[] } {
  const p = escala.equipe.find((x) => x.id === a.pessoaId);
  const original = p?.turnos.find((x) => x.data === a.data);
  const outrosDias = diasParaReplicar(escala, a, modo);
  const antes = new Map(
    (p?.turnos ?? []).filter((x) => outrosDias.includes(x.data)).map((x) => [x.data, { ini: x.inicio ?? "", ii: x.intervaloInicio ?? "", fi: x.intervaloFim ?? "" }]),
  );
  const origIni = original?.status === "trabalho" ? (original.inicio ?? "") : "";
  const origII = original?.status === "trabalho" ? (original.intervaloInicio ?? "") : "";
  const { movidaDe } = ajustarTurno(cfg, escala, a);
  const novoIni = String(a.inicio ?? "");
  const novoII = String(a.intervaloInicio ?? "");
  const novoFI = String(a.intervaloFim ?? "");
  // quanto o almoço do dia escolhido mudou de lugar em relação à entrada
  const mudou = novoII && origII && origIni ? minutos(novoII) - minutos(novoIni) - (minutos(origII) - minutos(origIni)) : null;
  const duracao = novoII && novoFI ? minutos(novoFI) - minutos(novoII) : 0;
  for (const data of outrosDias) {
    let ii = novoII;
    let fi = novoFI;
    const dele = antes.get(data);
    if (mudou !== null && dele?.ii && dele.ini) {
      const ini = minutos(novoIni) + (minutos(dele.ii) - minutos(dele.ini)) + mudou;
      if (ini >= minutos(novoIni) && ini + duracao <= minutos(String(a.fim))) {
        ii = hora(ini);
        fi = hora(ini + duracao);
      }
    }
    ajustarTurno(cfg, escala, { ...a, data, intervaloInicio: ii, intervaloFim: fi });
  }
  return { movidaDe, outrosDias };
}

/** Atalho do modo "mesmo horário" (mantido para quem já chamava). */
export function ajustarMesmoHorario(cfg: ConfigFilial, escala: Escala, a: AjusteTurno) {
  return ajustarVariosDias(cfg, escala, a, "mesmo_horario");
}

/** Ajuste de um dia na tela. Folga num dia de trabalho troca com a folga que já existia na mesma semana. */
export function ajustarTurno(cfg: ConfigFilial, escala: Escala, a: AjusteTurno): { movidaDe: number | null } {
  const p = escala.equipe.find((x) => x.id === a.pessoaId);
  if (!p) throw new Error("Colaborador não encontrado nesta opção.");
  const t = p.turnos.find((x) => x.data === a.data);
  const dia = escala.cobertura.find((x) => x.data === a.data);
  if (!t || !dia?.aberto) throw new Error("Só dá para ajustar datas em que a loja abre.");
  if (!naEscala(p)) throw new Error("Afastados e inativos não entram na escala.");
  if (!Array.isArray(escala.alertasBase)) escala.alertasBase = structuredClone(escala.alertas);
  if (t.horasBase === undefined) t.horasBase = Number(t.horas || 0);
  let movidaDe: number | null = null;

  if (a.status === "folga") {
    // no 5x2 a folga troca com a outra folga da semana; no 12x36 não há folga da semana para trocar
    if (t.status === "trabalho" && !eh12x36(p)) {
      const semana = semanaDoPeriodo(escala, a.data);
      const outra = p.turnos.find(
        (x) => x.data !== a.data && x.status === "folga" && semanaDoPeriodo(escala, x.data) === semana && escala.cobertura.find((c) => c.data === x.data)?.aberto,
      );
      if (outra) {
        if (outra.horasBase === undefined) outra.horasBase = Number(outra.horas || 0);
        const abre = cfg.horarios[outra.dia]?.abre || cfg.horarios.seg?.abre || "08:00";
        const horasDia = Number(p.horasDia || escala.jornadaSemanal / 5);
        const intervalo = Number(p.intervaloMin ?? 60);
        const ini = minutos(horaValida(abre) ? abre : "08:00");
        const almoco = ini + Math.round((horasDia * 60 - intervalo) / 2);
        Object.assign(outra, {
          status: "trabalho",
          inicio: hora(ini),
          fim: hora(ini + horasDia * 60 + intervalo),
          intervaloMin: intervalo,
          intervaloInicio: intervalo ? hora(almoco) : "",
          intervaloFim: intervalo ? hora(almoco + intervalo) : "",
          horas: horasDia,
          ajustado: true,
        } satisfies Partial<Turno>);
        movidaDe = outra.data;
      }
    }
    Object.assign(t, { status: "folga", inicio: "", fim: "", intervaloInicio: "", intervaloFim: "", intervaloMin: 0, horas: 0 } satisfies Partial<Turno>);
  } else {
    const inicio = String(a.inicio ?? "");
    const fim = String(a.fim ?? "");
    const ii = String(a.intervaloInicio ?? "");
    const fi = String(a.intervaloFim ?? "");
    if (!horaValida(inicio) || !horaValida(fim) || minutos(fim) <= minutos(inicio)) throw new Error("Informe entrada e saída válidas, com a saída depois da entrada.");
    if ((ii && !horaValida(ii)) || (fi && !horaValida(fi)) || !ii !== !fi) throw new Error("Confira a saída e o retorno do almoço (os dois ou nenhum).");
    if (ii && (minutos(fi) <= minutos(ii) || minutos(ii) < minutos(inicio) || minutos(fi) > minutos(fim))) throw new Error("O almoço precisa ficar dentro do turno.");
    const intervalo = ii ? minutos(fi) - minutos(ii) : 0;
    const horas = (minutos(fim) - minutos(inicio) - intervalo) / 60;
    if (horas <= 0) throw new Error("A jornada do dia precisa ser maior que zero.");
    if (horas > 12) throw new Error("Mais de 12 horas trabalhadas no dia: confira os horários.");
    Object.assign(t, { status: "trabalho", inicio, fim, intervaloInicio: ii, intervaloFim: fi, intervaloMin: intervalo, horas } satisfies Partial<Turno>);
  }
  t.ajustado = true;
  recalcular(cfg, escala);
  escala.analisePendente = true;
  return { movidaDe };
}

/** Recalcula horas, cobertura e alertas depois de ajustes. */
export function recalcular(cfg: ConfigFilial, escala: Escala) {
  const nSemanas = semanasDoPeriodo(escala);
  for (const p of escala.equipe) resumirPessoa(p, escala.jornadaSemanal, nSemanas);
  escala.cobertura = escala.cobertura.map((c) => coberturaDoDia(cfg, c.data, c.dia, escala.equipe));
  escala.alertas = auditar(cfg, escala);
  return escala;
}

/**
 * Escala que "segue até ser alterada": leva o desenho de uma escala para outro período. As semanas completas dela
 * (segunda a domingo) se repetem em ciclo, cada dia no mesmo dia da semana: horários, almoços e o revezamento das
 * folgas continuam iguais. A equipe é a da escala base (quem entrou depois precisa de uma escala nova).
 */
export function projetarEscala(cfg: ConfigFilial, base: Escala, ano: number, mes: number): Escala {
  const destino: PeriodoEscala = { ano, mes, inicio: inicioFolha(ano, mes) };
  const porSemana = new Map<number, DiaPeriodo[]>();
  for (const d of diasDoPeriodo(base)) {
    const s = semanaDoPeriodo(base, d.data);
    porSemana.set(s, [...(porSemana.get(s) ?? []), d]);
  }
  const semanas = [...porSemana.entries()].sort((a, b) => a[0] - b[0]).map(([, ds]) => ds).filter((ds) => ds.length === 7);
  if (!semanas.length) throw new Error("A escala base não tem uma semana completa (segunda a domingo) para repetir.");
  // referência: a segunda-feira da 1ª semana completa da base; cada data do destino cai numa semana do ciclo
  const ref = Date.parse(`${semanas[0][0].iso}T00:00:00Z`);
  const diasDestino = diasDoPeriodo(destino);
  const modeloDe = new Map(
    diasDestino.map((d) => {
      const desde = Math.floor((Date.parse(`${d.iso}T00:00:00Z`) - ref) / (7 * 86_400_000));
      const ciclo = ((desde % semanas.length) + semanas.length) % semanas.length;
      return [d.data, semanas[ciclo].find((x) => x.dia === d.dia)!.data];
    }),
  );
  const isoDaBase = new Map(diasDoPeriodo(base).map((d) => [d.data, d.iso]));
  const equipe: PessoaEscala[] = base.equipe.map((p) => {
    const trabalho = p.turnos.filter((t) => t.status === "trabalho" && isoDaBase.has(t.data));
    if (eh12x36(p) && naEscala(p) && trabalho.length) {
      // 12x36: o dia sim, dia não continua contado em dias corridos (não segue o ciclo das semanas)
      const par = diaCorrido(isoDaBase.get(trabalho[0].data)!) % 2;
      return {
        ...p,
        turnos: diasDestino.map((d): Turno => {
          const abre = aberto(cfg, d.dia);
          if (!abre) return { data: d.data, dia: d.dia, status: "fechado", horas: 0 };
          if (diaCorrido(d.iso) % 2 !== par) return { data: d.data, dia: d.dia, status: "folga", horas: 0 };
          const modelo = trabalho.find((t) => t.dia === d.dia && !t.ajustado) ?? trabalho.find((t) => !t.ajustado) ?? trabalho[0];
          return { ...modelo, data: d.data, dia: d.dia };
        }),
      };
    }
    return {
      ...p,
      turnos: diasDestino.map((d) => {
        const t = p.turnos.find((x) => x.data === modeloDe.get(d.data));
        return { ...(t ?? { status: "fechado" as StatusTurno, horas: 0 }), data: d.data, dia: d.dia };
      }),
    };
  });
  const escala: Escala = {
    ano,
    mes,
    inicio: destino.inicio,
    jornadaSemanal: base.jornadaSemanal,
    folgasPermitidas: base.folgasPermitidas,
    equipe,
    cobertura: diasDestino.map((d) => ({ data: d.data, dia: d.dia, aberto: aberto(cfg, d.dia), porFuncao: {}, total: 0, faixas: [] })),
    alertas: [],
  };
  recalcular(cfg, escala);
  escala.alertasBase = structuredClone(escala.alertas);
  return escala;
}

/** "Atualizar pendências": compara com a análise anterior (o que saiu, o que continua e o que apareceu). */
export function reanalisar(cfg: ConfigFilial, escala: Escala) {
  const temReferencia = Array.isArray(escala.alertasBase);
  const tinhaAjustes = escala.equipe.some((p) => p.turnos.some((t) => t.ajustado));
  const base = temReferencia ? (escala.alertasBase as Alerta[]) : structuredClone(escala.alertas);
  recalcular(cfg, escala);
  escala.analise = { ...compararAlertas(base, escala.alertas), temReferencia, tinhaAjustes };
  escala.alertasBase = structuredClone(escala.alertas);
  escala.analisePendente = false;
  return escala;
}

export const chaveAlerta = (a: Alerta) => [a.severidade, a.funcao ?? "", a.pessoaId ?? "", a.mensagem].join("|");

function compararAlertas(antes: Alerta[], agora: Alerta[]) {
  const contar = (lista: Alerta[]) => {
    const m = new Map<string, { mensagem: string; n: number }>();
    for (const a of lista) {
      const k = chaveAlerta(a);
      const item = m.get(k) ?? { mensagem: a.mensagem, n: 0 };
      item.n += 1;
      m.set(k, item);
    }
    return m;
  };
  const a = contar(antes);
  const b = contar(agora);
  let resolvidas = 0;
  let continuam = 0;
  let novas = 0;
  const mudancas: Analise["mudancas"] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const n0 = a.get(k)?.n ?? 0;
    const n1 = b.get(k)?.n ?? 0;
    resolvidas += Math.max(0, n0 - n1);
    novas += Math.max(0, n1 - n0);
    continuam += Math.min(n0, n1);
    if (n0 !== n1) mudancas.push({ mensagem: (b.get(k) ?? a.get(k))!.mensagem, antes: n0, agora: n1 });
  }
  return { anteriores: antes.length, atuais: agora.length, resolvidas, continuam, novas, mudancas };
}

// ---------------------------------------------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------------------------------------------

function auditar(cfg: ConfigFilial, escala: Escala): Alerta[] {
  const { equipe, cobertura, jornadaSemanal, ano, mes } = escala;
  const alertas: Alerta[] = [];
  const limite = limiteSemanal(ano, mes);
  if (jornadaSemanal > limite)
    alertas.push({ severidade: "alta", mensagem: `Jornada de ${jornadaSemanal} h/semana acima do limite de ${limite} h/semana para ${String(mes).padStart(2, "0")}/${ano} (transição da EC 141/2026).` });
  if (jornadaSemanal / 5 > 8 && !cfg.acordoJornadaEstendida)
    alertas.push({ severidade: "media", mensagem: `${jornadaSemanal} h em cinco dias passa de 8 horas por dia: marque o acordo/convenção coletiva na filial ou use jornada de até 40 horas.` });
  if (cobertura.some((d) => d.aberto && !d.faixas.length))
    alertas.push({ severidade: "alta", mensagem: "Informe o horário de abertura e fechamento de todos os dias de funcionamento para calcular a cobertura por hora." });

  const abertos = diasAbertos(cfg);
  const horasSemana = abertos.reduce((s, i) => s + horasAbertas(cfg, DIAS[i]), 0);
  for (const dia of cobertura.filter((d) => d.aberto && d.faixas.length)) {
    for (const [funcao, minimo] of Object.entries(cfg.minimos) as [Funcao, number][]) {
      if (!minimo) continue;
      const faltas = dia.faixas.filter((f) => (f.porFuncao[funcao] ?? 0) < minimo);
      if (!faltas.length) continue;
      alertas.push({
        severidade: "alta",
        data: dia.data,
        funcao,
        faixas: faltas.map((f) => f.hora),
        sugestoes: sugerir(cfg, escala, dia, funcao, minimo, faltas, horasSemana),
        mensagem: `Cobertura de ${PLURAL_FUNCAO[funcao]} abaixo do mínimo (${minimo}) em ${faltas.length} faixa${faltas.length === 1 ? "" : "s"} de uma hora na ${NOME_DIA[dia.dia]}. A primeira falta começa às ${faltas[0].hora}.`,
      });
    }
  }
  if (!cfg.minimos.farmaceutico) alertas.push({ severidade: "media", funcao: "farmaceutico", mensagem: "Defina o mínimo de farmacêuticos por horário na filial para auditar a cobertura." });

  for (const p of equipe) {
    if (!naEscala(p)) continue;
    const doze = eh12x36(p);
    if (!doze && p.mediaSemanal > jornadaSemanal + 0.01)
      alertas.push({ severidade: "media", pessoaId: p.id, mensagem: `${p.nome}: média de ${p.mediaSemanal.toFixed(1)} h/semana, acima da jornada de ${jornadaSemanal} h.` });
    if (doze && !cfg.acordoJornadaEstendida)
      alertas.push({ severidade: "media", pessoaId: p.id, mensagem: `${p.nome}: 12x36 só vale com acordo escrito (individual ou coletivo). Marque o acordo/convenção coletiva na filial.` });
    if (!doze && Number(p.horasDia || jornadaSemanal / 5) > 8 && !cfg.acordoJornadaEstendida)
      alertas.push({ severidade: "media", pessoaId: p.id, mensagem: `${p.nome}: jornada diária acima de 8 horas sem acordo/convenção coletiva marcado na filial.` });
    const pos = (t: Turno) => posicaoNoPeriodo(escala, t.data);
    const fmtDia = (data: number) => rotuloData(escala, data);
    const dias = p.turnos.filter((t) => t.status === "trabalho").sort((x, y) => pos(x) - pos(y));
    for (const t of dias) {
      if (!doze && t.ajustado && t.horas > 8 && !cfg.acordoJornadaEstendida)
        alertas.push({ severidade: "media", data: t.data, pessoaId: p.id, mensagem: `${p.nome}: turno ajustado para ${t.horas.toFixed(1)} horas trabalhadas em ${fmtDia(t.data)}; confira o limite e o acordo coletivo.` });
      // no 12x36 o intervalo pode ser indenizado (CLT art. 59-A)
      if (!doze && t.horas > 6 && Number(t.intervaloMin ?? 0) < 60)
        alertas.push({ severidade: "media", data: t.data, pessoaId: p.id, mensagem: `${p.nome}: intervalo de ${Number(t.intervaloMin ?? 0)} min em jornada de mais de 6 horas (${fmtDia(t.data)}). O mínimo é 1 hora.` });
    }
    for (let i = 1; i < dias.length; i += 1) {
      if (doze && pos(dias[i]) - pos(dias[i - 1]) === 1)
        alertas.push({
          severidade: "alta",
          pessoaId: p.id,
          data: dias[i].data,
          mensagem: `${p.nome}: 12x36 com dois dias seguidos (${fmtDia(dias[i - 1].data)} e ${fmtDia(dias[i].data)}). Depois de cada turno de 12 horas o descanso é de 36 horas.`,
        });
      if (pos(dias[i]) - pos(dias[i - 1]) !== 1 || !dias[i - 1].fim || !dias[i].inicio) continue;
      const descanso = 1440 - minutos(dias[i - 1].fim!) + minutos(dias[i].inicio!);
      if (descanso < 660)
        alertas.push({
          severidade: "alta",
          pessoaId: p.id,
          data: dias[i].data,
          mensagem: `${p.nome}: descanso entre jornadas de ${Math.floor(descanso / 60)}h${String(descanso % 60).padStart(2, "0")} antes de ${fmtDia(dias[i].data)} (o mínimo é 11 horas).`,
        });
    }
  }
  if (!equipe.length) alertas.push({ severidade: "alta", mensagem: "Cadastre a equipe da filial para calcular a cobertura." });
  return alertas;
}

function lacunaSemanal(cobertura: DiaCobertura[], funcao: Funcao, minimo: number) {
  const porDia = new Map<Dia, { horas: number; vezes: number }>();
  for (const d of cobertura.filter((x) => x.aberto)) {
    const s = porDia.get(d.dia) ?? { horas: 0, vezes: 0 };
    s.horas += d.faixas.filter((f) => (f.porFuncao[funcao] ?? 0) < minimo).length;
    s.vezes += 1;
    porDia.set(d.dia, s);
  }
  return [...porDia.values()].reduce((s, x) => s + (x.vezes ? x.horas / x.vezes : 0), 0);
}

function sugerir(cfg: ConfigFilial, escala: Escala, dia: DiaCobertura, funcao: Funcao, minimo: number, faltas: FaixaCobertura[], horasSemana: number) {
  const s: string[] = [];
  const singular = ROTULO_FUNCAO[funcao].toLowerCase();
  const quantos = (n: number) => `${n} ${n === 1 ? singular : PLURAL_FUNCAO[funcao]}`;
  const escalados = Number(dia.porFuncao[funcao] ?? 0);
  const ativos = escala.equipe.filter((p) => funcaoNaCobertura(p.funcao) === funcao && naEscala(p));
  const turnosDia = ativos.map((p) => p.turnos.find((t) => t.data === dia.data && t.status === "trabalho")).filter((t): t is Turno => !!t);
  const horasEscaladas = turnosDia.reduce((x, t) => x + Number(t.horas || 0), 0);
  const necessidade = horasAbertas(cfg, dia.dia) * minimo;
  if (escalados < minimo) {
    s.push(`Reorganize as folgas para deixar pelo menos ${quantos(minimo)} ${minimo === 1 ? "escalado" : "escalados"} neste dia. Folgas de preferência na terça, quarta e quinta, preservando segunda e sexta.`);
  } else if (horasEscaladas + 0.01 < necessidade && ativos.length > escalados) {
    s.push(
      `Há ${quantos(ativos.length)} na equipe, mas só ${quantos(escalados)} ${escalados === 1 ? "escalado" : "escalados"} neste dia (${horasEscaladas.toFixed(0)} h de jornada para ${necessidade.toFixed(0)} h de funcionamento). Programe um turno complementar e mova a folga desse profissional para terça, quarta ou quinta.`,
    );
    s.push("Escalone os horários de almoço para que não coincidam e não abram uma lacuna no atendimento.");
  } else if (horasEscaladas + 0.01 < necessidade) {
    s.push(`A equipe escalada soma ${horasEscaladas.toFixed(0)} h de jornada para ${necessidade.toFixed(0)} h de cobertura mínima neste dia. Avalie transferência ou contratação de ${singular}, ou ajuste do horário da loja.`);
  } else {
    s.push(`Há ${quantos(escalados)} ${escalados === 1 ? "escalado" : "escalados"} no dia, mas os turnos ou almoços deixam lacunas. Ajuste entradas, saídas e almoço, escalonando os intervalos.`);
  }

  const f = faixaDoDia(cfg, dia.dia);
  const horas = faltas.map((x) => x.hora);
  if (funcao === "farmaceutico") {
    const indice = DIAS.indexOf(dia.dia);
    const deFolga = ativos.filter((p) => p.turnos.find((t) => t.data === dia.data)?.status === "folga");
    const alternativas = [2, 3, 4]
      .filter((d) => d !== indice && horasAbertas(cfg, DIAS[d]) > 0)
      .map((d) => {
        const iguais = escala.cobertura.filter((c) => c.dia === DIAS[d] && c.aberto);
        const nota = iguais.length ? iguais.reduce((x, c) => x + c.faixas.filter((fx) => (fx.porFuncao[funcao] ?? 0) < minimo).length, 0) / iguais.length : 0;
        return { d, nota };
      })
      .sort((a, b) => a.nota - b.nota);
    if (deFolga.length && alternativas.length)
      s.push(`Mova a folga de ${deFolga.map((p) => p.nome).join(", ")} da ${NOME_DIA[dia.dia]} para ${NOME_DIA[DIAS[alternativas[0].d]]}: entre terça, quarta e quinta, é o dia com menos lacunas nesta opção.`);
    if (f && horas[0] === f.abre) s.push(`Antecipe a entrada do farmacêutico para ${f.abre} (ou para a primeira faixa descoberta) e ajuste a saída para manter a jornada; se precisar, use o turno de outro farmacêutico.`);
    if (f && horas.length && hora(minutos(horas[horas.length - 1]) + 60) === f.fecha) s.push(`Estenda o turno do farmacêutico até ${f.fecha}, com entrada mais tarde ou turno complementar, respeitando jornada e descanso.`);
    if (horas.some((h) => turnosDia.some((t) => t.intervaloInicio && t.intervaloFim && minutos(h) >= minutos(t.intervaloInicio) && minutos(h) < minutos(t.intervaloFim))))
      s.push("A lacuna coincide com o almoço: mude a saída e o retorno do almoço do farmacêutico para um período em que haja cobertura.");
    const capacidade = ativos.reduce((x, p) => x + Number(p.mediaSemanal || 0), 0);
    const necessidadeSemana = horasSemana * minimo;
    if (capacidade < necessidadeSemana)
      s.push(`A equipe de farmacêuticos oferece cerca de ${capacidade.toFixed(0)} h/semana para ${necessidadeSemana.toFixed(0)} h/semana de cobertura mínima. Avalie transferir ou contratar farmacêutico, ou ajustar o horário da loja.`);
    else
      s.push(
        `A equipe tem cerca de ${capacidade.toFixed(0)} h/semana para ${necessidadeSemana.toFixed(0)} h/semana de cobertura mínima, mas a distribuição ainda deixa cerca de ${lacunaSemanal(escala.cobertura, funcao, minimo).toFixed(1)} h/semana descobertas. Reorganize turnos, folgas e almoços antes de pensar em reforço.`,
      );
  }

  const faixas = dia.faixas;
  const primeiraFalta = faixas.findIndex((x) => (x.porFuncao[funcao] ?? 0) < minimo);
  let ultimaFalta = -1;
  for (let i = faixas.length - 1; i >= 0; i -= 1)
    if ((faixas[i].porFuncao[funcao] ?? 0) < minimo) {
      ultimaFalta = i;
      break;
    }
  const primeiraCoberta = faixas.find((x) => (x.porFuncao[funcao] ?? 0) >= minimo);
  const ultimaCoberta = [...faixas].reverse().find((x) => (x.porFuncao[funcao] ?? 0) >= minimo);
  if (f && primeiraFalta === 0 && primeiraCoberta && primeiraCoberta.hora !== f.abre)
    s.push(`Se o movimento permitir, avalie abrir às ${primeiraCoberta.hora} em vez de ${f.abre}: isso elimina as primeiras faixas sem cobertura.`);
  if (f && ultimaFalta === faixas.length - 1 && ultimaCoberta) {
    const fechaAntes = hora(minutos(ultimaCoberta.hora) + 60);
    if (minutos(fechaAntes) < minutos(f.fecha)) s.push(`Como alternativa, avalie fechar às ${fechaAntes} em vez de ${f.fecha}, considerando vendas e atendimento.`);
  }
  if (primeiraFalta > 0 && ultimaFalta < faixas.length - 1) s.push("As lacunas ficam no meio do expediente: mudar abertura ou fechamento não resolve. Ajuste turnos e almoços.");
  return s;
}

// ---------------------------------------------------------------------------------------------------------------
// Pré-análise (painel)
// ---------------------------------------------------------------------------------------------------------------

export type PreAnalise = { status: "ok" | "ajustavel" | "equipe" | "indisponivel"; rotulo: string; detalhe: string; alertas: number | null };
export const ROTULO_PRE: Record<PreAnalise["status"], string> = {
  ok: "Sem pendências",
  ajustavel: "Precisa de ajuste",
  equipe: "Reforçar equipe ou rever horário",
  indisponivel: "Análise indisponível",
};

/** A melhor de três opções automáticas do mês: diz se a filial fecha a escala, se precisa de ajuste ou se falta gente. */
export function preAnalise(cfg: ConfigFilial, equipe: Colaborador[], { ano, mes, jornadaSemanal = 40 }: { ano: number; mes: number; jornadaSemanal?: number }): PreAnalise {
  try {
    const opcoes = gerarOpcoes(cfg, equipe, { ano, mes, jornadaSemanal, opcoes: 3 });
    const melhor = opcoes.reduce((m, o) => (o.alertas.length < m.alertas.length ? o : m));
    if (!melhor.alertas.length) return { status: "ok", rotulo: ROTULO_PRE.ok, detalhe: "A melhor das três opções automáticas não tem pendências.", alertas: 0 };
    const minimo = Number(cfg.minimos.farmaceutico ?? 0);
    const farm = equipe.filter((p) => contaComoFarmaceutico(p.funcao) && naEscala(p));
    const abertos = diasAbertos(cfg);
    const horasSemana = abertos.reduce((s, i) => s + horasAbertas(cfg, DIAS[i]), 0);
    // dias por semana: 5 no 5x2 e 3,5 em média no 12x36
    const diasSemana = (p: Colaborador) => (eh12x36(p) ? 3.5 : 5);
    const capacidade = farm.reduce((s, p) => s + horasDoTurno(p, jornadaSemanal / 5) * diasSemana(p), 0);
    const necessidade = horasSemana * minimo;
    const faltaDias = farm.reduce((s, p) => s + diasSemana(p), 0) < minimo * abertos.length;
    const faltaHoras = capacidade + 0.01 < necessidade;
    if (!minimo || faltaDias || faltaHoras) {
      const motivos: string[] = [];
      if (!minimo) motivos.push("mínimo de farmacêuticos por horário não cadastrado");
      if (faltaDias) motivos.push(`${farm.length} farmacêutico(s) ativo(s) não cobrem ${abertos.length} dias de funcionamento`);
      if (faltaHoras) motivos.push(`capacidade de ${capacidade.toFixed(0)} h/semana abaixo da necessidade da loja (${necessidade.toFixed(0)} h)`);
      return { status: "equipe", rotulo: ROTULO_PRE.equipe, detalhe: `${motivos.join("; ")}. A equipe atual não alcança a cobertura mínima, mesmo antes de otimizar entradas e folgas.`, alertas: melhor.alertas.length };
    }
    return {
      status: "ajustavel",
      rotulo: ROTULO_PRE.ajustavel,
      detalhe: `${melhor.alertas.length} pendência(s) na melhor opção. A equipe tem horas suficientes: revise folgas e turnos antes de pensar em contratação ou mudança de horário.`,
      alertas: melhor.alertas.length,
    };
  } catch (e) {
    return { status: "indisponivel", rotulo: ROTULO_PRE.indisponivel, detalhe: e instanceof Error ? e.message : "Não deu para simular esta filial.", alertas: null };
  }
}
