// Geração de CSV compatível com Excel pt-BR: separador ";", decimal com vírgula, BOM UTF-8.
import { formatarData } from "@/lib/formatos";

export type TipoColuna = "texto" | "inteiro" | "numero" | "moeda" | "data";
export type Coluna = { chave: string; titulo: string; tipo?: TipoColuna };
export type Valor = string | number | null | undefined;
export type Linha = Record<string, Valor>;

export type Relatorio = {
  titulo: string;
  colunas: Coluna[];
  linhas: Linha[];
  totais?: Linha;
};

function celula(valor: Valor, tipo: TipoColuna = "texto"): string {
  if (valor === null || valor === undefined || valor === "") return "";
  if (tipo === "data") return formatarData(String(valor));
  if (tipo === "moeda" || tipo === "numero") {
    const n = typeof valor === "number" ? valor : Number(valor);
    return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : String(valor);
  }
  if (tipo === "inteiro") return String(valor);
  const t = String(valor);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function gerarCsv(relatorios: Relatorio[]): string {
  const blocos = relatorios.map((r) => {
    const cab = r.colunas.map((c) => celula(c.titulo)).join(";");
    const corpo = r.linhas.map((l) => r.colunas.map((c) => celula(l[c.chave], c.tipo)).join(";"));
    const tot = r.totais ? [r.colunas.map((c) => celula(r.totais![c.chave], c.tipo)).join(";")] : [];
    return [celula(r.titulo), cab, ...corpo, ...tot].join("\r\n");
  });
  return "﻿" + blocos.join("\r\n\r\n") + "\r\n";
}
