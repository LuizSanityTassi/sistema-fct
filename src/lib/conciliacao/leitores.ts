// Leitura dos arquivos da conciliação NO SERVIDOR:
//  • .RET do Itaú (CNAB 240, DDA) — texto latin1
//  • planilha "Boletos Recebidos" do portal Itaú (.xlsx)
//  • relatório "Contas a Pagar ou Pagas" do Trier (PDF, ou XLS/XLSX com Saída = XLS)
// A regra de negócio é toda do motor (motor.js); aqui só se converte bytes em linhas/matrizes.
import * as XLSX from "xlsx";
import { Motor, type ArquivoDDA, type ResultadoTrier } from "./motor";

export type TipoArquivoConciliacao = "dda_ret" | "dda_planilha" | "trier";

const ehZip = (b: Buffer) => b.length > 1 && b[0] === 0x50 && b[1] === 0x4b;
const ehXlsAntigo = (b: Buffer) => b.length > 1 && b[0] === 0xd0 && b[1] === 0xcf;
const ehPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const ehPlanilha = (b: Buffer) => ehZip(b) || ehXlsAntigo(b);
const ehRet = (b: Buffer) => b.subarray(0, 3).toString("latin1") === "341";

function planilhaParaMatriz(buf: Buffer, opcoes: XLSX.Sheet2JSONOpts = {}) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  return wb.SheetNames.map((n) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, ...opcoes }));
}

/** Decide o tipo pelo conteúdo: .RET (começa com 341), planilha do portal (tem "Beneficiário" e "Código de barras") ou Trier. */
export function detectarTipo(nome: string, buf: Buffer): TipoArquivoConciliacao {
  if (ehRet(buf) || /\.ret$/i.test(nome)) return "dda_ret";
  if (ehPdf(buf)) return "trier";
  if (ehPlanilha(buf)) {
    const primeira = planilhaParaMatriz(buf)[0] ?? [];
    const temPortal = primeira.some(
      (r) => Array.isArray(r) && r.some((c) => /benefici/i.test(String(c ?? ""))) && r.some((c) => /digo de barras/i.test(String(c ?? ""))),
    );
    return temPortal ? "dda_planilha" : "trier";
  }
  throw new Error(`${nome}: tipo de arquivo não reconhecido (esperado .RET do Itaú, planilha do portal ou relatório do Trier).`);
}

/** Arquivo do Itaú (.RET ou planilha do portal) → títulos do DDA. */
export function lerDDA(nome: string, buf: Buffer): ArquivoDDA {
  if (ehPlanilha(buf)) return Motor.parseItauPlanilha(planilhaParaMatriz(buf)[0] ?? [], nome);
  return Motor.parseRET(buf.toString("latin1"), nome);
}

/** Relatório do Trier (PDF ou planilha) → títulos a pagar. */
export async function lerTrier(nome: string, buf: Buffer): Promise<ResultadoTrier> {
  if (ehPlanilha(buf)) {
    const linhas = planilhaParaMatriz(buf, { defval: "" }).flatMap((rows) => Motor.linhasDeTrierPlanilha(rows));
    const tr = Motor.parseTrier(linhas);
    if (!tr.titulos.length) {
      throw new Error(`${nome}: não encontrei títulos nessa planilha. Use o relatório "Contas a Pagar ou Pagas", Seleção III = Detalhado, Saída = XLS.`);
    }
    return tr;
  }
  if (!ehPdf(buf)) throw new Error(`${nome}: o relatório do Trier precisa ser PDF ou planilha (XLS/XLSX).`);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const tarefa = pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, disableFontFace: true });
  const doc = await tarefa.promise;
  const linhas: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const texto = await pagina.getTextContent();
      linhas.push(...Motor.linhasDeItens(Motor.itensDaPagina(pdfjs, pagina, texto)));
      pagina.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }
  const tr = Motor.parseTrier(linhas);
  if (!tr.titulos.length) throw new Error(`${nome}: não encontrei títulos. Confira se é o relatório "Contas a Pagar ou Pagas" no modo detalhado.`);
  return tr;
}

/** Filial de um arquivo pelo nome ("out, nov, dez 421.xlsx" → 421), entre os códigos conhecidos. */
export function filialDoNome(nome: string, codigosConhecidos: number[]) {
  // só números de exatamente 3 dígitos ("2026" não vira 202)
  const numeros = (nome.replace(/\.[^.]+$/, "").match(/(?<!\d)\d{3}(?!\d)/g) ?? []).map(Number);
  return numeros.find((n) => codigosConhecidos.includes(n)) ?? null;
}
