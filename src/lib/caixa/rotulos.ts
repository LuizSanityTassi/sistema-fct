// Nomes e cores da situação de cada caixa (a mesma lógica da tela da Zanini, com o andamento da quebra).
import { TOM } from "@/lib/tons";

export type ClasseCaixa = "sem_diferenca" | "tolerancia" | "quebra";
export type AndamentoQuebra = "pendente" | "justificada" | "mantida" | "abonada";
export type SituacaoCaixa = "sem_diferenca" | "tolerancia" | AndamentoQuebra;

/** Situação mostrada: sem diferença e tolerância valem pela classe; a quebra, pelo andamento. */
export const situacaoDoCaixa = (classe: string, andamento: string): SituacaoCaixa =>
  classe === "quebra" ? (["pendente", "justificada", "mantida", "abonada"].includes(andamento) ? (andamento as AndamentoQuebra) : "pendente") : classe === "tolerancia" ? "tolerancia" : "sem_diferenca";

export const ROTULO_SITUACAO: Record<SituacaoCaixa, string> = {
  sem_diferenca: "Sem diferença",
  tolerancia: "Tolerância (até R$ 2,00)",
  pendente: "Quebra — aguardando justificativa",
  justificada: "Quebra — justificada, aguardando o financeiro",
  mantida: "Quebra — desconto mantido",
  abonada: "Quebra — abonada",
};

export const ROTULO_CURTO: Record<SituacaoCaixa, string> = {
  sem_diferenca: "Sem diferença",
  tolerancia: "Tolerância",
  pendente: "Aguardando justificativa",
  justificada: "Justificada",
  mantida: "Desconto mantido",
  abonada: "Abonada",
};

export const COR_SITUACAO: Record<SituacaoCaixa, string> = {
  sem_diferenca: TOM.neutro,
  tolerancia: TOM.info,
  pendente: TOM.atencao,
  justificada: TOM.destaque,
  mantida: TOM.perigo,
  abonada: TOM.sucesso,
};

export const FILTROS_SITUACAO = [
  { valor: "", rotulo: "Todas as situações" },
  { valor: "quebras", rotulo: "Todas as quebras (acima de R$ 2,00)" },
  { valor: "pendente", rotulo: "Aguardando justificativa" },
  { valor: "justificada", rotulo: "Justificadas (aguardando decisão)" },
  { valor: "mantida", rotulo: "Desconto mantido" },
  { valor: "abonada", rotulo: "Abonadas" },
  { valor: "tolerancia", rotulo: "Tolerância (até R$ 2,00)" },
  { valor: "sem_diferenca", rotulo: "Sem diferença" },
] as const;

/** "Falta R$ 68,10" / "Sobra R$ 0,33" / "—". */
export function textoDiferenca(diferenca: number) {
  const v = Math.abs(diferenca).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (Math.abs(diferenca) < 0.005) return "—";
  return diferenca > 0 ? `Falta ${v}` : `Sobra ${v}`;
}
