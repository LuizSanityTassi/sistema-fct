// Cores e nomes da gravidade (linguagem visual do sistema): vermelho crítico, laranja pendência, amarelo atenção,
// azul informação. O amarelo institucional da FCT fica para os botões de ação.
import type { Severidade } from "@/lib/data/pendencias";

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  critico: "Crítico",
  alto: "Pendente",
  atencao: "Atenção",
  info: "Informação",
};

export const COR_SEVERIDADE: Record<Severidade, { borda: string; selo: string; ponto: string }> = {
  critico: { borda: "border-l-red-600", selo: "border-red-200 bg-red-50 text-red-800", ponto: "bg-red-600" },
  alto: { borda: "border-l-orange-500", selo: "border-orange-200 bg-orange-50 text-orange-800", ponto: "bg-orange-500" },
  atencao: { borda: "border-l-amber-400", selo: "border-amber-200 bg-amber-50 text-amber-900", ponto: "bg-amber-400" },
  info: { borda: "border-l-sky-500", selo: "border-sky-200 bg-sky-50 text-sky-800", ponto: "bg-sky-500" },
};
