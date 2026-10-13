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
