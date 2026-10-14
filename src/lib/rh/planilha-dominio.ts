// Gera a planilha "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO" (.xls, Excel 97-2003) que a contabilidade importa
// na Domínio — uma por CNPJ. Layout copiado do modelo da contabilidade (09/2026, filial /0032):
//   A1 título · A3..A6 código da empresa, razão social, CNPJ e competência (C3..C6)
//   linha 9 nomes das colunas · linha 10 códigos dos eventos · dados a partir da linha 11
//   (A = 11 tipo de cálculo, B = matrícula, C = nome, D = função, E.. = valores), 40 linhas de dados no mínimo,
//   depois "S" na coluna A e a linha TOTAL. Só servidor (usa a biblioteca xlsx).
// O formato .xls não guarda fórmulas nesta biblioteca: a linha TOTAL sai com os valores já somados.
import * as XLSX from "xlsx";

export type ColunaEvento = { id: string; codigo: number; nome: string };

export type LinhaPlanilha = {
  matricula: number | string;
  nome: string;
  funcao: string;
  /** valor por id do evento (só os maiores que zero são escritos) */
  valores: Record<string, number>;
};

export type DadosPlanilha = {
  codigoEmpresa: number;
  razaoSocial: string;
  cnpj: string;
  /** "AAAA-MM" */
  competencia: string;
  eventos: ColunaEvento[];
  linhas: LinhaPlanilha[];
};

export const TIPO_CALCULO_FOLHA = 11;
const LINHAS_MINIMAS = 40;
const PRIMEIRA_LINHA = 11; // linha 11 do Excel

// Larguras das colunas do modelo (em caracteres), por código do evento.
const LARGURA_EVENTO: Record<number, number> = {
  150: 22.8, 160: 22.8, 200: 23.9, 2: 20.8, 259: 25.6, 262: 26.8, 37: 14.2,
  8069: 20.5, 981: 19.9, 231: 13.1, 238: 29.1, 48: 21.1, 265: 15.9, 9999: 20.5,
};

/** Data Excel (número de dias desde 30/12/1899) do dia 1 da competência. */
export function serialExcel(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return Math.round((Date.UTC(ano, mes - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

const arred = (v: number) => Math.round(v * 100) / 100;

export function montarPlanilhaDominio(d: DadosPlanilha): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const cel = (c: number, r: number) => XLSX.utils.encode_cell({ c, r: r - 1 });
  const texto = (c: number, r: number, v: string) => {
    ws[cel(c, r)] = { t: "s", v };
  };
  const numero = (c: number, r: number, v: number, z?: string) => {
    ws[cel(c, r)] = z ? { t: "n", v, z } : { t: "n", v };
  };

  texto(0, 1, "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO");
  texto(0, 3, "Codigo Empresa:");
  numero(2, 3, d.codigoEmpresa, "0000000");
  texto(0, 4, "Razão Social:");
  texto(2, 4, d.razaoSocial);
  texto(0, 5, "Inscrição Cnpj:");
  texto(2, 5, d.cnpj);
  texto(0, 6, "Competencia:");
  numero(2, 6, serialExcel(d.competencia), "mm/yyyy");

  ["Tipo de", "Código", "Nome dos", "Função"].forEach((t, c) => texto(c, 9, t));
  ["Calculo", "Folha", "Colaboradores"].forEach((t, c) => texto(c, 10, t));
  d.eventos.forEach((e, i) => {
    texto(4 + i, 9, e.nome);
    numero(4 + i, 10, e.codigo, "0000");
  });

  const totais = d.eventos.map(() => 0);
  d.linhas.forEach((l, i) => {
    const r = PRIMEIRA_LINHA + i;
    numero(0, r, TIPO_CALCULO_FOLHA);
    if (typeof l.matricula === "number") numero(1, r, l.matricula, "00000");
    else texto(1, r, l.matricula);
    texto(2, r, l.nome);
    texto(3, r, l.funcao);
    d.eventos.forEach((e, j) => {
      const v = arred(l.valores[e.id] ?? 0);
      if (v > 0) {
        numero(4 + j, r, v, "0.00");
        totais[j] += v;
      }
    });
  });

  const slots = Math.max(LINHAS_MINIMAS, d.linhas.length);
  const linhaS = PRIMEIRA_LINHA + slots;
  const linhaTotal = linhaS + 1;
  texto(0, linhaS, "S");
  texto(0, linhaTotal, "TOTAL");
  numero(1, linhaTotal, d.linhas.length);
  texto(2, linhaTotal, "Colaboradores");
  numero(3, linhaTotal, 0, "#,##0.00");
  totais.forEach((t, j) => numero(4 + j, linhaTotal, arred(t), "#,##0.00"));

  const ultimaColuna = Math.max(3, 3 + d.eventos.length);
  ws["!ref"] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: ultimaColuna, r: linhaTotal - 1 } });
  ws["!merges"] = ["A3:B3", "A4:B4", "C4:D4", "A5:B5", "A6:B6", "D9:D10"].map((m) => XLSX.utils.decode_range(m));
  // a biblioteca soma a margem da célula (~0,47 caractere) ao gravar: desconta para sair com a largura do modelo
  ws["!cols"] = [8.6, 8.5, 38.1, 17.8, ...d.eventos.map((e) => LARGURA_EVENTO[e.codigo] ?? 20)].map((w) => ({ wch: Math.round((w - 0.47) * 100) / 100 }));
  ws["!rows"] = [];
  ws["!rows"][PRIMEIRA_LINHA - 1] = { hpt: 16.5 };
  return ws;
}

/** Arquivo .xls (BIFF8) pronto para download. */
export function gerarPlanilhaDominio(d: DadosPlanilha): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, montarPlanilhaDominio(d), "PLANILHA");
  return XLSX.write(wb, { type: "buffer", bookType: "biff8" }) as Buffer;
}
