// SLA dos chamados (puro): prazo da primeira resposta por prioridade e a situação de cada chamado.
// Tempo corrido (não desconta noite nem fim de semana).
import type { PrioridadeChamado, StatusChamado } from "./rotulos";
import { STATUS_ENCERRADOS } from "./rotulos";
import { TOM } from "@/lib/tons";

/** Minutos para a primeira resposta de quem atende. */
export const SLA_PRIMEIRA_RESPOSTA_MIN: Record<PrioridadeChamado, number> = { critica: 30, alta: 120, normal: 480, baixa: 1440 };

/** "47 min", "1h32", "2d 3h". */
export function duracao(min: number) {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  const d = Math.floor(m / (24 * 60));
  const h = Math.floor((m % (24 * 60)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

export type EstadoSla = "no_prazo" | "perto" | "estourado" | "respondido" | "respondido_atrasado" | "encerrado";
export type SituacaoSla = { estado: EstadoSla; texto: string; prazoMin: number };

type ChamadoSla = { prioridade: PrioridadeChamado; status: StatusChamado; created_at: string; primeira_resposta_em: string | null };

/** Situação do SLA de primeira resposta agora. "Perto" = faltando um quarto do prazo ou menos. */
export function situacaoSla(c: ChamadoSla, agora = Date.now()): SituacaoSla {
  const prazoMin = SLA_PRIMEIRA_RESPOSTA_MIN[c.prioridade];
  const aberto = Date.parse(c.created_at);
  if (c.primeira_resposta_em) {
    const levou = (Date.parse(c.primeira_resposta_em) - aberto) / 60_000;
    return levou <= prazoMin ? { estado: "respondido", texto: `respondido em ${duracao(levou)}`, prazoMin } : { estado: "respondido_atrasado", texto: `respondido em ${duracao(levou)} (prazo ${duracao(prazoMin)})`, prazoMin };
  }
  if (STATUS_ENCERRADOS.includes(c.status)) return { estado: "encerrado", texto: "encerrado sem resposta", prazoMin };
  const restante = prazoMin - (agora - aberto) / 60_000;
  if (restante < 0) return { estado: "estourado", texto: `SLA estourado há ${duracao(-restante)}`, prazoMin };
  if (restante <= prazoMin / 4) return { estado: "perto", texto: `vence em ${duracao(restante)}`, prazoMin };
  return { estado: "no_prazo", texto: `responder em até ${duracao(restante)}`, prazoMin };
}

export const COR_SLA: Record<EstadoSla, string> = {
  no_prazo: TOM.info,
  perto: TOM.atencao,
  estourado: TOM.perigo,
  respondido: TOM.sucesso,
  respondido_atrasado: TOM.alerta,
  encerrado: TOM.neutro,
};

/** Filtro PostgREST: abertos, sem resposta e com o prazo vencido (para a lista e a central de pendências). */
export function filtroSlaEstourado(agora = Date.now()) {
  return (Object.entries(SLA_PRIMEIRA_RESPOSTA_MIN) as [PrioridadeChamado, number][])
    .map(([p, min]) => `and(prioridade.eq.${p},created_at.lt.${new Date(agora - min * 60_000).toISOString()})`)
    .join(",");
}
