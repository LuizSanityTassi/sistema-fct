// Onde cada categoria de despesa do Omie entra no relatório do fluxo de caixa, do jeito da coordenação financeira
// (planilha "categorias fluxo de caixa"): o "total de despesas" do contador aqui se divide em DESPESAS FIXAS e
// DESPESAS VARIÁVEIS. O lugar de cada categoria fica em fin_fluxo_classes e muda na tela "Categorias".

export type Lugar = { chave: string; bloco: string; subgrupo: string | null };

/** Na ordem do relatório. `chave` = "BLOCO" ou "BLOCO|Subgrupo" (é o que fica gravado). */
export const LUGARES: Lugar[] = [
  ["CUSTO DA MERCADORIA"],
  ["DESPESAS FIXAS", "Despesas Administrativas"],
  ["DESPESAS FIXAS", "Despesas com Pessoal"],
  ["DESPESAS FIXAS", "Despesas de Vendas e Marketing"],
  ["DESPESAS FIXAS", "Impostos e Taxas"],
  ["DESPESAS FIXAS", "Patronal / Retiradas"],
  ["DESPESAS VARIÁVEIS", "Despesas Administrativas"],
  ["DESPESAS VARIÁVEIS", "Despesas com Pessoal"],
  ["DESPESAS VARIÁVEIS", "Despesas de Vendas e Marketing"],
  ["DESPESAS VARIÁVEIS", "Impostos e Taxas"],
  ["DESPESAS VARIÁVEIS", "Devoluções de Vendas e Cancelamento"],
  ["DESPESAS FINANCEIRAS"],
  ["OUTRAS DESPESAS"],
  ["PAGAMENTO DE EMPRÉSTIMOS"],
  ["INVESTIMENTO"],
].map(([bloco, subgrupo]) => ({ chave: subgrupo ? `${bloco}|${subgrupo}` : bloco, bloco, subgrupo: subgrupo ?? null }));

export const NAO_CLASSIFICADA = "NÃO CLASSIFICADAS";
/** Categoria que não é despesa (ex.: "Outras Receitas" cadastrada como a pagar): some da lista e do relatório. */
export const FORA = "FORA DO RELATÓRIO";
export const ehLugar = (v: unknown): v is string => v === FORA || LUGARES.some((l) => l.chave === v);
export const rotuloLugar = (chave: string) => chave.replace("|", " › ");
/** Blocos na ordem, sem repetir. */
export const BLOCOS = [...new Set(LUGARES.map((l) => l.bloco))];
/** Como cada bloco aparece no relatório (igual à planilha da coordenação) e a cor da linha. */
export const ROTULO_BLOCO: Record<string, string> = {
  "DESPESAS FIXAS": "TOTAL DESPESAS FIXAS",
  "DESPESAS VARIÁVEIS": "TOTAL DESPESAS VARIÁVEIS",
  "DESPESAS FINANCEIRAS": "Despesas Financeiras",
  "OUTRAS DESPESAS": "Outras Despesas",
  "PAGAMENTO DE EMPRÉSTIMOS": "Pagamento de empréstimos",
  INVESTIMENTO: "Investimento",
};
export const corBloco = (bloco: string): "vermelho" | "amarelo" => (["CUSTO DA MERCADORIA", "DESPESAS FIXAS", "DESPESAS VARIÁVEIS"].includes(bloco) ? "vermelho" : "amarelo");

export type Regra = { grupo: string; categoria: string; lugar: string; ordem: number };
export type Classificacao = { lugar: string; ordem: number; por: "categoria" | "nome" | "grupo" | null };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Monta a função que diz o lugar de (grupo, categoria): grupo + categoria → só a categoria → o grupo inteiro. */
export function classificador(regras: Regra[]) {
  const exata = new Map<string, Regra>();
  const porNome = new Map<string, Regra>();
  const porGrupo = new Map<string, Regra>();
  for (const r of regras) {
    if (r.grupo && r.categoria) exata.set(`${norm(r.grupo)}|${norm(r.categoria)}`, r);
    else if (r.categoria) porNome.set(norm(r.categoria), r);
    else porGrupo.set(norm(r.grupo), r);
  }
  return (grupo: string, categoria: string): Classificacao => {
    const r1 = exata.get(`${norm(grupo)}|${norm(categoria)}`);
    if (r1) return { lugar: r1.lugar, ordem: r1.ordem, por: "categoria" };
    const r2 = porNome.get(norm(categoria));
    if (r2) return { lugar: r2.lugar, ordem: r2.ordem, por: "nome" };
    const r3 = porGrupo.get(norm(grupo));
    if (r3) return { lugar: r3.lugar, ordem: 5000, por: "grupo" };
    return { lugar: NAO_CLASSIFICADA, ordem: 9999, por: null };
  };
}
