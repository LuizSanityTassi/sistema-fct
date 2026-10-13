// Rótulos dos enums de RH. Módulo puro (sem acesso a banco) para poder ser usado em componentes client.
import type { Enums } from "@/lib/tipos";

export type StatusFuncionario = Enums["employee_status"];
export type TipoContrato = Enums["contract_type"];

export const STATUS_LABEL: Record<StatusFuncionario, string> = {
  ativo: "Ativo",
  afastado: "Afastado",
  ferias: "Férias",
  desligado: "Desligado",
};

export const CONTRATO_LABEL: Record<TipoContrato, string> = {
  clt: "CLT",
  pj: "PJ",
  estagio: "Estágio",
  temporario: "Temporário",
  aprendiz: "Jovem aprendiz",
};

export type CategoriaDocumento = Enums["document_category"];
export type TipoAso = Enums["aso_type"];

export const CATEGORIA_DOC_LABEL: Record<CategoriaDocumento, string> = {
  documento_pessoal: "Documento pessoal",
  contrato: "Contrato",
  aso: "ASO",
  ferias: "Férias",
  advertencia: "Advertência",
  comprovante: "Comprovante",
  folha: "Folha",
  atestado: "Atestado",
  outros: "Outros",
};

export const ASO_TIPO_LABEL: Record<TipoAso, string> = {
  admissional: "Admissional",
  periodico: "Periódico",
  retorno: "Retorno ao trabalho",
  mudanca_funcao: "Mudança de função",
  demissional: "Demissional",
};

export type SituacaoAso = "valido" | "vencendo" | "vencido" | "sem_validade";

/** Situação de um ASO pela data de validade (aviso a partir de 30 dias antes). */
export function situacaoAso(validade: string | null | undefined, hoje = new Date()) {
  if (!validade) return { codigo: "sem_validade" as SituacaoAso, rotulo: "Sem validade", dias: null };
  const alvo = Date.parse(`${validade.slice(0, 10)}T00:00:00Z`);
  const base = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate());
  const dias = Math.round((alvo - base) / 86_400_000);
  const d = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;
  if (dias < 0) return { codigo: "vencido" as SituacaoAso, rotulo: `Vencido há ${d(-dias)}`, dias };
  if (dias === 0) return { codigo: "vencendo" as SituacaoAso, rotulo: "Vence hoje", dias };
  if (dias <= 30) return { codigo: "vencendo" as SituacaoAso, rotulo: `Vence em ${d(dias)}`, dias };
  return { codigo: "valido" as SituacaoAso, rotulo: "Válido", dias };
}
