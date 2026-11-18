// Motor da escala 5x2: distribui as folgas da equipe nos dias permitidos, monta os turnos de cada dia, mede a cobertura
// por faixa de uma hora (farmacêutico presente em todo o horário da loja) e audita jornada, intervalo e descanso.
// Funções puras (sem banco): rodam no servidor e no navegador.

export const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const;
export type Dia = (typeof DIAS)[number];
export const ROTULO_DIA: Record<Dia, string> = { dom: "dom", seg: "seg", ter: "ter", qua: "qua", qui: "qui", sex: "sex", sab: "sáb" };
export const NOME_DIA: Record<Dia, string> = { dom: "domingo", seg: "segunda-feira", ter: "terça-feira", qua: "quarta-feira", qui: "quinta-feira", sex: "sexta-feira", sab: "sábado" };

export const FUNCOES = ["farmaceutico", "atendente", "caixa", "gerente", "estoquista", "motorista", "auditor", "servicos_gerais", "outros"] as const;
export type Funcao = (typeof FUNCOES)[number];
export const ROTULO_FUNCAO: Record<Funcao, string> = {
  farmaceutico: "Farmacêutico",
  atendente: "Atendente",
  caixa: "Caixa",
  gerente: "Gerente",
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
  estoquista: "estoquistas",
  motorista: "motoristas",
  auditor: "auditores",
  servicos_gerais: "serviços gerais",
  outros: "outros",
};
export const ehFuncao = (v: unknown): v is Funcao => typeof v === "string" && (FUNCOES as readonly string[]).includes(v);

export const SITUACOES = ["ativo", "afastado", "inativo"] as const;
export type Situacao = (typeof SITUACOES)[number];
export const ROTULO_SITUACAO: Record<Situacao, string> = { ativo: "Ativo", afastado: "Afastado", inativo: "Inativo" };
export const ehSituacao = (v: unknown): v is Situacao => typeof v === "string" && (SITUACOES as readonly string[]).includes(v);

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

/** Uma opção de escala do mês (o que fica gravado em esc_simulacoes). */
export type Escala = {
  ano: number;
  mes: number;
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
/** Semanas começam na segunda: a semana de um dia do mês (0 = a semana do dia 1). */
const deslocamento = (ano: number, mes: number) => (diaDaSemana(ano, mes, 1) + 6) % 7;
export const semanaDoMes = (ano: number, mes: number, data: number) => Math.floor((data - 1 + deslocamento(ano, mes)) / 7);
const fmtDia = (data: number, mes: number) => `${String(data).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;

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

function distribuirFolgas(equipe: Pessoa[], abertos: number[], opcao: number, semana: number, candidatos: number[]) {
  const folgas = new Map<string, number[]>();
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const fechados = todos.filter((d) => !abertos.includes(d));
  // terça, quarta e quinta primeiro; sábado e domingo depois; segunda e sexta (dias de venda) por último
  const penalidade = (d: number) => ([2, 3, 4].includes(d) ? 0 : [0, 6].includes(d) ? 0.5 : 1.5);
  const total = new Map(todos.map((d) => [d, 0]));
  const farm = new Map(todos.map((d) => [d, 0]));
  const ativos = equipe
    .map((pessoa, indice) => ({ pessoa, indice }))
    .filter(({ pessoa }) => naEscala(pessoa))
    .sort((a, b) => Number(b.pessoa.funcao === "farmaceutico") - Number(a.pessoa.funcao === "farmaceutico") || a.indice - b.indice);
  const qtdFarm = ativos.filter(({ pessoa }) => pessoa.funcao === "farmaceutico").length;
  const marcar = (p: Pessoa, dias: number[]) => {
    folgas.set(p.id, dias);
    for (const d of dias) {
      total.set(d, (total.get(d) ?? 0) + 1);
      if (p.funcao === "farmaceutico") farm.set(d, (farm.get(d) ?? 0) + 1);
    }
  };
  const escolher = <T>(itens: T[], notas: number[], indice: number) => {
    const melhor = Math.min(...notas);
    const empatados = itens.filter((_, i) => notas[i] === melhor);
    return empatados[(indice + opcao + semana) % empatados.length];
  };
  const umDia = (p: Pessoa, indice: number) => {
    if (p.funcao === "farmaceutico" && qtdFarm >= 2) return escolher(candidatos, candidatos.map((d) => penalidade(d) * 2 + (farm.get(d) ?? 0) * 100 + (total.get(d) ?? 0) * 0.1), indice);
    return escolher(
      candidatos,
      candidatos.map((d) => penalidade(d) * 2 + (total.get(d) ?? 0) + (p.funcao === "farmaceutico" ? 3 : 1) * (farm.get(d) ?? 0)),
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
      if (pessoa.funcao === "farmaceutico") {
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
  { ano, mes, jornadaSemanal = 40, opcoes = 3, folgasPermitidas }: { ano: number; mes: number; jornadaSemanal?: number; opcoes?: number; folgasPermitidas?: number[] },
): Escala[] {
  const abertos = diasAbertos(cfg);
  const escolhidas = [...new Set((folgasPermitidas ?? cfg.folgasPermitidas).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  const candidatos = escolhidas.filter((d) => abertos.includes(d));
  const erro = erroFolgas(cfg, escolhidas);
  if (erro) throw new Error(erro);
  const horasPadrao = jornadaSemanal / 5;
  const nDias = diasNoMes(ano, mes);
  const nSemanas = Math.ceil((nDias + deslocamento(ano, mes)) / 7);
  const resultado: Escala[] = [];

  for (let opcao = 0; opcao < opcoes; opcao += 1) {
    const folgasSemana = new Map(Array.from({ length: nSemanas }, (_, s) => [s, distribuirFolgas(equipe, abertos, opcao, s, candidatos)]));
    const pessoas: PessoaEscala[] = equipe.map((p) => ({ ...p, turnos: [], totalHoras: 0, mediaSemanal: 0, excedente: 0 }));
    const cobertura: DiaCobertura[] = [];

    for (let data = 1; data <= nDias; data += 1) {
      const dia = diaChave(ano, mes, data);
      const indiceDia = DIAS.indexOf(dia);
      const semana = semanaDoMes(ano, mes, data);
      const abre = aberto(cfg, dia);
      const faixa = faixaDoDia(cfg, dia);
      const trabalhando = pessoas.filter((p) => naEscala(p) && abre && !(folgasSemana.get(semana)?.get(p.id) ?? []).includes(indiceDia));

      for (const p of trabalhando) {
        const duracao = Number(p.horasDia || horasPadrao);
        const intervalo = Number(p.intervaloMin ?? 60);
        const mesmaFuncao = trabalhando.filter((c) => c.funcao === p.funcao);
        const posicao = mesmaFuncao.findIndex((c) => c.id === p.id);
        const turno: Turno = { data, dia, status: "trabalho", horas: duracao, intervaloMin: intervalo, inicio: "", fim: "", intervaloInicio: "", intervaloFim: "" };
        if (faixa) {
          // entradas escalonadas entre a abertura e a última entrada que ainda cobre o fechamento
          const turnos = mesmaFuncao.map((c, i) => {
            const dur = Number(c.horasDia || horasPadrao);
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
        const folgas = folgasSemana.get(semana)?.get(p.id) ?? [];
        const status: StatusTurno = p.situacao === "afastado" ? "afastamento" : p.situacao === "inativo" ? "inativo" : folgas.includes(indiceDia) && abre ? "folga" : "fechado";
        p.turnos.push({ data, dia, status, horas: 0 });
      }
      cobertura.push(coberturaDoDia(cfg, data, dia, pessoas));
    }
    for (const p of pessoas) resumirPessoa(p, jornadaSemanal, nSemanas);
    const escala: Escala = { ano, mes, jornadaSemanal, folgasPermitidas: escolhidas, equipe: pessoas, cobertura, alertas: [] };
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
  for (const { p } of trabalhando) porFuncao[p.funcao] = (porFuncao[p.funcao] ?? 0) + 1;
  const faixas: FaixaCobertura[] = [];
  if (abre && faixa) {
    for (let m = minutos(faixa.abre); m < minutos(faixa.fecha); m += 60) {
      const presentes: Partial<Record<Funcao, number>> = {};
      for (const { p, t } of trabalhando) {
        if (!t?.inicio || !t.fim) continue;
        const almocoDe = t.intervaloInicio ? minutos(t.intervaloInicio) : -1;
        const almocoAte = t.intervaloInicio ? almocoDe + Number(t.intervaloMin ?? 0) : -1;
        const cobre = minutos(t.inicio) <= m && minutos(t.fim) >= m + 60 && !(almocoDe < m + 60 && almocoAte > m);
        if (cobre) presentes[p.funcao] = (presentes[p.funcao] ?? 0) + 1;
      }
      faixas.push({ hora: hora(m), porFuncao: presentes });
    }
  }
  return { data, dia, aberto: abre, porFuncao, total: trabalhando.length, faixas };
}

function resumirPessoa(p: PessoaEscala, jornadaSemanal: number, nSemanas: number) {
  const horasDia = Number(p.horasDia || jornadaSemanal / 5);
  p.totalHoras = Number(p.turnos.reduce((s, t) => s + (t.status === "trabalho" ? Number(t.horas || 0) : 0), 0).toFixed(1));
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

/**
 * Ajusta o dia escolhido e leva o novo horário para os outros dias com o mesmo horário (entrada e saída). O almoço de
 * cada dia anda o mesmo tanto que o almoço do dia escolhido andou (o revezamento continua); se não couber no turno
 * novo, fica o almoço do dia escolhido. Devolve os outros dias ajustados.
 */
export function ajustarMesmoHorario(cfg: ConfigFilial, escala: Escala, a: AjusteTurno): { movidaDe: number | null; outrosDias: number[] } {
  const p = escala.equipe.find((x) => x.id === a.pessoaId);
  const original = p?.turnos.find((x) => x.data === a.data);
  const outrosDias = a.status === "trabalho" ? diasComMesmoHorario(escala, a.pessoaId, a.data) : [];
  const antes = new Map((p?.turnos ?? []).filter((x) => outrosDias.includes(x.data)).map((x) => [x.data, { ii: x.intervaloInicio ?? "", fi: x.intervaloFim ?? "" }]));
  const origII = original?.intervaloInicio ?? "";
  const { movidaDe } = ajustarTurno(cfg, escala, a);
  const novoII = String(a.intervaloInicio ?? "");
  const novoFI = String(a.intervaloFim ?? "");
  const delta = novoII && origII ? minutos(novoII) - minutos(origII) : null;
  const duracao = novoII && novoFI ? minutos(novoFI) - minutos(novoII) : 0;
  for (const data of outrosDias) {
    let ii = novoII;
    let fi = novoFI;
    const dele = antes.get(data);
    if (delta !== null && dele?.ii) {
      const ini = minutos(dele.ii) + delta;
      if (ini >= minutos(String(a.inicio)) && ini + duracao <= minutos(String(a.fim))) {
        ii = hora(ini);
        fi = hora(ini + duracao);
      }
    }
    ajustarTurno(cfg, escala, { ...a, data, intervaloInicio: ii, intervaloFim: fi });
  }
  return { movidaDe, outrosDias };
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
    if (t.status === "trabalho") {
      const semana = semanaDoMes(escala.ano, escala.mes, a.data);
      const outra = p.turnos.find(
        (x) => x.data !== a.data && x.status === "folga" && semanaDoMes(escala.ano, escala.mes, x.data) === semana && escala.cobertura.find((c) => c.data === x.data)?.aberto,
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
  const nSemanas = Math.ceil((escala.cobertura.length + deslocamento(escala.ano, escala.mes)) / 7);
  for (const p of escala.equipe) resumirPessoa(p, escala.jornadaSemanal, nSemanas);
  escala.cobertura = escala.cobertura.map((c) => coberturaDoDia(cfg, c.data, c.dia, escala.equipe));
  escala.alertas = auditar(cfg, escala);
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
    if (p.mediaSemanal > jornadaSemanal + 0.01)
      alertas.push({ severidade: "media", pessoaId: p.id, mensagem: `${p.nome}: média de ${p.mediaSemanal.toFixed(1)} h/semana, acima da jornada de ${jornadaSemanal} h.` });
    if (Number(p.horasDia || jornadaSemanal / 5) > 8 && !cfg.acordoJornadaEstendida)
      alertas.push({ severidade: "media", pessoaId: p.id, mensagem: `${p.nome}: jornada diária acima de 8 horas sem acordo/convenção coletiva marcado na filial.` });
    const dias = p.turnos.filter((t) => t.status === "trabalho").sort((x, y) => x.data - y.data);
    for (const t of dias) {
      if (t.ajustado && t.horas > 8 && !cfg.acordoJornadaEstendida)
        alertas.push({ severidade: "media", data: t.data, pessoaId: p.id, mensagem: `${p.nome}: turno ajustado para ${t.horas.toFixed(1)} horas trabalhadas em ${fmtDia(t.data, mes)}; confira o limite e o acordo coletivo.` });
      if (t.horas > 6 && Number(t.intervaloMin ?? 0) < 60)
        alertas.push({ severidade: "media", data: t.data, pessoaId: p.id, mensagem: `${p.nome}: intervalo de ${Number(t.intervaloMin ?? 0)} min em jornada de mais de 6 horas (${fmtDia(t.data, mes)}). O mínimo é 1 hora.` });
    }
    for (let i = 1; i < dias.length; i += 1) {
      if (dias[i].data - dias[i - 1].data !== 1 || !dias[i - 1].fim || !dias[i].inicio) continue;
      const descanso = 1440 - minutos(dias[i - 1].fim!) + minutos(dias[i].inicio!);
      if (descanso < 660)
        alertas.push({
          severidade: "alta",
          pessoaId: p.id,
          data: dias[i].data,
          mensagem: `${p.nome}: descanso entre jornadas de ${Math.floor(descanso / 60)}h${String(descanso % 60).padStart(2, "0")} antes de ${fmtDia(dias[i].data, mes)} (o mínimo é 11 horas).`,
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
  const ativos = escala.equipe.filter((p) => p.funcao === funcao && naEscala(p));
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
    const farm = equipe.filter((p) => p.funcao === "farmaceutico" && naEscala(p));
    const abertos = diasAbertos(cfg);
    const horasSemana = abertos.reduce((s, i) => s + horasAbertas(cfg, DIAS[i]), 0);
    const capacidade = farm.reduce((s, p) => s + Number(p.horasDia || jornadaSemanal / 5) * 5, 0);
    const necessidade = horasSemana * minimo;
    const faltaDias = farm.length * 5 < minimo * abertos.length;
    const faltaHoras = capacidade + 0.01 < necessidade;
    if (!minimo || faltaDias || faltaHoras) {
      const motivos: string[] = [];
      if (!minimo) motivos.push("mínimo de farmacêuticos por horário não cadastrado");
      if (faltaDias) motivos.push(`${farm.length} farmacêutico(s) ativo(s) não cobrem ${abertos.length} dias de funcionamento no 5x2`);
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
