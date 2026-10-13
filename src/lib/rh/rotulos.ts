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
