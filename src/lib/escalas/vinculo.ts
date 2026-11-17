import type { Tom } from "@/lib/tons";

type ComRh = {
  employee_id: string | null;
  situacao: string;
  rh: { status: string; filial: { id: string; codigo: string } | null } | null;
};

/** Vínculo da pessoa da escala com a ficha do RH: ligada, em outra filial, desligada ou sem ficha. */
export function vinculoRh(c: ComRh, branchId: string): { tom: Tom; texto: string } {
  if (!c.employee_id) return { tom: "neutro", texto: "Sem ficha no RH" };
  if (!c.rh) return { tom: "neutro", texto: "Ficha do RH (sem acesso)" };
  if (c.rh.status === "desligado") return { tom: "perigo", texto: "Desligado no RH" };
  if (c.rh.filial && c.rh.filial.id !== branchId) return { tom: "atencao", texto: `RH: ${c.rh.filial.codigo}` };
  if (c.rh.status !== "ativo" && c.situacao === "ativo") return { tom: "atencao", texto: `RH: ${c.rh.status === "ferias" ? "férias" : c.rh.status}` };
  return { tom: "sucesso", texto: "Ficha do RH" };
}
