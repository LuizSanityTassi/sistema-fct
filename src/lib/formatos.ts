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

function dataUtc(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Anos completos desde a data (ex.: idade). */
export function anosDesde(iso: string | null | undefined, ate = new Date()) {
  const d = iso ? dataUtc(iso) : null;
  if (!d) return null;
  let anos = ate.getUTCFullYear() - d.getUTCFullYear();
  const meses = ate.getUTCMonth() - d.getUTCMonth();
  if (meses < 0 || (meses === 0 && ate.getUTCDate() < d.getUTCDate())) anos -= 1;
  return anos;
}

/** "2 anos e 3 meses", "8 meses", "12 dias" — entre a data e hoje (ou `ate`). */
export function descreverPeriodo(iso: string | null | undefined, ate = new Date()) {
  const d = iso ? dataUtc(iso) : null;
  if (!d || d > ate) return null;
  let anos = ate.getUTCFullYear() - d.getUTCFullYear();
  let meses = ate.getUTCMonth() - d.getUTCMonth();
  if (ate.getUTCDate() < d.getUTCDate()) meses -= 1;
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  if (anos === 0 && meses === 0) {
    const dias = Math.floor((ate.getTime() - d.getTime()) / 86_400_000);
    return dias === 0 ? "menos de 1 dia" : pluralizar(dias, "dia", "dias");
  }
  const partes: string[] = [];
  if (anos > 0) partes.push(pluralizar(anos, "ano", "anos"));
  if (meses > 0) partes.push(pluralizar(meses, "mês", "meses"));
  return partes.join(" e ");
}

/** Converte "2.022,02", "2022,02" ou "2022.02" em número; null se inválido. */
export function lerDecimal(valor: string) {
  const t = valor.trim();
  if (!t) return null;
  const normalizado = /,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

export function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}
