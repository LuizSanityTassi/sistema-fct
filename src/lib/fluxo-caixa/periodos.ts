// Datas do fluxo de caixa (dia, semana de segunda a domingo, mês) sem fuso: tudo em aaaa-mm-dd, contas em UTC.

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const somaDias = (d: string, n: number) => iso(new Date(utc(d).getTime() + n * 86_400_000));
export const diaDaSemana = (d: string) => utc(d).getUTCDay(); // 0 = domingo
export const nomeDiaSemana = (d: string) => DIAS[diaDaSemana(d)];
export const fimDeSemana = (d: string) => diaDaSemana(d) === 0 || diaDaSemana(d) === 6;
export const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
export const ddmmaaaa = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

export function ultimoDia(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return iso(new Date(Date.UTC(a, m, 0)));
}

export function diasEntre(de: string, ate: string) {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somaDias(d, 1)) dias.push(d);
  return dias;
}

/** Segunda-feira da semana do dia. */
export const segunda = (d: string) => somaDias(d, -((diaDaSemana(d) + 6) % 7));

/** Semanas (segunda a domingo) que tocam o mês. */
export function semanasDoMes(mes: string) {
  const semanas: { de: string; ate: string }[] = [];
  for (let s = segunda(`${mes}-01`); s <= ultimoDia(mes); s = somaDias(s, 7)) semanas.push({ de: s, ate: somaDias(s, 6) });
  return semanas;
}

export const mesesDoAno = (ano: string) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
