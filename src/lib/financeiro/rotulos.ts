// Rótulos e constantes do módulo financeiro. Módulo puro (serve a server e client components).
import type { Enums } from "@/lib/tipos";

export type FinTipo = Enums["fin_tipo"];
export type FinOrigem = Enums["fin_origem"];

export const TIPOS_FIN: FinTipo[] = ["receber", "pagar"];
export const TIPO_FIN_LABEL: Record<FinTipo, string> = { receber: "Receber", pagar: "Pagar" };
/** Nome do agregado: receitas (receber) e despesas (pagar). */
export const TIPO_FIN_PLURAL: Record<FinTipo, string> = { receber: "Receitas", pagar: "Despesas" };
export const ORIGEM_FIN_LABEL: Record<FinOrigem, string> = { manual: "Manual", omie: "Omie", migracao: "Migração" };

/** Grupos como a diretoria acompanha o caixa (empresa + regionais destacadas). */
export const GRUPOS_FINANCEIROS = ["VARELA", "ITAJAÍ", "NAZÁRIO", "BLUMENAU"] as const;
export type GrupoFinanceiro = (typeof GRUPOS_FINANCEIROS)[number];

export function ehGrupoFinanceiro(v: unknown): v is GrupoFinanceiro {
  return typeof v === "string" && (GRUPOS_FINANCEIROS as readonly string[]).includes(v);
}
export function ehTipoFin(v: unknown): v is FinTipo {
  return v === "receber" || v === "pagar";
}
export function ehOrigemFin(v: unknown): v is FinOrigem {
  return v === "manual" || v === "omie" || v === "migracao";
}

/** Ordem dos grupos nas tabelas: os conhecidos primeiro, o resto em ordem alfabética. */
export function ordemGrupo(a: string, b: string) {
  const ia = (GRUPOS_FINANCEIROS as readonly string[]).indexOf(a);
  const ib = (GRUPOS_FINANCEIROS as readonly string[]).indexOf(b);
  if (ia === -1 && ib === -1) return a.localeCompare(b, "pt-BR");
  if (ia === -1) return 1;
  if (ib === -1) return -1;
  return ia - ib;
}

export const DRE_SINAL_LABEL: Record<"1" | "-1", string> = { "1": "Soma (+)", "-1": "Subtrai (−)" };
