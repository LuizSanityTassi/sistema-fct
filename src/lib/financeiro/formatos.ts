// Formatação do módulo financeiro, seguindo as regras combinadas com a diretoria:
//  • valores SEM centavos; arredondamento "41": centavos até 40 ficam no inteiro, 41 ou mais somam R$ 1
//  • valores abreviados (mi / mil) sempre com 3 casas decimais; abaixo de R$ 1.000 mostra inteiro
//  • cores por grupo: VARELA vermelho, NAZÁRIO azul (os demais seguem o grupo-mãe)

export function arred41(valor: number) {
  const sinal = valor < 0 ? -1 : 1;
  const abs = Math.abs(valor);
  const inteiro = Math.floor(abs);
  const centavos = Math.round((abs - inteiro) * 100);
  return sinal * (centavos >= 41 ? inteiro + 1 : inteiro);
}

const inteiroBr = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const tresCasas = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** R$ sem centavos (regra 41). */
export function moedaFin(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  const v = arred41(n);
  return `${v < 0 ? "-" : ""}R$ ${inteiroBr.format(Math.abs(v))}`;
}

/** R$ abreviado: "R$ 1,235 mi", "R$ 12,345 mil", "R$ 850". */
export function moedaAbrev(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = typeof valor === "string" ? Number(valor) : valor;
  if (!Number.isFinite(n)) return "—";
  const sinal = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sinal}R$ ${tresCasas.format(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${tresCasas.format(abs / 1_000)} mil`;
  return `${sinal}R$ ${inteiroBr.format(arred41(abs))}`;
}

/** Grupo financeiro de uma unidade (como a diretoria acompanha): VARELA, ITAJAÍ, NAZÁRIO, BLUMENAU. */
export function grupoFinanceiro(nomeFantasia: string | null | undefined, regional: string | null | undefined) {
  if (regional === "Vale do Itajaí") return "ITAJAÍ";
  if (regional === "Blumenau") return "BLUMENAU";
  return (nomeFantasia ?? "—").toUpperCase();
}

export const COR_GRUPO: Record<string, string> = {
  VARELA: "text-red-700",
  ITAJAÍ: "text-red-500",
  NAZÁRIO: "text-blue-700",
  BLUMENAU: "text-blue-500",
};
