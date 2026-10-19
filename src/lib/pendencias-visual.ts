// Cores e nomes da gravidade (linguagem visual do sistema): vermelho crítico, laranja pendência, amarelo atenção,
// azul informação. As classes vêm dos tons centrais (src/lib/tons.ts).
import type { Severidade } from "@/lib/data/pendencias";
import { TOM } from "@/lib/tons";

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  critico: "Crítico",
  alto: "Pendente",
  atencao: "Atenção",
  info: "Informação",
};

export const COR_SEVERIDADE: Record<Severidade, { borda: string; selo: string; ponto: string }> = {
  critico: { borda: "border-l-red-600", selo: TOM.perigo, ponto: "bg-red-600" },
  alto: { borda: "border-l-orange-500", selo: TOM.alerta, ponto: "bg-orange-500" },
  atencao: { borda: "border-l-amber-400", selo: TOM.atencao, ponto: "bg-amber-400" },
  info: { borda: "border-l-sky-500", selo: TOM.info, ponto: "bg-sky-500" },
};
