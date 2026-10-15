// Diferença de caixa (puro, sem banco): leitura do "Relatório de Diferenças de Caixa" do Trier (Rel_0122, saída XLS)
// e as regras da empresa.
//
// O relatório traz, por caixa: operador (código - nome), número do caixa, datas de abertura e fechamento e, por
// forma de pagamento, Informado × Calculado × Diferença. Como as lojas lançam a entrega do dinheiro como movimento
// de caixa, o "Calculado" do DINHEIRO é o que ficou faltando depois da entrega: é ele a diferença do caixa (a mesma
// conta da tela "Pesquisar Diferença de Caixa" da Zanini: Declarado = Informado, Movimentado = Informado − Calculado,
// Diferença = Calculado). Ex.: F002 05/10/2026 caixa 4667: informado 1.035,00, calculado 68,10 → faltou R$ 68,10.
// Positivo = falta (entregou menos), negativo = sobra (entregou mais).

/** Até este valor (para mais ou para menos) a diferença é tolerada: só o financeiro vê. Acima vira quebra. */
export const TOLERANCIA_CAIXA = 2;

export type FormaCaixa = { forma: string; informado: number; calculado: number; diferenca: number };
export type CaixaTrier = {
  numero: number;
  codOperador: number | null;
  nomeOperador: string;
  abertura: string | null; // aaaa-mm-dd
  fechamento: string | null;
  formas: FormaCaixa[];
  informadoDinheiro: number;
  calculadoDinheiro: number;
  valorAbertura: number | null;
  fundoTroco: number | null;
};
export type RelatorioDiferencas = { periodo: string; filialTexto: string; caixas: CaixaTrier[]; totalCaixasInformado: number | null };

export class LeituraCaixaErro extends Error {}

const centavos = (v: number) => Math.round(v * 100) / 100;

function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  let s = v.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const textoDe = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Data do Excel (número de série, Date ou "dd/mm/aaaa") → "aaaa-mm-dd". */
export function dataDoExcel(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 10);
  if (typeof v === "string") {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v.trim());
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  return null;
}

/** " 140 - ADILSOM BATISTA" → { cod: 140, nome: "ADILSOM BATISTA" }. */
export function operadorDoTexto(t: string) {
  const m = /^\s*(\d+)\s*-\s*(.+?)\s*$/.exec(t);
  return m ? { cod: Number(m[1]), nome: m[2].replace(/\s+/g, " ") } : { cod: null, nome: t.trim() };
}

/**
 * Lê a planilha (linhas × colunas, como o SheetJS devolve com header:1) do Relatório de Diferenças de Caixa.
 * Não depende da coluna exata de cada valor: em cada linha usa os textos e os números na ordem em que aparecem.
 */
export function lerRelatorioDiferencas(matriz: unknown[][]): RelatorioDiferencas {
  const caixas: CaixaTrier[] = [];
  let atual: CaixaTrier | null = null;
  let periodo = "";
  let filialTexto = "";
  let totalCaixasInformado: number | null = null;
  let viuTitulo = false;

  for (const linha of matriz) {
    const valores = (linha ?? []).filter((v) => v !== null && v !== undefined && v !== "");
    if (!valores.length) continue;
    const textos = valores.map(textoDe).filter(Boolean);
    const nums = valores.map(numero).filter((n): n is number => n !== null);
    const rotulo = (textos[0] ?? "").replace(/\s+/g, " ");

    if (/RELAT[OÓ]RIO DE DIFEREN[CÇ]AS DE CAIXA/i.test(rotulo)) viuTitulo = true;
    else if (/^Per[ií]odo:?$/i.test(rotulo)) periodo = textos[1] ?? "";
    else if (/^Filial:?$/i.test(rotulo)) filialTexto = textos[1] ?? "";
    else if (/^Operador$/i.test(rotulo) && textos[1] && /^\s*\d+\s*-/.test(textos[1])) {
      const op = operadorDoTexto(textos[1]);
      atual = { numero: 0, codOperador: op.cod, nomeOperador: op.nome, abertura: null, fechamento: null, formas: [], informadoDinheiro: 0, calculadoDinheiro: 0, valorAbertura: null, fundoTroco: null };
      caixas.push(atual);
    } else if (/^Caixa:?$/i.test(rotulo) && atual) {
      const brutos = valores.slice(1);
      atual.numero = numero(brutos[0]) ?? 0;
      atual.abertura = dataDoExcel(brutos[1]);
      atual.fechamento = dataDoExcel(brutos[2]);
    } else if (/^Valor de abertura:?$/i.test(rotulo) && atual) atual.valorAbertura = nums[0] ?? null;
    else if (/^Fundo de troco:?$/i.test(rotulo) && atual) atual.fundoTroco = nums[0] ?? null;
    else if (/^Total Caixas:?$/i.test(rotulo)) totalCaixasInformado = nums[0] ?? null;
    else if (atual && textos.length === 1 && nums.length === 3 && !/^Total/i.test(rotulo)) {
      const [informado, calculado, diferenca] = nums.map(centavos);
      const forma = rotulo.replace(/\*+$/, "").trim();
      atual.formas.push({ forma, informado, calculado, diferenca });
      if (/^DINHEIRO$/i.test(forma)) {
        atual.informadoDinheiro = informado;
        atual.calculadoDinheiro = calculado;
      }
    }
  }

  if (!viuTitulo) throw new LeituraCaixaErro("O arquivo não parece o “Relatório de Diferenças de Caixa” do Trier.");
  const semNumero = caixas.filter((c) => !c.numero);
  if (semNumero.length) throw new LeituraCaixaErro(`${semNumero.length} caixa(s) sem número no relatório (operador ${semNumero[0].nomeOperador}).`);
  if (totalCaixasInformado !== null && totalCaixasInformado !== caixas.length)
    throw new LeituraCaixaErro(`O relatório diz ${totalCaixasInformado} caixa(s), mas li ${caixas.length}. Formato do Trier mudou?`);
  return { periodo, filialTexto, caixas, totalCaixasInformado };
}

// ---------- regras ----------

export type ClasseDiferenca = "sem_diferenca" | "tolerancia" | "quebra";

/** Diferença do caixa (convenção da Zanini): o calculado do dinheiro. Positivo = falta, negativo = sobra. */
export const diferencaDoCaixa = (c: Pick<CaixaTrier, "calculadoDinheiro">) => centavos(c.calculadoDinheiro);
/** "Movimentado" da tela da Zanini: informado − calculado do dinheiro. */
export const movimentadoDoCaixa = (c: Pick<CaixaTrier, "informadoDinheiro" | "calculadoDinheiro">) => centavos(c.informadoDinheiro - c.calculadoDinheiro);

/** Sem diferença (zero), tolerância (até R$ 2,00, para mais ou para menos) ou quebra (acima de R$ 2,00). */
export function classificarDiferenca(diferenca: number): ClasseDiferenca {
  const a = Math.abs(centavos(diferenca));
  if (a < 0.005) return "sem_diferenca";
  if (a <= TOLERANCIA_CAIXA) return "tolerancia";
  return "quebra";
}

/** Valor descontado na folha: a quebra inteira, falta ou sobra (regra da empresa). */
export const valorQuebra = (diferenca: number) => (classificarDiferenca(diferenca) === "quebra" ? Math.abs(centavos(diferenca)) : 0);
