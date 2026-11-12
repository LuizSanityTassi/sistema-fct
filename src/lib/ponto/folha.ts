// Folha para assinatura (controle de jornada do período, no layout que o RH já usa): funções puras sobre a
// apuração do módulo. Não calcula nada novo — normais, extras 50%/100%, noturno e carga vêm de
// lib/ponto/calculo.ts, as mesmas contas do espelho, dos relatórios e do fechamento.
import { AUSENCIA_LABEL, diaSemana, duracao, hm, local, type ApuracaoDia, type Horarios, type TotaisPeriodo } from "./calculo";

export const DIA_FOLHA = ["Domingo", "Segunda-Feira", "Terça-Feira", "Quarta-Feira", "Quinta-Feira", "Sexta-Feira", "Sábado"] as const;
const DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

export type LinhaFolha = {
  data: string;
  /** Quarta-Feira */
  dia: string;
  /** entre parênteses depois do dia: "Feriado", "Férias", "Atestado"… */
  obs: string;
  /** Ent 1, Sai 1, Ent 2, Sai 2 (as 4 primeiras marcações; "*" = incluída por ajuste aprovado) */
  normais: [string, string, string, string];
  /** Extra Ent, Extra Sai (5ª e 6ª marcações; mais que isso vai junto na Extra Sai) */
  extras: [string, string];
  /** horas trabalhadas que não são extra (trabalhado − extra) */
  normaisH: string;
  extraTot: string;
  extra50: string;
  extra100: string;
  noturno: string;
  /** carga prevista do dia (jornada/escala) */
  carga: string;
  descanso: boolean;
};

/** "08:15" (duracao() dá "8:15"; a folha do RH usa dois dígitos) */
const hhmmFolha = (min: number) => duracao(min).padStart(5, "0");
const h = (min: number) => (min > 0 ? hhmmFolha(min) : "");
const hora = (iso: string) => {
  const l = local(iso);
  return `${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
};

function obsDoDia(d: ApuracaoDia): string {
  const p = d.previsto;
  if (d.situacao === "fora_contrato") return "";
  if (p.feriado && p.folga && !d.marcacoes.length) return "Feriado";
  if (p.origem === "ausencia" && p.ausencia) return AUSENCIA_LABEL[p.ausencia.tipo];
  if (d.situacao === "compensacao") return AUSENCIA_LABEL.folga_compensatoria;
  return "";
}

export function linhaFolha(d: ApuracaoDia): LinhaFolha {
  const ms = d.marcacoes.map((m) => `${hora(m.momento)}${m.origem === "ajuste" ? "*" : ""}`);
  const dow = diaSemana(d.data);
  return {
    data: d.data,
    dia: DIA_FOLHA[dow],
    obs: obsDoDia(d),
    normais: [ms[0] ?? "", ms[1] ?? "", ms[2] ?? "", ms[3] ?? ""],
    extras: [ms[4] ?? "", ms.slice(5).join(" ")],
    normaisH: h(d.trabalhado - d.extra),
    extraTot: h(d.extra),
    extra50: h(d.extra - d.extra100),
    extra100: h(d.extra100),
    noturno: h(d.noturno),
    carga: h(d.previsto.minutos),
    descanso: !ms.length && (dow === 0 || (d.previsto.folga && d.situacao !== "futuro" && d.situacao !== "fora_contrato")),
  };
}

export type HorarioSemana = { dia: string; horarios: [string, string, string, string] };

/**
 * Quadro "Ent 1 · Sai 1 · Ent 2 · Sai 2" por dia da semana, tirado do que a jornada previu no período (o primeiro
 * dia de cada dia da semana que veio da jornada). Dia de folga = "-"; dia da semana que não apareceu no período = vazio.
 */
export function horariosDaSemana(dias: ApuracaoDia[]): HorarioSemana[] {
  const f = (t: string | null) => (hm(t) === null ? "" : t!.slice(0, 5));
  return DIA_CURTO.map((dia, dow) => {
    const d = dias.find((x) => diaSemana(x.data) === dow && (x.previsto.origem === "jornada" || x.previsto.origem === "feriado" || (x.previsto.origem === "ausencia" && x.previsto.horarios)));
    if (!d) return { dia, horarios: ["", "", "", ""] };
    const hs: Horarios | null = d.previsto.horarios;
    if (!hs || d.previsto.origem === "feriado") {
      // feriado cai em cima da jornada: tenta outro dia igual da semana com jornada
      const outro = dias.find((x) => diaSemana(x.data) === dow && x.previsto.origem === "jornada");
      const h2 = outro?.previsto.horarios;
      return { dia, horarios: h2 ? [f(h2.entrada), f(h2.intervalo_inicio), f(h2.intervalo_fim), f(h2.saida)] : ["-", "-", "-", "-"] };
    }
    return { dia, horarios: [f(hs.entrada), f(hs.intervalo_inicio), f(hs.intervalo_fim), f(hs.saida)] };
  });
}

export type FolhaMontada = {
  linhas: LinhaFolha[];
  semana: HorarioSemana[];
  totais: { normaisH: string; extraTot: string; extra50: string; extra100: string; noturno: string; carga: string };
};

/** Linhas da folha de um funcionário no período (todos os dias, inclusive domingos, feriados e dias sem marcação). */
export function montarFolha(dias: ApuracaoDia[], t: TotaisPeriodo): FolhaMontada {
  const z = (min: number) => hhmmFolha(Math.max(0, min));
  return {
    linhas: dias.map(linhaFolha),
    semana: horariosDaSemana(dias),
    totais: { normaisH: z(t.trabalhado - t.extra), extraTot: z(t.extra), extra50: z(t.extra - t.extra100), extra100: z(t.extra100), noturno: z(t.noturno), carga: z(t.previsto) },
  };
}
