// Competência da folha no formato "AAAA-MM". Módulo puro (usado em server e client).
export const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function competenciaAtual(data = new Date()) {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function competenciaValida(valor: string | undefined | null): valor is string {
  return !!valor && COMPETENCIA_RE.test(valor);
}

/**
 * Competência da quebra de caixa: do dia 21 do mês anterior ao dia 20 do mês (caixa de 20/10 → "2026-10";
 * de 21/10 → "2026-11"). A mesma regra da coluna caixa_diferencas.competencia no banco (migração 0054).
 */
export function competenciaDaQuebra(diaIso: string) {
  const comp = diaIso.slice(0, 7);
  return Number(diaIso.slice(8, 10)) >= 21 ? somarMeses(comp, 1) : comp;
}

/** Competência das quebras de hoje, no fuso de Brasília. */
export function competenciaQuebraAtual(agora = new Date()) {
  return competenciaDaQuebra(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora));
}

/** "2026-10" vira "21/09 a 20/10" (os dias de caixa que entram nessa competência). */
export function periodoDaQuebra(competencia: string) {
  return `21/${somarMeses(competencia, -1).slice(5)} a 20/${competencia.slice(5)}`;
}

/** "2026-10" vira "outubro de 2026". */
export function rotuloCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-");
  return `${MESES[Number(mes) - 1] ?? mes} de ${ano}`;
}

/** Soma meses a uma competência ("2026-01" com -1 vira "2025-12"). */
export function somarMeses(competencia: string, delta: number) {
  const [ano, mes] = competencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
