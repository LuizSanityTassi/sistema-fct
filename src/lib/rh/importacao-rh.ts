// Leitura da planilha que o RH preenche durante o mês ("LANÇAMENTOS FOLHA - …", Google Planilhas exportado
// em .xlsx) — só servidor. Uma aba por empresa e mês, com o mês no nome ("VARELA 092026", "Nazario 102026"):
//   • lançamentos: NOME · FUNÇÃO · EXTRA 50% · EXTRA 60% · EXTRA 75% · EXTRA 100% · ADC NOT · FALTA · REEMBOLSOS,
//     valores em texto livre ("9,58 100", "19,32 adc"); quando o Excel/Sheets transforma "12.03 60" em data
//     (12/03/1960), o valor é recuperado (12,03) e marcado para conferência;
//   • quebra de caixa ("QC …"): Código · Nome · CPF · Fichamento · Filial, e abaixo de cada pessoa a linha TOTAL.
// O CPF da aba de quebra não é lido nem guardado: o funcionário é encontrado pelo nome.
import * as XLSX from "xlsx";
import { normalizarNome } from "./lancamentos";

export type AbaLida = { nome: string; tipo: "lancamentos" | "quebra"; linhas: number };

export type ValorLido = {
  aba: string;
  linha: number;
  nome: string;
  funcao: string | null;
  /** chave do evento (folha_eventos.chave) */
  chave: string;
  valor: number;
  original: string;
  aviso: string | null;
};

export type ObsLida = { aba: string; linha: number; nome: string; funcao: string | null; texto: string; pendente: boolean };

export type LeituraRh = { abas: AbaLida[]; abasIgnoradas: string[]; valores: ValorLido[]; observacoes: ObsLida[] };

const COLUNAS: Array<{ re: RegExp; chave: string; pct?: number; rotulo: string }> = [
  { re: /^EXTRA\s*50/, chave: "he50", pct: 50, rotulo: "Extra 50%" },
  { re: /^EXTRA\s*60/, chave: "he60", pct: 60, rotulo: "Extra 60%" },
  { re: /^EXTRA\s*75/, chave: "he75", pct: 75, rotulo: "Extra 75%" },
  { re: /^EXTRA\s*100/, chave: "he100", pct: 100, rotulo: "Extra 100%" },
  { re: /^ADC\s*NOT/, chave: "adc_noturno", rotulo: "Adicional noturno" },
];

const textoCelula = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
/** Cabeçalho comparável: sem acento, maiúsculo, mantendo letras e números ("EXTRA 50%" → "EXTRA 50"). */
const cabecalho = (v: unknown) =>
  textoCelula(v)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const arred = (v: number) => Math.round(v * 100) / 100;

/** Mês da aba pelo nome: "VARELA 092026", "Varela 04.2026", "LANÇAMENTOS FOLHA 122025" → "2026-09"… */
export function competenciaDaAba(nome: string): string | null {
  const m = nome.match(/(?:^|\D)(0[1-9]|1[0-2])[.\-/ ]?(20\d{2})(?:\D|$)/);
  return m ? `${m[2]}-${m[1]}` : null;
}

/** Número que virou data no Excel/Sheets ("12.03 60" → 12/03/1960): dia,mês viram o valor. */
function dataVirouValor(serial: number) {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d || !d.d || !d.m) return null;
  return { valor: arred(d.d + d.m / 100), data: `${String(d.d).padStart(2, "0")}/${String(d.m).padStart(2, "0")}/${d.y}` };
}

/** Valor de uma célula de horas da planilha do RH. null = vazia. */
export function lerCelulaHoras(v: unknown, coluna: { pct?: number; chave: string }): { valor: number; original: string; aviso: string | null } | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v >= 10_000) {
      const r = dataVirouValor(v);
      if (!r) return { valor: 0, original: String(v), aviso: "número não reconhecido" };
      return { valor: r.valor, original: r.data, aviso: `a célula virou data (${r.data}); lido como ${r.valor.toLocaleString("pt-BR")} — confira` };
    }
    return { valor: arred(v), original: String(v), aviso: null };
  }
  const original = textoCelula(v);
  const m = original.match(/(\d+)(?:\s*[,.:h]\s*(\d+))?/i);
  if (!m) return { valor: 0, original, aviso: "sem número" };
  const valor = arred(Number(m[2] ? `${m[1]}.${m[2]}` : m[1]));
  const resto = original.slice((m.index ?? 0) + m[0].length).toLowerCase();
  let aviso: string | null = null;
  const pctTexto = resto.match(/\d+/)?.[0];
  if (coluna.pct && pctTexto && Number(pctTexto) !== coluna.pct) aviso = `percentual "${pctTexto}" diferente da coluna (${coluna.pct}%) — confira`;
  if (coluna.chave !== "adc_noturno" && /adc|not/.test(resto)) aviso = "marcado como adicional noturno numa coluna de hora extra — confira";
  return { valor, original, aviso };
}

/** Valor em reais da linha TOTAL da quebra de caixa ("414.65", 72.5, "1.234,56"). */
export function lerValorQuebra(v: unknown): { valor: number; original: string; aviso: string | null } | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    if (v >= 10_000) {
      const r = dataVirouValor(v);
      if (!r) return { valor: 0, original: String(v), aviso: "número não reconhecido" };
      return { valor: r.valor, original: r.data, aviso: `a célula virou data (${r.data}); lido como R$ ${r.valor.toLocaleString("pt-BR")} — confira no relatório de quebra` };
    }
    return { valor: arred(v), original: String(v), aviso: null };
  }
  let s = textoCelula(v).replace(/[R$\s]/g, "");
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? { valor: arred(n), original: textoCelula(v), aviso: null } : { valor: 0, original: textoCelula(v), aviso: "valor não reconhecido" };
}

function lerAbaLancamentos(aba: string, rows: unknown[][], linhaCab: number, saida: LeituraRh) {
  const cab = rows[linhaCab].map(cabecalho);
  const iNome = cab.indexOf("NOME");
  const iFuncao = cab.findIndex((c) => c.startsWith("FUNC"));
  const iFalta = cab.findIndex((c) => c.startsWith("FALTA"));
  const iReemb = cab.findIndex((c) => c.startsWith("REEMBOLS"));
  const cols = COLUNAS.map((c) => ({ ...c, i: cab.findIndex((h) => c.re.test(h)) })).filter((c) => c.i >= 0);
  let linhas = 0;
  for (let r = linhaCab + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const nome = textoCelula(row[iNome]);
    if (!nome || normalizarNome(nome).length < 5) continue;
    linhas++;
    const funcao = iFuncao >= 0 ? textoCelula(row[iFuncao]) || null : null;
    for (const c of cols) {
      const lido = lerCelulaHoras(row[c.i], c);
      if (!lido) continue;
      if (lido.valor <= 0) {
        saida.observacoes.push({ aba, linha: r + 1, nome, funcao, texto: `${c.rotulo} na planilha do RH: "${lido.original}" (${lido.aviso ?? "sem valor"})`, pendente: true });
        continue;
      }
      saida.valores.push({ aba, linha: r + 1, nome, funcao, chave: c.chave, valor: lido.valor, original: lido.original, aviso: lido.aviso });
    }
    const falta = iFalta >= 0 ? textoCelula(row[iFalta]) : "";
    if (falta) saida.observacoes.push({ aba, linha: r + 1, nome, funcao, texto: `Falta no mês (planilha do RH: "${falta}"): lançar as horas em Faltas Parciais`, pendente: true });
    const reemb = iReemb >= 0 ? textoCelula(row[iReemb]) : "";
    if (reemb) saida.observacoes.push({ aba, linha: r + 1, nome, funcao, texto: `Reembolsos: ${reemb}`, pendente: true });
  }
  saida.abas.push({ nome: aba, tipo: "lancamentos", linhas });
}

function lerAbaQuebra(aba: string, rows: unknown[][], linhaCab: number, saida: LeituraRh) {
  const cab = rows[linhaCab].map(cabecalho);
  const iNome = cab.indexOf("NOME");
  let atual: { nome: string; linha: number } | null = null;
  let linhas = 0;
  for (let r = linhaCab + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const iTotal = row.findIndex((v) => cabecalho(v) === "TOTAL");
    if (iTotal >= 0) {
      if (!atual) continue;
      const bruto = row.slice(iTotal + 1).find((v) => v !== null && v !== undefined && v !== "");
      const lido = lerValorQuebra(bruto);
      if (lido && lido.valor > 0) saida.valores.push({ aba, linha: r + 1, nome: atual.nome, funcao: null, chave: "quebra_caixa", valor: lido.valor, original: lido.original, aviso: lido.aviso });
      atual = null;
      continue;
    }
    const nome = textoCelula(row[iNome]);
    if (nome && normalizarNome(nome).length >= 5) {
      atual = { nome, linha: r + 1 };
      linhas++;
    }
  }
  saida.abas.push({ nome: aba, tipo: "quebra", linhas });
}

/** Lê as abas do mês pedido. Abas sem mês no nome só entram quando o arquivo tem uma aba só. */
export function lerPlanilhaRh(buffer: ArrayBuffer | Buffer, competencia: string): LeituraRh {
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? "buffer" : "array", cellDates: false, cellFormula: false, cellHTML: false });
  const saida: LeituraRh = { abas: [], abasIgnoradas: [], valores: [], observacoes: [] };
  for (const aba of wb.SheetNames) {
    const mes = competenciaDaAba(aba);
    if (mes ? mes !== competencia : wb.SheetNames.length > 1) continue;
    const ws = wb.Sheets[aba];
    if (!ws || !ws["!ref"]) {
      saida.abasIgnoradas.push(`${aba} (vazia)`);
      continue;
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
    let feito = false;
    for (let r = 0; r < Math.min(rows.length, 8) && !feito; r++) {
      const cab = (rows[r] ?? []).map(cabecalho);
      if (!cab.includes("NOME")) continue;
      if (cab.some((c) => c.startsWith("EXTRA") || c.startsWith("ADC NOT"))) {
        lerAbaLancamentos(aba, rows, r, saida);
        feito = true;
      } else if (cab.some((c) => c === "CPF" || c.startsWith("FICHAMENTO") || c === "FILIAL")) {
        lerAbaQuebra(aba, rows, r, saida);
        feito = true;
      }
    }
    if (!feito) saida.abasIgnoradas.push(`${aba} (formato não reconhecido)`);
  }
  return saida;
}
