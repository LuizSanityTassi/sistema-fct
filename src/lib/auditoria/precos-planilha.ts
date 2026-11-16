// Base de preços da auditoria de precificação: lê a planilha de produtos exportada do Trier (xlsx, xls ou csv) e acha
// sozinho as colunas de código reduzido, descrição, preço de venda e código de barras (opcional).
import * as XLSX from "xlsx";

export type ProdutoPreco = { codigo: string; descricao: string; preco: number; ean: string | null };
export type LeituraPrecos = { produtos: ProdutoPreco[]; colunas: string[]; aba: string; ignoradas: number; repetidos: number };

// relatório "xls" que na verdade é HTML pode vir com entidades (Pre&ccedil;o, A&Ccedil;&Uacute;CAR)
const MARCA: Record<string, string> = { acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", cedil: "\u0327", uml: "\u0308" };
const desentidade = (s: string) =>
  s.includes("&")
    ? s
        .replace(/&([a-zA-Z])(acute|grave|circ|tilde|cedil|uml);/g, (_, l: string, m: string) => l + MARCA[m])
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .normalize("NFC")
    : s;

const sem = (s: unknown) =>
  desentidade(String(s ?? ""))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Número em formato brasileiro ou já numérico ("1.234,56", "R$ 8,99", 8.99). */
function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(/,\d{1,4}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const codigoTexto = (v: unknown) => {
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : "";
  return String(v ?? "").trim();
};

type Mapa = { codigo: number; descricao: number; preco: number; ean: number };

function acharColunas(linha: unknown[]): Mapa | null {
  const h = linha.map(sem);
  const idx = (teste: (s: string) => boolean, evitar: number[] = []) => h.findIndex((s, i) => !!s && !evitar.includes(i) && teste(s));
  const ean = idx((s) => /barra|ean|gtin/.test(s));
  let codigo = idx((s) => /reduzido/.test(s), [ean]);
  if (codigo < 0) codigo = idx((s) => /^(cod|codigo|cod\.|cod produto|codigo produto|codigo interno|cod interno|cod\. produto)$/.test(s) || /^c[oó]d/.test(s), [ean]);
  const descricao = idx((s) => /descri|^produto$|^nome|nome do produto|^produto /.test(s), [codigo, ean]);
  let preco = idx((s) => /(preco|valor|vlr|pr\.?).*venda|venda.*(preco|valor)/.test(s), [codigo, ean, descricao]);
  if (preco < 0) preco = idx((s) => /^(preco|valor|vlr|pmc|preco atual|preco final|preco loja)$/.test(s) || (/preco|valor/.test(s) && !/custo|compra|promo|fabrica|pf\b/.test(s)), [codigo, ean, descricao]);
  if (codigo < 0 || descricao < 0 || preco < 0) return null;
  return { codigo, descricao, preco, ean };
}

/** Lê a primeira aba que tiver as colunas reconhecidas (o cabeçalho pode estar nas 40 primeiras linhas). */
export function lerPlanilhaPrecos(buf: Buffer): LeituraPrecos {
  // xlsx (zip "PK") e xls (OLE) vão direto; CSV/TXT vira texto sem conversão de números ("29,99" não pode virar 2999)
  const binario = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
  let wb: XLSX.WorkBook;
  if (binario) wb = XLSX.read(buf, { type: "buffer" });
  else {
    const utf8 = buf.toString("utf8");
    const texto = (utf8.includes("�") ? buf.toString("latin1") : utf8).replace(/^﻿/, "");
    wb = XLSX.read(texto, { type: "string", raw: true });
  }
  for (const aba of wb.SheetNames) {
    const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: null, blankrows: false });
    for (let l = 0; l < Math.min(40, matriz.length); l++) {
      const mapa = acharColunas(matriz[l] ?? []);
      if (!mapa) continue;
      const cab = (matriz[l] ?? []).map((c) => desentidade(String(c ?? "")).trim());
      const vistos = new Map<string, ProdutoPreco>();
      let ignoradas = 0;
      let repetidos = 0;
      for (const linha of matriz.slice(l + 1)) {
        const codigo = codigoTexto(linha?.[mapa.codigo]).replace(/^0+(?=\d)/, "");
        const descricao = desentidade(String(linha?.[mapa.descricao] ?? "")).replace(/\s+/g, " ").trim().slice(0, 200);
        const preco = numero(linha?.[mapa.preco]);
        if (!codigo || codigo.length > 30 || !/^[0-9A-Za-z.\-/]+$/.test(codigo) || !descricao || preco === null || preco < 0 || preco > 1_000_000) {
          if (linha?.some((c) => c !== null && String(c).trim() !== "")) ignoradas++;
          continue;
        }
        const eanBruto = mapa.ean >= 0 ? codigoTexto(linha?.[mapa.ean]).replace(/\D/g, "") : "";
        if (vistos.has(codigo)) repetidos++;
        vistos.set(codigo, { codigo, descricao, preco: Math.round(preco * 100) / 100, ean: eanBruto && eanBruto.length <= 30 ? eanBruto : null });
      }
      if (vistos.size === 0) continue;
      return {
        produtos: [...vistos.values()],
        colunas: [cab[mapa.codigo], cab[mapa.descricao], cab[mapa.preco], mapa.ean >= 0 ? cab[mapa.ean] : ""].filter(Boolean),
        aba,
        ignoradas,
        repetidos,
      };
    }
  }
  throw new Error("Não achei as colunas de código reduzido, descrição e preço de venda na planilha. Confira se o cabeçalho tem esses nomes.");
}
