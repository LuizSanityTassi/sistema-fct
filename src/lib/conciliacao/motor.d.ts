// Tipos do motor de conciliação (motor.js). Datas são "número de dias desde 01/01/1970" (ver Motor.dtxt).

export interface Desconto {
  valor: number;
  ate: number | null;
  percentual: number | null;
  /** true = vale pagando no dia do vencimento; false = só antecipado; null = sem data (conferir). */
  noVencimento: boolean | null;
}

export interface TituloDDA {
  arquivo: string;
  geracao: number | null;
  mov: string;
  barra: string;
  doc: string;
  raiz: string;
  tipo: string;
  nome: string;
  venc: number | null;
  valor: number;
  numdoc: string;
  desconto?: Desconto | null;
  emis: number | null;
  pagador: string;
  pagadorCnpj?: string;
  tipoBoleto?: string;
  filialArquivo?: number | null;
  // preenchidos pela conciliação
  i?: number;
  fil?: number | null;
  filForte?: boolean;
  deParaFornecedor?: string;
  alerta?: string;
}

export interface ArquivoDDA {
  arquivo: string;
  empresaCnpj: string;
  empresaNome: string;
  geracao: number | null;
  titulos: TituloDDA[];
  lotes: { cnpj: string; nome: string }[];
  ignoradas?: number;
  planilha?: boolean;
  filial?: number | null;
}

export interface TituloTrier {
  doc: string;
  fil: number;
  fcod: string;
  forn: string;
  curto: string;
  emis: number | null;
  venc: number | null;
  valor: number;
  pagar: number;
}

export interface Casamento {
  tipo: string;
  i: number;
  taxa: number | null;
}

export interface TituloTrierConciliado extends TituloTrier {
  j: number;
  m: Casamento | null;
  resultado: string;
  dda?: TituloDDA;
  diferenca?: number | null;
}

export interface ResultadoTrier {
  titulos: TituloTrier[];
  totalGeral: number | null;
  ignoradas: string[];
}

export interface EntradaDePara {
  dda: string;
  fornecedor: string[];
  alerta?: string | null;
}

export interface Aprendido {
  forn: string;
  raiz: string;
  taxas?: number[];
  bloqueado?: boolean;
}

export interface OpcoesConciliar {
  filMin?: number;
  filMax?: number;
  dePara?: EntradaDePara[];
  taxaMax?: number;
  diasData?: number;
  toleranciaValor?: number;
  maxCombinacao?: number;
  filialDeCnpj?: (cnpj: string) => number | null;
  aprendido?: Aprendido[];
}

export type Contagem = { qtd: number; valor: number };

export interface ResultadoConciliacao {
  T: TituloTrierConciliado[];
  D: TituloDDA[];
  soDDA: TituloDDA[];
  resumo: Record<string, Contagem>;
  descontos: { noVencimento: Contagem; soAntecipado: Contagem; semData: Contagem };
  totalTrier: number;
  qtdTrier: number;
  totalDDA: number;
  qtdDDA: number;
  totalSoDDA: number;
  pctBateu: number;
  pctValorBateu: number;
  paresAprendidos: { forn: string; raiz: string; benef: string; taxas: number[]; n: number }[];
  vencIni: number;
  vencFim: number;
  cobIni: number | null;
  cobFim: number | null;
  bancoVencIni: number | null;
  /** Último vencimento da planilha do portal (null sem planilha): título que vence depois fica "fora do período". */
  bancoVencFim: number | null;
  taxas: { fornecedor: string; taxas: number[] }[];
}

export interface ItemTexto {
  str: string;
  x: number;
  y: number;
}

export interface MotorApi {
  minDe(lista: Iterable<number>): number;
  maxDe(lista: Iterable<number>): number;
  BATEU: string[];
  ROTULO: Record<string, string>;
  parseRET(texto: string, arquivo: string): ArquivoDDA;
  parseItauPlanilha(linhas: unknown[][], arquivo: string): ArquivoDDA;
  parseTrier(linhas: string[]): ResultadoTrier;
  linhasDeTrierPlanilha(rows: unknown[][]): string[];
  linhasDeItens(itens: ItemTexto[]): string[];
  itensDaPagina(pdfjsLib: unknown, page: unknown, textContent: unknown): ItemTexto[];
  conciliar(trierTit: TituloTrier[], ddaArquivos: ArquivoDDA[], opt?: OpcoesConciliar): ResultadoConciliacao;
  dtxt(n: number | null | undefined): string;
  cnpjFmt(s: string): string;
  norm(s: unknown): string;
}

export const Motor: MotorApi;
export default Motor;
