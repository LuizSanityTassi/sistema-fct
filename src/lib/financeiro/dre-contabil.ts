// DRE contábil por filial (puro, sem banco): a planilha "DRE POR FILIAIS" que o contador manda todo mês e as contas
// da DRE. Cada aba de filial ("CHAPECÓ 302", "TRIO"…) tem os meses nas colunas (cabeçalho com a data) e as contas
// nas linhas; o sistema guarda só os lançamentos (vendas, deduções, custos, despesas, financeiro, IR) e calcula o resto
// (receita líquida, margem, lucro, %s, ponto de equilíbrio) — igual às fórmulas da planilha.
//
// Depreciação: a planilha lança na aba da matriz. Na da Nazário o resultado da matriz NÃO desconta (o "Total
// despesas" soma só pessoal…outras; o consolidado desconta no "TOTAL COM DEPRECIAÇÃO"): aí ela fica guardada como
// valor da EMPRESA (sem filial). Na da Varela a aba da matriz já desconta: aí fica na filial. O consolidado é o mesmo.

export const LINHAS_DRE = [
  "vendas",
  "outras_receitas_brutas",
  "devolucoes",
  "impostos_vendas",
  "comissoes",
  "custo_mercadoria",
  "ajuste_cmv",
  "despesas_pessoal",
  "despesas_administrativas",
  "despesas_comerciais",
  "outras_despesas",
  "depreciacao",
  "receita_financeira",
  "outras_receitas",
  "despesas_financeiras",
  "ir_csll",
] as const;
export type LinhaDre = (typeof LINHAS_DRE)[number];
export const ehLinhaDre = (v: unknown): v is LinhaDre => typeof v === "string" && (LINHAS_DRE as readonly string[]).includes(v);

export const ROTULO_LINHA: Record<LinhaDre, string> = {
  vendas: "Vendas de mercadorias",
  outras_receitas_brutas: "Outras receitas brutas",
  devolucoes: "(−) Devoluções",
  impostos_vendas: "(−) Impostos s/ vendas",
  comissoes: "(−) Comissões s/ vendas",
  custo_mercadoria: "Custo das mercadorias",
  ajuste_cmv: "Ajuste do CMV",
  despesas_pessoal: "Despesas com pessoal",
  despesas_administrativas: "Despesas administrativas",
  despesas_comerciais: "Despesas comerciais",
  outras_despesas: "Outras despesas / tributos",
  depreciacao: "Depreciação",
  receita_financeira: "Receita financeira",
  outras_receitas: "Outras receitas",
  despesas_financeiras: "Despesas financeiras",
  ir_csll: "IR / CSLL",
};

// ---------- leitura da planilha ----------

const sem = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Conta lançada da linha, pelo texto da coluna A (as linhas calculadas devolvem null). */
function linhaDoRotulo(rotulo: string): LinhaDre | null {
  const t = sem(rotulo);
  if (/^-?\s*vendas de mercadorias/.test(t)) return "vendas";
  if (/devolu/.test(t)) return "devolucoes";
  if (/impostos s\/ ?vendas/.test(t)) return "impostos_vendas";
  if (/comiss(oes|ao) s\/ ?vendas/.test(t)) return "comissoes";
  if (/^custos? da mercadoria/.test(t)) return "custo_mercadoria";
  if (/^\(-\) ?cmv$/.test(t)) return "ajuste_cmv";
  if (/^despesas? (com |c\/ )?pessoal/.test(t)) return "despesas_pessoal";
  if (/^despesas? administrativ/.test(t)) return "despesas_administrativas";
  if (/^despesas? comerci/.test(t)) return "despesas_comerciais";
  if (/^outras despesas/.test(t)) return "outras_despesas";
  if (/^despesas? c(om|\/) ?deprecia/.test(t)) return "depreciacao";
  if (/^receitas? financeira/.test(t)) return "receita_financeira";
  if (/^outras receitas/.test(t)) return "outras_receitas";
  if (/^despesas? financeira/.test(t)) return "despesas_financeiras";
  if (/ir ?\/ ?csll/.test(t)) return "ir_csll";
  return null;
}

/** Data do cabeçalho (número de série do Excel, Date ou "mm/aaaa") → "aaaa-mm". */
function mesDoCabecalho(v: unknown): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000).toISOString().slice(0, 7);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 7);
  if (typeof v === "string") {
    const m = /^(\d{1,2})\/(\d{4})$/.exec(v.trim()) ?? /^\d{1,2}\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
    if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const centavos = (v: number) => Math.round(v * 100) / 100;

/** Abas sem número que são unidades do cadastro. */
const ABAS_ESPECIAIS: Record<string, string> = { trio: "TRIO", televendas: "TLV", terceirizadas: "TERC" };

/**
 * Aba de filial: "CHAPECÓ 302" → F302; "MATRIZ 01" → F001 (Varela numera com 2 dígitos); "TRIO", "TELEVENDAS" e
 * "TERCEIRIZADAS" → TRIO, TLV e TERC. Abas de resumo devolvem null.
 */
export function codigoDaAba(nome: string): string | null {
  const t = nome.trim();
  const especial = ABAS_ESPECIAIS[sem(t)];
  if (especial) return especial;
  const m = /\b(\d{1,3})\s*$/.exec(t);
  return m ? `F${m[1].padStart(3, "0")}` : null;
}

export type AbaLida = {
  aba: string;
  codigo: string;
  /** valores[mes][linha] */
  valores: Record<string, Partial<Record<LinhaDre, number>>>;
  /** "Lucro / Prejuizo" que a própria planilha calculou, por mês (para conferir). */
  lucroPlanilha: Record<string, number>;
};

/** Lê uma aba de filial (matriz linhas × colunas, como o SheetJS devolve com header:1). */
export function lerAbaFilial(aba: string, matriz: unknown[][]): AbaLida | null {
  const codigo = codigoDaAba(aba);
  if (!codigo) return null;
  const cab = matriz[0] ?? [];
  const colunas: { col: number; mes: string }[] = [];
  for (let c = 1; c < cab.length; c++) {
    const mes = mesDoCabecalho(cab[c]);
    if (mes) colunas.push({ col: c, mes });
  }
  if (!colunas.length) return null;
  const valores: AbaLida["valores"] = {};
  const lucroPlanilha: Record<string, number> = {};
  for (const { mes } of colunas) valores[mes] = {};
  let viuReceitaLiquida = false;
  let anterior: LinhaDre | null = null; // conta da última linha com texto
  for (let r = 1; r < matriz.length; r++) {
    const linhaPlanilha = matriz[r] ?? [];
    const rotulo = typeof linhaPlanilha[0] === "string" ? linhaPlanilha[0] : "";
    const t = sem(rotulo);
    if (/^receita liquida/.test(t)) viuReceitaLiquida = true;
    if (/^lucro \/ prejuizo$/.test(t)) {
      for (const { col, mes } of colunas) lucroPlanilha[mes] = centavos(numero(linhaPlanilha[col]));
    }
    let linha = t ? linhaDoRotulo(rotulo) : null;
    if (t) anterior = linha;
    // linhas sem texto: antes da receita líquida somam na receita bruta; logo depois das despesas financeiras,
    // no resultado financeiro (as fórmulas da planilha incluem essas linhas)
    else if (!viuReceitaLiquida) linha = "outras_receitas_brutas";
    else if (anterior === "despesas_financeiras") linha = "despesas_financeiras";
    if (!linha) continue;
    for (const { col, mes } of colunas) {
      const v = numero(linhaPlanilha[col]);
      if (v) valores[mes][linha] = centavos((valores[mes][linha] ?? 0) + v);
    }
  }
  return { aba, codigo, valores, lucroPlanilha };
}

// ---------- contas ----------

export type Lancamentos = Partial<Record<LinhaDre, number>>;

const v = (l: Lancamentos, k: LinhaDre) => l[k] ?? 0;
const pct = (a: number, b: number) => (b ? a / b : null);

/** As contas da DRE a partir dos lançamentos (de uma filial, do consolidado, de um mês ou de vários somados). */
export function calcularDre(l: Lancamentos) {
  const receitaBruta = v(l, "vendas") + v(l, "outras_receitas_brutas");
  const deducoes = v(l, "devolucoes") + v(l, "impostos_vendas") + v(l, "comissoes");
  const receitaLiquida = receitaBruta + deducoes;
  const cmv = v(l, "custo_mercadoria") + v(l, "ajuste_cmv");
  const margem = receitaLiquida + cmv;
  const despesas = v(l, "despesas_pessoal") + v(l, "despesas_administrativas") + v(l, "despesas_comerciais") + v(l, "outras_despesas") + v(l, "depreciacao");
  const lucroOperacional = margem + despesas;
  const financeiro = v(l, "receita_financeira") + v(l, "outras_receitas") + v(l, "despesas_financeiras");
  const lucro = lucroOperacional + financeiro + v(l, "ir_csll");
  const custoFixo = despesas - v(l, "depreciacao");
  const margemSobreBruta = pct(margem, receitaBruta);
  return {
    receitaBruta: centavos(receitaBruta),
    receitaLiquida: centavos(receitaLiquida),
    cmv: centavos(cmv),
    margem: centavos(margem),
    margemPct: pct(margem, receitaLiquida),
    despesas: centavos(despesas),
    despesasPct: pct(Math.abs(despesas), receitaLiquida),
    lucroOperacional: centavos(lucroOperacional),
    lucroOperacionalPct: pct(lucroOperacional, receitaLiquida),
    financeiro: centavos(financeiro),
    lucro: centavos(lucro),
    lucroPct: pct(lucro, receitaLiquida),
    custoFixo: centavos(custoFixo),
    /** Receita bruta que cobre o custo fixo com a margem atual (null = margem ≤ 0: "sem ponto de equilíbrio"). */
    pontoEquilibrio: margemSobreBruta && margemSobreBruta > 0 ? centavos(Math.abs(custoFixo) / margemSobreBruta) : null,
    // indicadores do resumo da planilha (sobre a receita bruta)
    cmvSobreBruta: pct(v(l, "custo_mercadoria"), receitaBruta),
    comissoesSobreBruta: pct(v(l, "comissoes"), receitaBruta),
    impostosSobreBruta: pct(v(l, "impostos_vendas"), receitaBruta),
    despesasSobreBruta: pct(despesas, receitaBruta),
    lucroSobreBruta: pct(lucro, receitaBruta),
  };
}
export type ContasDre = ReturnType<typeof calcularDre>;

export function somarLancamentos(lista: Lancamentos[]): Lancamentos {
  const out: Lancamentos = {};
  for (const l of lista) for (const k of LINHAS_DRE) if (l[k]) out[k] = centavos((out[k] ?? 0) + l[k]!);
  return out;
}

/**
 * Variação de um valor contra o período anterior (null = não há o anterior). A % só existe quando faz sentido: o
 * anterior não é zero e o sinal não virou (de prejuízo para lucro, % não diz nada — fica a diferença em R$).
 */
export function variacaoDre(atual: number, anterior: number | null) {
  if (anterior === null) return null;
  const diferenca = centavos(atual - anterior);
  const pct = anterior !== 0 && Math.sign(atual) === Math.sign(anterior) ? diferenca / Math.abs(anterior) : null;
  return { diferenca, pct };
}

/** Resultado do mês para o resumo: "praticamente empatou" = de 0 a R$ 2.000 (como na planilha). */
export const EMPATE_ATE = 2000;
export function situacaoDoLucro(lucro: number) {
  if (lucro < 0) return "prejuizo" as const;
  if (lucro <= EMPATE_ATE) return "empate" as const;
  return "lucro" as const;
}

// ---------- importação: o que vai para o banco ----------

export type ValorImportar = { codigo: string | null; mes: string; linha: LinhaDre; valor: number };
export type DiferencaPlanilha = { codigo: string; mes: string; planilha: number; sistema: number };
export type Importacao = {
  filiais: { aba: string; codigo: string }[];
  abasIgnoradas: string[];
  meses: string[];
  /** meses da planilha sem vendas (ainda não fechados): não entram; o que tinha lançado neles fica de fora */
  mesesSemVendas: { mes: string; lancado: number }[];
  valores: ValorImportar[];
  /** por mês: vendas e lucro do consolidado (com depreciação), para conferir com a planilha */
  porMes: { mes: string; vendas: number; lucro: number }[];
  diferencas: DiferencaPlanilha[];
};

/** Lê todas as abas e monta a importação (só os meses com vendas). A depreciação vai para a empresa (sem filial). */
export function montarImportacao(abas: { nome: string; matriz: unknown[][] }[]): Importacao {
  const lidas: AbaLida[] = [];
  const abasIgnoradas: string[] = [];
  for (const a of abas) {
    const l = lerAbaFilial(a.nome, a.matriz);
    if (l) lidas.push(l);
    else abasIgnoradas.push(a.nome);
  }
  const todosMeses = [...new Set(lidas.flatMap((l) => Object.keys(l.valores)))].sort();
  const vendasDoMes = (mes: string) => lidas.reduce((s, l) => s + (l.valores[mes]?.vendas ?? 0), 0);
  const meses = todosMeses.filter((m) => vendasDoMes(m) > 0);
  const mesesSemVendas = todosMeses
    .filter((m) => !meses.includes(m))
    .map((mes) => ({ mes, lancado: centavos(lidas.reduce((s, l) => s + Object.values(l.valores[mes] ?? {}).reduce((a, b) => a + Math.abs(b ?? 0), 0), 0)) }))
    .filter((m) => m.lancado > 0);

  const valores: ValorImportar[] = [];
  const diferencas: DiferencaPlanilha[] = [];
  const porMes: Importacao["porMes"] = [];
  for (const mes of meses) {
    const daEmpresa: Lancamentos = {};
    const doMes: Lancamentos[] = [];
    for (const l of lidas) {
      const lanc = { ...(l.valores[mes] ?? {}) };
      // a depreciação fica onde o contador pôs: se o lucro da aba já desconta (Varela), é da filial; senão (Nazário), da empresa
      const planilhaDesconta = lanc.depreciacao !== undefined && l.lucroPlanilha[mes] !== undefined && Math.abs(l.lucroPlanilha[mes] - calcularDre(lanc).lucro) < 0.01;
      if (lanc.depreciacao && !planilhaDesconta) {
        daEmpresa.depreciacao = centavos((daEmpresa.depreciacao ?? 0) + lanc.depreciacao);
        delete lanc.depreciacao;
      }
      for (const k of LINHAS_DRE) if (lanc[k]) valores.push({ codigo: l.codigo, mes, linha: k, valor: lanc[k]! });
      doMes.push(lanc);
      const sistema = calcularDre(lanc).lucro;
      const planilha = l.lucroPlanilha[mes];
      if (planilha !== undefined && Math.abs(planilha - sistema) >= 0.01) diferencas.push({ codigo: l.codigo, mes, planilha, sistema });
    }
    if (daEmpresa.depreciacao) valores.push({ codigo: null, mes, linha: "depreciacao", valor: daEmpresa.depreciacao });
    const total = calcularDre(somarLancamentos([...doMes, daEmpresa]));
    porMes.push({ mes, vendas: total.receitaBruta, lucro: total.lucro });
  }
  return { filiais: lidas.map((l) => ({ aba: l.aba, codigo: l.codigo })), abasIgnoradas, meses, mesesSemVendas, valores, porMes, diferencas };
}

// ---------- rateio por faturamento (aba "FAT %" da planilha) ----------

/** Contas que podem receber rateio (as de receita bruta não: elas são a base da divisão). */
export const LINHAS_RATEIO = [
  "impostos_vendas",
  "comissoes",
  "despesas_pessoal",
  "despesas_administrativas",
  "despesas_comerciais",
  "outras_despesas",
  "despesas_financeiras",
  "ir_csll",
  "receita_financeira",
  "outras_receitas",
] as const satisfies readonly LinhaDre[];
export type LinhaRateio = (typeof LINHAS_RATEIO)[number];
export const ehLinhaRateio = (v: unknown): v is LinhaRateio => typeof v === "string" && (LINHAS_RATEIO as readonly string[]).includes(v);

const RECEITAS_RATEIO = new Set<LinhaRateio>(["receita_financeira", "outras_receitas"]);
/** O valor vai digitado sem sinal; na DRE, receita entra positiva e despesa/dedução negativa. */
export const comSinalDaConta = (linha: LinhaRateio, valor: number) => (RECEITAS_RATEIO.has(linha) ? Math.abs(valor) : -Math.abs(valor));

// ---------- contas lançadas à mão (setembro/2026) ----------

/**
 * Mês em que as contas "amarelas" da planilha (deduções sem imposto, despesas e o financeiro) são digitadas pelo
 * contador na aba "Lançar setembro"; a importação da planilha não mexe nelas (private.dre_manual no banco).
 */
export const MES_MANUAL = "2026-09";
export const LINHAS_MANUAIS = [
  "devolucoes",
  "comissoes",
  "despesas_pessoal",
  "despesas_administrativas",
  "despesas_comerciais",
  "outras_despesas",
  "depreciacao",
  "receita_financeira",
  "outras_receitas",
  "despesas_financeiras",
] as const satisfies readonly LinhaDre[];
export type LinhaManual = (typeof LINHAS_MANUAIS)[number];
export const ehLinhaManual = (v: unknown): v is LinhaManual => typeof v === "string" && (LINHAS_MANUAIS as readonly string[]).includes(v);
/** Digitado como na planilha, sem sinal: receita entra positiva, dedução/despesa negativa; um "-" na frente inverte (estorno). */
export const sinalManual = (linha: LinhaManual) => (linha === "receita_financeira" || linha === "outras_receitas" ? 1 : -1);

/** Os itens que a planilha rateia hoje (PIS/COFINS, ICMS e despesa financeira). */
export const SUGESTOES_RATEIO: { item: string; linha: LinhaRateio }[] = [
  { item: "PIS/COFINS", linha: "impostos_vendas" },
  { item: "ICMS", linha: "impostos_vendas" },
  { item: "Despesa financeira", linha: "despesas_financeiras" },
];

/** Receita bruta (base do rateio) de um conjunto de lançamentos. */
export const baseDoRateio = (l: Lancamentos) => (l.vendas ?? 0) + (l.outras_receitas_brutas ?? 0);

/**
 * Divide o total entre as filiais pela participação de cada uma na base (receita bruta do mês). Filial sem receita
 * não recebe. Os centavos que sobram do arredondamento vão para a filial de maior base, para a soma bater com o total.
 */
export function ratear(total: number, bases: { id: string; base: number }[]) {
  const comBase = bases.filter((b) => b.base > 0);
  const soma = comBase.reduce((s, b) => s + b.base, 0);
  const out = new Map<string, { participacao: number; valor: number }>();
  if (!soma || !total) return out;
  let distribuido = 0;
  for (const b of comBase) {
    const valor = centavos((total * b.base) / soma);
    out.set(b.id, { participacao: b.base / soma, valor });
    distribuido += valor;
  }
  const resto = centavos(total - distribuido);
  if (resto) {
    const maior = comBase.reduce((a, b) => (b.base > a.base ? b : a));
    const r = out.get(maior.id)!;
    r.valor = centavos(r.valor + resto);
  }
  return out;
}
