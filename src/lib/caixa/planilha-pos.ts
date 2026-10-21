// Leitor da planilha do financeiro "POS Folha de Quebra de Caixa" (puro). Uma aba por empresa (Varela, Nazário…) com
// um bloco por loja: linha "F001 | 20/09" (loja e data de corte), cabeçalho "DATA | CÓD. VENDA | VALOR | VENDEDOR |
// NOME | PAGAMENTO | | STATUS" e uma linha por venda paga em outra modalidade (PIX CNPJ, cartão POS…). As abas
// "Vendedores …" (total por pessoa) e "Cód. Trier" (código × nome) são resumo e ficam de fora.

export type LinhaPos = {
  aba: string;
  linha: number;
  filial: string;
  dia: string | null; // aaaa-mm-dd
  venda: string;
  valor: number | null;
  vendedor: number | null;
  nome: string;
  pagamento: string;
  status: string;
};

export type PlanilhaPos = { linhas: LinhaPos[]; abas: string[]; corte: string | null };

// ---------- prévia da importação (montada no servidor, mostrada na tela) ----------

export type SituacaoPos = "lancar" | "duplicada" | "farmaceutico" | "sem_funcionario" | "sem_loja" | "invalida";
export const ROTULO_SITUACAO_POS: Record<SituacaoPos, string> = {
  lancar: "Vai lançar",
  duplicada: "Já importada",
  farmaceutico: "Farmacêutico da Varela (não tem quebra)",
  sem_funcionario: "Vendedor sem cadastro ligado",
  sem_loja: "Loja não encontrada",
  invalida: "Data ou valor inválido",
};

export type LinhaPrevia = LinhaPos & {
  chave: string;
  situacao: SituacaoPos;
  funcionario: { id: string; nome: string; cargo: string | null; filial: string } | null;
  pelaNome: boolean;
  branchId: string | null;
  folhaTravada: boolean;
  /** código do vendedor como operador do Trier (só se já existe em caixa_operadores; a coluna aponta para lá) */
  codTrier: number | null;
};

export type PreviaPos = { linhas: LinhaPrevia[]; corte: string | null; competencia: string; abas: string[] };

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Data do Excel (número de série ou texto dd/mm[/aaaa]) para aaaa-mm-dd; sem ano no texto, usa `anoPadrao`. */
export function dataDaCelula(v: unknown, anoPadrao: number): string | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(String(v ?? "").trim());
  if (!m) return null;
  const ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anoPadrao;
  const mes = Number(m[2]);
  const dia = Number(m[1]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return iso(ano, mes, dia);
}

/** "R$ 80,00", "80.00", 80 → 80; texto que não é valor → null. */
export function valorDaCelula(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v ?? "")
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100) / 100;
}

const ehAbaDeResumo = (nome: string) => /^(VENDEDORES|COD\.? ?TRIER)/.test(norm(nome));

export function lerPlanilhaPos(abas: { nome: string; matriz: unknown[][] }[], anoPadrao = new Date().getFullYear()): PlanilhaPos {
  const linhas: LinhaPos[] = [];
  const lidas: string[] = [];
  let corte: string | null = null;
  for (const { nome, matriz } of abas) {
    if (ehAbaDeResumo(nome)) continue;
    let filial: string | null = null;
    let dentro = false;
    let achouCabecalho = false;
    matriz.forEach((r, i) => {
      const a = norm(r?.[0]);
      const loja = /^F\d{3}\b/.exec(a);
      // linha da loja: "F001 | 20/09" (sem valor na coluna C)
      if (loja && vazio(r?.[2])) {
        filial = loja[0];
        dentro = false;
        const c = dataDaCelula(r?.[1], anoPadrao);
        if (c && (!corte || c > corte)) corte = c;
        return;
      }
      if (a === "DATA" && norm(r?.[1]).startsWith("COD")) {
        dentro = true;
        achouCabecalho = true;
        return;
      }
      if (!dentro || !filial) return;
      // venda: precisa do código da venda e do valor (linhas só com "Não encontrado" no nome ficam de fora)
      if (vazio(r?.[1]) || vazio(r?.[2])) return;
      const vend = valorDaCelula(r?.[3]);
      linhas.push({
        aba: nome,
        linha: i + 1,
        filial,
        dia: dataDaCelula(r?.[0], anoPadrao),
        venda: String(r?.[1]).trim(),
        valor: valorDaCelula(r?.[2]),
        vendedor: vend !== null && Number.isInteger(vend) && vend > 0 ? vend : null,
        nome: String(r?.[4] ?? "").trim(),
        pagamento: String(r?.[5] ?? "").trim(),
        status: String(r?.[7] ?? "").trim(),
      });
    });
    if (achouCabecalho) lidas.push(nome);
  }
  return { linhas, abas: lidas, corte };
}

/** Uma venda entra uma vez só: loja + código da venda + dia + valor. */
export const chaveDaVenda = (l: Pick<LinhaPos, "filial" | "venda" | "dia" | "valor">) => `pos:${l.filial}:${l.venda}:${l.dia ?? ""}:${(l.valor ?? 0).toFixed(2)}`;
