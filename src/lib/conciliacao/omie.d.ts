import type { ResultadoConciliacao, TituloDDA, TituloTrierConciliado } from "./motor";

export interface Departamento {
  nome: string;
  fil: number | null;
  cnpj: string;
}

/** Uma conta a pagar: um boleto (com os títulos do Trier que casaram) ou um título só do Trier. */
export interface ItemOmie {
  id: string;
  tipo: "boleto" | "trier";
  d: TituloDDA | null;
  ts: TituloTrierConciliado[];
  resultado: string;
}

export interface GruposOmie {
  exatos: ItemOmie[];
  aproximados: ItemOmie[];
  soTrier: ItemOmie[];
  soDDA: ItemOmie[];
}

export interface ConfigOmie {
  categoria: string;
  conta: string;
}

export interface LinhaOmie {
  B: string;
  C: string;
  D: string;
  E: string;
  F: number;
  I: number | null;
  J: number | null;
  K: number | null;
  L: number | null;
  S: string;
  T: string;
  U: string;
  Y: string;
  AA: string;
  AB: string;
  AX: string;
  _semDepartamento: boolean;
}

export interface OmieApi {
  DEPARTAMENTOS: Departamento[];
  departamento(fil: number | null, cnpj: string | null | undefined): Departamento | null;
  filialDe(item: ItemOmie): number | null;
  empresaDe(item: ItemOmie, dep?: Departamento | null): "nazario" | "varela" | null;
  chave(item: ItemOmie): string;
  grupos(res: ResultadoConciliacao): GruposOmie;
  montarLinhas(itens: ItemOmie[], cfg: ConfigOmie, rotulo?: Record<string, string>): LinhaOmie[];
  gerar(JSZip: unknown, modeloB64: string, linhas: LinhaOmie[]): Promise<Blob | Buffer>;
}

export const Omie: OmieApi;
export default Omie;
