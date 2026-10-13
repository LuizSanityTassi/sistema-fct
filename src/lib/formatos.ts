// Formatação pt-BR usada nas telas.

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Datas "AAAA-MM-DD" (sem hora) viram dd/mm/aaaa sem deslocamento de fuso. */
export function formatarData(valor: string | null | undefined) {
  if (!valor) return "—";
  const d = new Date(valor.length === 10 ? `${valor}T00:00:00Z` : valor);
  return Number.isNaN(d.getTime()) ? "—" : dataCurta.format(d);
}

export function formatarDataHora(valor: string | null | undefined) {
  if (!valor) return "—";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "—" : dataHora.format(d);
}

export function formatarMoeda(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  return Number.isFinite(n) ? moeda.format(n) : "—";
}

export function pluralizar(n: number, singular: string, plural: string) {
  return `${n} ${n === 1 ? singular : plural}`;
}
