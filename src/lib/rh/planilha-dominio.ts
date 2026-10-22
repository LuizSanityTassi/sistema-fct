// Gera a planilha "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO" (.xls, Excel 97-2003) que a contabilidade importa na
// Domínio, uma por CNPJ, preenchendo o PRÓPRIO modelo da contabilidade (09/2026, filial /0032): mesmas fontes,
// cores, bordas, comentários, larguras, alturas, mesclagens e fórmulas da linha TOTAL. Só o conteúdo muda:
//   C3 código da empresa · C4 razão social · C5 CNPJ · C6 competência (mm/yyyy)
//   linhas 11 a 50: A = 11 (tipo de cálculo), B = matrícula, C = nome, D = função, E..R = valores dos eventos
//   linha 52: as fórmulas do modelo (COUNTA(B11:B51), =C10, SUM(X12:X51)) com o resultado já calculado.
// Os eventos são ligados às colunas pelo código da linha 10 do modelo — ou, com `posicional` (filial com os códigos da
// Domínio cadastrados), cada evento vai na sua coluna (E, F, …) com o rótulo e o código daquele CNPJ. Só servidor.
import { MODELO_DOMINIO_B64 } from "./modelo-dominio-b64";
import { definirResultadoFormula, definirValor, gravarModelo, lerModelo, valorNoModelo, type ModeloXls } from "./modelo-xls";

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
  /**
   * Códigos da filial: `eventos` são as colunas da planilha dela, na ordem (1ª = coluna E), com o rótulo e o código da
   * contabilidade; as colunas do modelo que sobram ficam sem título. Sem isto, liga pelo código da linha 10 do modelo.
   */
  posicional?: boolean;
};

export const TIPO_CALCULO_FOLHA = 11;
/** Linhas de funcionários do modelo (11 a 50). */
export const MAX_FUNCIONARIOS = 40;

// posições no modelo (base 0)
const L_CODIGOS = 9; // linha 10: códigos dos eventos
const L_NOMES = 8; // linha 9: nomes dos eventos
const L_DADOS = 10; // linha 11
const L_TOTAL = 51; // linha 52
const C_PRIMEIRO_EVENTO = 4; // coluna E
const C_ULTIMO_MODELO = 17; // coluna R

/** Data Excel (número de dias desde 30/12/1899) do dia 1 da competência. */
export function serialExcel(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return Math.round((Date.UTC(ano, mes - 1, 1) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

const arred = (v: number) => Math.round(v * 100) / 100;

/** Colunas de evento do modelo: código da linha 10 → coluna. */
function colunasDoModelo(m: ModeloXls) {
  const mapa = new Map<number, number>();
  for (let c = C_PRIMEIRO_EVENTO; c <= C_ULTIMO_MODELO; c++) {
    const v = valorNoModelo(m, L_CODIGOS, c);
    if (typeof v === "number") mapa.set(v, c);
  }
  return mapa;
}

export function preencherModeloDominio(d: DadosPlanilha): ModeloXls {
  if (d.linhas.length > MAX_FUNCIONARIOS) {
    throw new Error(`${d.linhas.length} funcionários neste CNPJ: o modelo da contabilidade tem ${MAX_FUNCIONARIOS} linhas`);
  }
  const m = lerModelo(Buffer.from(MODELO_DOMINIO_B64, "base64"));
  const doModelo = colunasDoModelo(m);

  // eventos que não cabem nas colunas do modelo viram colunas novas depois da R, com o estilo da coluna R
  const colunaDoEvento = new Map<string, number>();
  let proxima = C_ULTIMO_MODELO + 1;
  const extras: number[] = [];
  const colunaNova = () => {
    const nova = proxima++;
    extras.push(nova);
    for (let r = 0; r <= L_TOTAL; r++) {
      const xf = m.celulas.get(r * 1024 + C_ULTIMO_MODELO)?.xf;
      if (xf !== undefined && r !== L_TOTAL) definirValor(m, r, nova, null, xf);
    }
    return nova;
  };
  if (d.posicional) {
    d.eventos.forEach((e, k) => {
      const c = C_PRIMEIRO_EVENTO + k <= C_ULTIMO_MODELO ? C_PRIMEIRO_EVENTO + k : colunaNova();
      colunaDoEvento.set(e.id, c);
      definirValor(m, L_NOMES, c, e.nome);
      definirValor(m, L_CODIGOS, c, e.codigo);
    });
    for (let c = C_PRIMEIRO_EVENTO + d.eventos.length; c <= C_ULTIMO_MODELO; c++) {
      definirValor(m, L_NOMES, c, null);
      definirValor(m, L_CODIGOS, c, null);
    }
  } else {
    for (const e of d.eventos) {
      const c = doModelo.get(e.codigo);
      if (c !== undefined) {
        colunaDoEvento.set(e.id, c);
        continue;
      }
      const nova = colunaNova();
      colunaDoEvento.set(e.id, nova);
      definirValor(m, L_NOMES, nova, e.nome);
      definirValor(m, L_CODIGOS, nova, e.codigo);
    }
  }

  definirValor(m, 2, 2, d.codigoEmpresa);
  definirValor(m, 3, 2, d.razaoSocial);
  definirValor(m, 4, 2, d.cnpj);
  definirValor(m, 5, 2, serialExcel(d.competencia));

  // somas como as fórmulas do modelo: SUM(X12:X51) começa na 2ª linha de funcionário (a 1ª fica de fora, igual ao modelo)
  const somas = new Map<number, number>();
  d.linhas.forEach((l, i) => {
    const r = L_DADOS + i;
    definirValor(m, r, 0, TIPO_CALCULO_FOLHA);
    definirValor(m, r, 1, l.matricula);
    definirValor(m, r, 2, l.nome);
    definirValor(m, r, 3, l.funcao);
    for (const e of d.eventos) {
      const c = colunaDoEvento.get(e.id)!;
      const v = arred(l.valores[e.id] ?? 0);
      definirValor(m, r, c, v > 0 ? v : null);
      if (v > 0 && i >= 1) somas.set(c, (somas.get(c) ?? 0) + v); // soma na ordem, sem arredondar, como o Excel
    }
  });

  definirResultadoFormula(m, L_TOTAL, 1, d.linhas.length);
  for (let c = 3; c <= C_ULTIMO_MODELO; c++) definirResultadoFormula(m, L_TOTAL, c, somas.get(c) ?? 0);
  const xfTotal = m.celulas.get(L_TOTAL * 1024 + C_ULTIMO_MODELO)?.xf ?? 15;
  for (const c of extras) definirValor(m, L_TOTAL, c, somas.get(c) ?? 0, xfTotal);
  return m;
}

/** Arquivo .xls pronto para download. */
export function gerarPlanilhaDominio(d: DadosPlanilha): Buffer {
  const m = preencherModeloDominio(d);
  return gravarModelo(m, { ordemSst: m.sst.map((t) => t.s) });
}
