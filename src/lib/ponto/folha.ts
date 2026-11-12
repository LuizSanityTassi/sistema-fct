// Folha para assinatura (cartão de ponto do período): funções puras sobre a apuração do módulo. Não calcula nada
// novo — extras 50%/100%, débito, noturno e carga vêm de lib/ponto/calculo.ts, as mesmas contas do espelho e dos
// relatórios.
import { AUSENCIA_LABEL, DIAS_SEMANA, diaSemana, duracao, local, type ApuracaoDia, type TotaisPeriodo } from "./calculo";

export type LinhaFolha = {
  data: string;
  /** Segunda, Terça… */
  dia: string;
  /** horas das marcações do dia, na ordem (ajuste aprovado = "*" no fim) */
  marcas: string[];
  /** no lugar das marcações, quando não há nenhuma: "Domingo", "Feriado · Finados", "Férias", "Folga"… */
  texto: string;
  extra50: string;
  extra100: string;
  faltaAtraso: string;
  noturno: string;
  carga: string;
  /** linha sombreada (domingo, feriado, folga, ausência) ou destacada (falta) */
  tom: "normal" | "descanso" | "falta";
};

const h = (min: number) => (min ? duracao(min) : "");
const hora = (iso: string) => {
  const l = local(iso);
  return `${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
};

/** O que escrever no lugar das marcações num dia sem nenhuma. */
function textoDoDia(d: ApuracaoDia): string {
  const p = d.previsto;
  if (d.situacao === "fora_contrato" || d.situacao === "futuro" || d.situacao === "em_andamento") return "";
  if (p.feriado && p.folga) return `Feriado · ${p.feriado}`;
  if (p.origem === "ausencia" && p.ausencia) return AUSENCIA_LABEL[p.ausencia.tipo];
  if (d.situacao === "compensacao") return AUSENCIA_LABEL.folga_compensatoria;
  if (diaSemana(d.data) === 0) return "Domingo";
  if (d.situacao === "falta") return "";
  if (d.situacao === "sem_jornada") return "";
  if (p.folga) return "Folga";
  return "";
}

export function linhaFolha(d: ApuracaoDia): LinhaFolha {
  const marcas = d.marcacoes.map((m) => `${hora(m.momento)}${m.origem === "ajuste" ? "*" : ""}`);
  const faltaAtraso = d.falta ? "Falta" : d.situacao === "incompleto" ? "Incompleto" : h(d.debito);
  const tom: LinhaFolha["tom"] = d.situacao === "falta" ? "falta" : !marcas.length && (d.previsto.folga || diaSemana(d.data) === 0) && d.situacao !== "futuro" && d.situacao !== "fora_contrato" ? "descanso" : "normal";
  return {
    data: d.data,
    dia: DIAS_SEMANA[diaSemana(d.data)],
    marcas,
    texto: marcas.length ? "" : textoDoDia(d),
    extra50: h(d.extra - d.extra100),
    extra100: h(d.extra100),
    faltaAtraso,
    noturno: h(d.noturno),
    carga: h(d.trabalhado),
    tom,
  };
}

export type FolhaMontada = {
  linhas: LinhaFolha[];
  /** 2 ou 3 pares Ent./Saí. (3 quando algum dia tem mais de 4 marcações: extra liberada) */
  pares: 2 | 3;
  totais: { extra50: string; extra100: string; faltaAtraso: string; noturno: string; carga: string; faltas: number; atrasos: number; diasTrabalhados: number; previsto: string; saldo: number };
};

/** Linhas da folha de um funcionário no período (todos os dias, inclusive domingos, feriados e dias sem marcação). */
export function montarFolha(dias: ApuracaoDia[], t: TotaisPeriodo): FolhaMontada {
  const linhas = dias.map(linhaFolha);
  const maximo = Math.max(0, ...linhas.map((l) => l.marcas.length));
  return {
    linhas,
    pares: maximo > 4 ? 3 : 2,
    totais: {
      extra50: h(t.extra - t.extra100),
      extra100: h(t.extra100),
      faltaAtraso: h(t.debito),
      noturno: h(t.noturno),
      carga: h(t.trabalhado),
      faltas: t.faltas,
      atrasos: t.atrasos,
      diasTrabalhados: t.diasTrabalhados,
      previsto: h(t.previsto),
      saldo: t.saldo,
    },
  };
}
