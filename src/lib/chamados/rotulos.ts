// Rótulos e regras de transição dos chamados. Módulo puro (server e client).
import type { Enums } from "@/lib/tipos";

export type CategoriaChamado = Enums["ticket_category"];
export type PrioridadeChamado = Enums["ticket_priority"];
export type StatusChamado = Enums["ticket_status"];

export const CATEGORIA_CHAMADO_LABEL: Record<CategoriaChamado, string> = {
  ti: "TI",
  rh: "RH",
  financeiro: "Financeiro",
  manutencao: "Manutenção",
  compras: "Compras",
  marketing: "Marketing",
  outros: "Outros",
};

export const PRIORIDADE_LABEL: Record<PrioridadeChamado, string> = {
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  critica: "Crítica",
};

export const STATUS_CHAMADO_LABEL: Record<StatusChamado, string> = {
  aberto: "Novo",
  em_analise: "Triagem",
  em_atendimento: "Em atendimento",
  aguardando_usuario: "Aguardando solicitante",
  aguardando_terceiro: "Aguardando terceiro",
  resolvido: "Resolvido",
  cancelado: "Cancelado",
};

export const STATUS_ENCERRADOS: StatusChamado[] = ["resolvido", "cancelado"];

/** Para onde cada status pode ir (atendentes). Solicitante só cancela (aberto) ou reabre (encerrado). */
export const TRANSICOES: Record<StatusChamado, StatusChamado[]> = {
  aberto: ["em_analise", "em_atendimento", "cancelado"],
  em_analise: ["em_atendimento", "aguardando_usuario", "aguardando_terceiro", "resolvido", "cancelado"],
  em_atendimento: ["aguardando_usuario", "aguardando_terceiro", "resolvido", "cancelado"],
  aguardando_usuario: ["em_atendimento", "resolvido", "cancelado"],
  aguardando_terceiro: ["em_atendimento", "resolvido", "cancelado"],
  resolvido: ["aberto"],
  cancelado: ["aberto"],
};

export const TRANSICOES_SOLICITANTE: Record<StatusChamado, StatusChamado[]> = {
  aberto: ["cancelado"],
  em_analise: [],
  em_atendimento: [],
  aguardando_usuario: [],
  aguardando_terceiro: [],
  resolvido: ["aberto"],
  cancelado: ["aberto"],
};

/** Papéis que atendem cada categoria (além do admin e do responsável). */
export function papelAtende(papel: string, categoria: CategoriaChamado) {
  if (papel === "admin") return true;
  if (categoria === "rh") return papel === "rh";
  if (categoria === "financeiro") return papel === "financeiro" || papel === "ti";
  // setores com perfil próprio atendem os seus; a TI continua de reserva
  if (categoria === "manutencao") return papel === "manutencao" || papel === "ti";
  if (categoria === "compras") return papel === "compras" || papel === "ti";
  if (categoria === "marketing") return papel === "marketing" || papel === "ti";
  return papel === "ti";
}

/** Trilho do chamado (as duas esperas são etapas laterais de "Em atendimento"). */
export const ETAPAS_CHAMADO: StatusChamado[] = ["aberto", "em_analise", "em_atendimento", "resolvido"];
