import type { Tom } from "@/lib/tons";
import { AUSENCIA_LABEL, hm, local, SITUACAO_DIA_LABEL, type ApuracaoDia, type SituacaoDia } from "./calculo";

export type Agora = "trabalhando" | "intervalo" | "saiu" | "ausente" | "nao_marcou" | "vai_entrar" | "folga" | "sem_jornada" | "fora";

/** Situação do funcionário AGORA, a partir da apuração de hoje. */
export function situacaoAgora(dia: ApuracaoDia, agora = new Date()): { codigo: Agora; texto: string; tom: Tom } {
  const p = dia.previsto;
  const ms = dia.marcacoes;
  const h = (iso: string) => {
    const l = local(iso);
    return `${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
  };
  if (p.origem === "ausencia" && p.ausencia) return { codigo: "ausente", texto: AUSENCIA_LABEL[p.ausencia.tipo], tom: "destaque" };
  if (ms.length) {
    const ultima = ms[ms.length - 1];
    if (ultima.tipo === "intervalo_inicio") return { codigo: "intervalo", texto: `Em intervalo desde ${h(ultima.momento)}`, tom: "info" };
    if (ultima.tipo === "saida" || ultima.tipo === "saida_extra") return { codigo: "saiu", texto: `Saiu às ${h(ultima.momento)}`, tom: "neutro" };
    return { codigo: "trabalhando", texto: `Trabalhando desde ${h(ms[0].momento)}`, tom: "sucesso" };
  }
  if (p.origem === "fora_contrato") return { codigo: "fora", texto: "Fora do controle", tom: "neutro" };
  if (p.origem === "sem_jornada") return { codigo: "sem_jornada", texto: "Sem jornada", tom: "atencao" };
  if (p.minutos > 0 && p.horarios?.entrada) {
    const ent = hm(p.horarios.entrada)!;
    const agoraMin = local(agora.toISOString()).min;
    if (agoraMin > ent + 15) return { codigo: "nao_marcou", texto: `Não marcou (entrada ${p.horarios.entrada.slice(0, 5)})`, tom: "perigo" };
    return { codigo: "vai_entrar", texto: `Entra às ${p.horarios.entrada.slice(0, 5)}`, tom: "neutro" };
  }
  if (p.feriado) return { codigo: "folga", texto: `Feriado · ${p.feriado}`, tom: "neutro" };
  return { codigo: "folga", texto: "Folga", tom: "neutro" };
}

/** Tom de cada situação do dia (espelho e relatórios). */
export const TOM_SITUACAO: Record<SituacaoDia, Tom> = {
  futuro: "neutro",
  em_andamento: "info",
  ok: "sucesso",
  extra: "info",
  debito: "atencao",
  falta: "perigo",
  incompleto: "alerta",
  folga: "neutro",
  feriado: "neutro",
  ausencia: "destaque",
  compensacao: "destaque",
  sem_jornada: "atencao",
  fora_contrato: "neutro",
};

export function rotuloSituacao(dia: ApuracaoDia) {
  if (dia.situacao === "ausencia" && dia.previsto.ausencia) return AUSENCIA_LABEL[dia.previsto.ausencia.tipo];
  if (dia.situacao === "feriado" && dia.previsto.feriado) return dia.previsto.feriado;
  return SITUACAO_DIA_LABEL[dia.situacao];
}
