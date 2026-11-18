// Ponto por filial: todos os colaboradores de uma filial lado a lado, com as marcações de cada dia do período.
// Só leitura; quem entra e o que cada papel vê vem das mesmas regras da folha para assinatura (ponto_equipe + RLS).
import type { Sessao } from "@/lib/auth/session";
import { diasEntre, hojeLocal, limitesMes, somarDias } from "@/lib/ponto/calculo";
import { lerData, lerUuid } from "./ponto";

export const ROTA_PONTO_FILIAL = "/ponto/filial";
/** A grade mostra até um mês de dias (uma coluna por dia). */
export const MAX_DIAS_GRADE = 31;

export type ParamsPontoFilial = { filial?: string; de: string; ate: string; cortado: boolean };

/**
 * Filial e período da URL. `mes=AAAA-MM` sem `de` abre o mês inteiro; sem nada, do dia 1º até hoje.
 * O gerente fica preso à filial dele.
 */
export function lerParamsPontoFilial(sp: Record<string, string | string[] | undefined>, sessao: Sessao, agora = new Date()): ParamsPontoFilial {
  const hoje = hojeLocal(agora);
  const mes = typeof sp.mes === "string" && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : undefined;
  let de: string;
  let ate: string;
  if (mes && !lerData(sp.de)) ({ de, ate } = limitesMes(mes));
  else {
    de = lerData(sp.de) ?? `${hoje.slice(0, 7)}-01`;
    ate = lerData(sp.ate) ?? hoje;
  }
  if (de > ate) [de, ate] = [ate, de];
  const cortado = diasEntre(de, ate) + 1 > MAX_DIAS_GRADE;
  if (cortado) ate = somarDias(de, MAX_DIAS_GRADE - 1);
  const pedida = lerUuid(sp.filial);
  const filial = sessao.papel === "gerente" ? (sessao.branchId ?? undefined) : (pedida ?? sessao.branchId ?? undefined);
  return { filial, de, ate, cortado };
}

/** Atalhos de período a partir do mês do `de`: mês inteiro, quinzenas e meses vizinhos. */
export function atalhosPeriodo(de: string) {
  const mes = de.slice(0, 7);
  const atual = limitesMes(mes);
  const anterior = limitesMes(somarDias(atual.de, -1).slice(0, 7));
  const proximo = limitesMes(somarDias(atual.ate, 1).slice(0, 7));
  return {
    mes,
    inteiro: atual,
    primeiraQuinzena: { de: atual.de, ate: `${mes}-15` },
    segundaQuinzena: { de: `${mes}-16`, ate: atual.ate },
    anterior,
    proximo,
  };
}

/** Competências (AAAA-MM-01) que o período toca, para checar fechamento. */
export function competenciasDoPeriodo(de: string, ate: string) {
  const out: string[] = [];
  for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarDias(limitesMes(m).ate, 1).slice(0, 7)) out.push(`${m}-01`);
  return out;
}
