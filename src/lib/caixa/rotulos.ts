// Nomes e cores da situação de cada caixa (a mesma lógica da tela da Zanini, com o andamento da quebra).

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
  sem_diferenca: "border-slate-200 bg-slate-50 text-slate-700",
  tolerancia: "border-sky-200 bg-sky-50 text-sky-800",
  pendente: "border-amber-300 bg-amber-50 text-amber-900",
  justificada: "border-violet-200 bg-violet-50 text-violet-800",
  mantida: "border-red-200 bg-red-50 text-red-800",
  abonada: "border-emerald-200 bg-emerald-50 text-emerald-800",
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
