// Cores e nomes da gravidade (linguagem visual do sistema): vermelho crítico, laranja pendência, amarelo atenção,
// azul informação. As classes vêm dos tons centrais (src/lib/tons.ts).
import type { Pendencia, Severidade } from "@/lib/data/pendencias";
import { TOM, type Tom } from "@/lib/tons";

/** Disparado por uma tela que acabou de gerar um aviso: o sino busca de novo na hora. */
export const EVENTO_SINO = "fct:sino-atualizar";

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

// Os 4 níveis da central de prioridades (o que um gestor lê em segundos). Quem tem prazo correndo fica em "Vencendo";
// o resto segue a gravidade.
export type NivelPrioridade = "critico" | "atencao" | "vencendo" | "em_dia";
export const ORDEM_NIVEL: NivelPrioridade[] = ["critico", "atencao", "vencendo", "em_dia"];
export const ehNivel = (v: unknown): v is NivelPrioridade => ORDEM_NIVEL.includes(v as NivelPrioridade);
export const ROTULO_NIVEL: Record<NivelPrioridade, string> = { critico: "Crítico", atencao: "Atenção", vencendo: "Vencendo", em_dia: "Em dia" };
export const TOM_NIVEL: Record<NivelPrioridade, Tom> = { critico: "perigo", atencao: "alerta", vencendo: "atencao", em_dia: "sucesso" };
export const nivelDaPendencia = (p: Pick<Pendencia, "severidade" | "prazo">): NivelPrioridade => (p.prazo === "vencendo" ? "vencendo" : p.severidade === "critico" ? "critico" : "atencao");
