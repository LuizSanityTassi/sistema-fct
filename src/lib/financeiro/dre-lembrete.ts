// Lembrete no sino da DRE do contador (puro, sem banco): a DRE de um mês chega no mês seguinte; a partir do dia
// combinado, se o mês anterior ainda não foi importado para uma empresa, o sino avisa quem importa.
import { somarMeses } from "@/lib/rh/competencia";

export const CHAVE_LEMBRETE_DRE = "dre_lembrete";
export const DIA_PADRAO_LEMBRETE_DRE = 15;

export type LembreteDre = { ligado: boolean; dia: number };

/** Configuração gravada em sistema_config (sem ela: ligado, dia 15). */
export function lerLembreteDre(valor: unknown): LembreteDre {
  const v = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const dia = Number(v.dia);
  return { ligado: v.ligado !== false, dia: Number.isInteger(dia) && dia >= 1 && dia <= 28 ? dia : DIA_PADRAO_LEMBRETE_DRE };
}

/**
 * Meses que já deviam ter chegado e não foram importados para a empresa, do mais antigo ao mais recente. `hoje` é a
 * data em Brasília (aaaa-mm-dd); `meses` são os meses importados (aaaa-mm). Antes do dia combinado, o mês anterior
 * ainda não conta como atrasado. Empresa sem nenhum mês importado não entra (não há de onde contar).
 */
export function mesesAtrasadosDre(meses: string[], hoje: string, config: LembreteDre): string[] {
  if (!config.ligado || !meses.length) return [];
  const mesAtual = hoje.slice(0, 7);
  const devido = somarMeses(mesAtual, Number(hoje.slice(8, 10)) >= config.dia ? -1 : -2);
  const ultimo = [...meses].sort().at(-1)!;
  const faltam: string[] = [];
  for (let m = somarMeses(ultimo, 1); m <= devido; m = somarMeses(m, 1)) faltam.push(m);
  return faltam;
}
