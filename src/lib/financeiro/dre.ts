// Montagem da DRE (demonstrativo contábil) a partir dos lançamentos, do molde (fin_dre_estrutura /
// classificação das categorias), dos ajustes manuais do contador e dos saldos de caixa.
// Mesmas regras da aba "Contábil" do fluxo de caixa anterior: ajuste manual tem prioridade sobre o
// automático; totais/percentuais só a partir da competência inicial escolhida; cadeia de saldo encadeada.
import type { FinTipo } from "./rotulos";

export type CategoriaDre = { id: string; nome: string; grupo: string; tipo: FinTipo; dre_familia: string | null; dre_grupo: string | null; dre_sinal: number | null };
export type EstruturaDre = { familia: string; grupo: string; ordem_familia: number; ordem_grupo: number; sinal: number };

export type CelulaDre = { valor: number; auto: number; ajustado: boolean };
export type LinhaCategoria = { id: string; nome: string; porMes: Record<string, CelulaDre>; total: number };
/** Linha de total que também se digita: o digitado vale no lugar da conta (auto) e o resto soma a partir dele. */
export type SerieDigitavel = { chave: string; porMes: Record<string, number>; total: number; auto: Record<string, number>; digitado: Record<string, number | null> };
export type LinhaGrupo = SerieDigitavel & { nome: string; categorias: LinhaCategoria[] };
export type LinhaFamilia = SerieDigitavel & { nome: string; sinal: number; grupos: LinhaGrupo[] };

/** Chaves das linhas de total (fin_dre_ajustes_linhas.linha). */
export const chaveFamilia = (familia: string) => `F|${familia}`;
export const chaveGrupo = (familia: string, grupo: string) => `G|${familia}|${grupo}`;
export const CHAVE_SAIDAS = "S";
export const CHAVE_RESULTADO = "R";

export type Dre = {
  meses: string[];
  mesesTotal: string[];
  familias: LinhaFamilia[];
  naoClassificadas: LinhaCategoria[];
  saidas: SerieDigitavel;
  resultado: SerieDigitavel;
  receitas: { porMes: Record<string, number>; total: number };
  saldoInicial: Record<string, number | null>;
  /** saldo inicial digitado no mês (null = calculado pela cadeia) */
  saldoDigitado: Record<string, number | null>;
  acumulado: Record<string, number | null>;
  /** resultado acumulado pela conta (sem o digitado no mês) */
  acumuladoAuto: Record<string, number | null>;
  saldos: Record<string, Record<string, number | null>>; // campo → mês → valor
  /** digitados neste recorte: caixinha / contas correntes / limites (no total, sem eles vale a soma das filiais),
   *  acumulado, capacidade, payback */
  saldosDigitados: Record<string, Record<string, number | null>>;
  capacidade: Record<string, number | null>;
  payback: Record<string, number | null>;
  totalReceitas: number;
  /** quanto o saldo (no começo / no fim do mês) difere da conta sem nenhum saldo digitado (sobe para o total de cima) */
  correcao: Record<string, number>;
  correcaoFim: Record<string, number>;
  /** meses com saldo inicial digitado aqui ou nas filiais/grupos de baixo */
  eventos: string[];
  /** `${linha}|${mes}` → quanto a linha de total ficou diferente da conta (sobe para o total de cima) */
  deltaLinhas: Record<string, number>;
};

export const CAMPOS_SALDO = [
  { campo: "caixinha", rotulo: "TOTAL CAIXINHA" },
  { campo: "contas_correntes", rotulo: "TOTAL CONTAS CORRENTES" },
  { campo: "limites_bancos", rotulo: "LIMITES BANCOS" },
] as const;
/** Campos de fin_dre_saldos que só valem no recorte onde foram digitados (o total de cima não soma). */
export const CAMPOS_DIGITADOS_LOCAIS = ["acumulado", "capacidade", "payback"] as const;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function montarDre(args: {
  categorias: CategoriaDre[];
  estrutura: EstruturaDre[];
  valores: Map<string, number>; // `${categoriaId}|${mes}` → soma automática
  ajustes: Map<string, number>; // `${categoriaId}|${mes}` → valor manual
  saldos: Map<string, number>; // `${campo}|${mes}` — no total, caixinha/contas/limites já com a soma das filiais
  saldosProprios?: Map<string, number>; // os digitados neste recorte (padrão: saldos)
  mesesComDados: string[];
  de?: string; // competência inicial dos totais
  correcoes?: Map<string, number>; // mês → soma das correções de saldo (começo do mês) das filiais/grupos de baixo
  correcoesFim?: Map<string, number>; // idem, no fim do mês (padrão: correcoes)
  eventos?: string[]; // meses com saldo inicial digitado nas filiais/grupos de baixo
  todasCategorias?: boolean; // mostra também as contas do molde sem valor (para digitar nelas)
  ajustesLinhas?: Map<string, number>; // `${linha}|${mes}` → digitado na linha de total (família/grupo sem sinal; S e R com sinal)
  deltasLinhas?: Map<string, number>; // `${linha}|${mes}` → soma dos deltaLinhas das filiais/grupos de baixo
}): Dre {
  const mesDaChave = (k: string) => k.slice(-7);
  const meses = [...new Set([...args.mesesComDados, ...[...args.ajustes.keys(), ...(args.ajustesLinhas?.keys() ?? []), ...(args.deltasLinhas?.keys() ?? [])].map(mesDaChave)])].sort();
  const de = (args.de && meses.find((m) => m >= args.de!)) || meses[0];
  const mesesTotal = meses.filter((m) => !de || m >= de);
  const porId = new Map(args.categorias.map((c) => [c.id, c]));

  const auto = (id: string, m: string) => args.valores.get(`${id}|${m}`) ?? 0;
  const eff = (id: string, m: string) => args.ajustes.get(`${id}|${m}`) ?? auto(id, m);
  const effTot = (id: string) => mesesTotal.reduce((s, m) => s + eff(id, m), 0);
  const temDado = (id: string) => meses.some((m) => eff(id, m) !== 0 || args.ajustes.has(`${id}|${m}`));

  // sinal: estrutura → categoria → tipo
  const sinalEstrutura = new Map(args.estrutura.map((e) => [`${e.familia}|${e.grupo}`, e.sinal]));
  const sinalDe = (c: CategoriaDre) => (c.dre_familia && c.dre_grupo ? sinalEstrutura.get(`${c.dre_familia}|${c.dre_grupo}`) : undefined) ?? c.dre_sinal ?? (c.tipo === "receber" ? 1 : -1);

  // ordem das famílias/grupos: estrutura primeiro, depois o que aparecer nas categorias
  const ordemFam = new Map<string, number>();
  const ordemGrp = new Map<string, number>();
  for (const e of args.estrutura) {
    if (!ordemFam.has(e.familia)) ordemFam.set(e.familia, e.ordem_familia);
    ordemGrp.set(`${e.familia}|${e.grupo}`, e.ordem_grupo);
  }
  const comValor = args.categorias.filter((c) => temDado(c.id));
  // contas sem valor: as do molde, uma por nome em cada grupo (há categorias repetidas em grupos de origem diferentes)
  const vistas = new Set(comValor.map((c) => `${c.dre_familia}|${c.dre_grupo ?? c.dre_familia}|${c.nome}`));
  const semValor = !args.todasCategorias
    ? []
    : [...args.categorias]
        .sort((a, b) => Number(a.grupo !== a.dre_grupo) - Number(b.grupo !== b.dre_grupo))
        .filter((c) => {
          if (!c.dre_familia || temDado(c.id)) return false;
          const k = `${c.dre_familia}|${c.dre_grupo ?? c.dre_familia}|${c.nome}`;
          if (vistas.has(k)) return false;
          vistas.add(k);
          return true;
        });
  const comDados = [...comValor, ...semValor];
  const linhaCat = (c: CategoriaDre, sinal: number): LinhaCategoria => ({
    id: c.id,
    nome: c.nome,
    porMes: Object.fromEntries(meses.map((m) => [m, { valor: r2(sinal * eff(c.id, m)), auto: r2(sinal * auto(c.id, m)), ajustado: args.ajustes.has(`${c.id}|${m}`) }])),
    total: r2(sinal * effTot(c.id)),
  });

  // linha de total: soma de baixo (+ o que as filiais/grupos de baixo digitaram nela); digitado aqui vale no lugar
  const deltaLinhas: Record<string, number> = {};
  const serie = (chave: string, somaMes: (m: string) => number, comSinal: (digitado: number) => number): SerieDigitavel => {
    const auto: Record<string, number> = {};
    const digitado: Record<string, number | null> = {};
    const porMes: Record<string, number> = {};
    for (const m of meses) {
      const soma = somaMes(m);
      auto[m] = r2(soma + (args.deltasLinhas?.get(`${chave}|${m}`) ?? 0));
      const dig = args.ajustesLinhas?.get(`${chave}|${m}`) ?? null;
      digitado[m] = dig;
      porMes[m] = dig !== null ? r2(comSinal(dig)) : auto[m];
      const d = r2(porMes[m] - soma);
      if (d) deltaLinhas[`${chave}|${m}`] = d;
    }
    return { chave, porMes, total: r2(mesesTotal.reduce((s, m) => s + porMes[m], 0)), auto, digitado };
  };

  const familias: LinhaFamilia[] = [];
  const nomesFam = [...new Set([...ordemFam.keys(), ...comDados.map((c) => c.dre_familia).filter((f): f is string => !!f)])].sort((a, b) => (ordemFam.get(a) ?? 999) - (ordemFam.get(b) ?? 999) || a.localeCompare(b));
  const usadas = new Set<string>();
  for (const fam of nomesFam) {
    const cats = comDados.filter((c) => c.dre_familia === fam);
    if (!cats.length) continue;
    const sinal = sinalDe(cats[0]);
    // família e grupo digitados sem sinal, como as categorias: a tela põe o sinal da família
    const comSinal = (v: number) => sinal * Math.abs(v);
    const nomesGrp = [...new Set(cats.map((c) => c.dre_grupo ?? fam))].sort((a, b) => (ordemGrp.get(`${fam}|${a}`) ?? 999) - (ordemGrp.get(`${fam}|${b}`) ?? 999) || a.localeCompare(b));
    const grupos: LinhaGrupo[] = nomesGrp.map((g) => {
      const lista = cats.filter((c) => (c.dre_grupo ?? fam) === g).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")).map((c) => linhaCat(c, sinal));
      lista.forEach((l) => usadas.add(l.id));
      return { nome: g, categorias: lista, ...serie(chaveGrupo(fam, g), (m) => r2(lista.reduce((s, l) => s + l.porMes[m].valor, 0)), comSinal) };
    });
    familias.push({ nome: fam, sinal, grupos, ...serie(chaveFamilia(fam), (m) => r2(grupos.reduce((s, g) => s + g.porMes[m], 0)), comSinal) });
  }
  const naoClassificadas = comDados
    .filter((c) => !usadas.has(c.id))
    .map((c) => linhaCat(c, c.tipo === "receber" ? 1 : -1))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const receitaMes = (m: string) => r2(familias.filter((f) => f.sinal > 0).reduce((s, f) => s + f.porMes[m], 0) + naoClassificadas.filter((l) => porId.get(l.id)?.tipo === "receber").reduce((s, l) => s + l.porMes[m].valor, 0));
  const saidas = serie(
    CHAVE_SAIDAS,
    (m) => r2(-familias.filter((f) => f.sinal < 0).reduce((s, f) => s + f.porMes[m], 0) - naoClassificadas.filter((l) => porId.get(l.id)?.tipo !== "receber").reduce((s, l) => s + l.porMes[m].valor, 0)),
    (v) => v,
  );
  const resultado = serie(CHAVE_RESULTADO, (m) => r2(receitaMes(m) - saidas.porMes[m]), (v) => v);
  const resultadoMes = (m: string) => resultado.porMes[m];
  const soma = (fn: (m: string) => number) => r2(mesesTotal.reduce((s, m) => s + fn(m), 0));

  // cadeia de saldo: começa no 1º mês do período com zero e soma o resultado de cada mês; um saldo inicial digitado
  // recomeça a conta no começo do mês, um resultado acumulado digitado recomeça no fim. No total (grupo, todas), o que
  // foi digitado numa filial/grupo de baixo entra como diferença daquele mês em diante (correcoes / correcoesFim). Os
  // meses antes do primeiro saldo inicial digitado (aqui ou embaixo) ficam sem saldo — ainda não tinha caixa controlado.
  const saldoVal = (campo: string, m: string) => args.saldos.get(`${campo}|${m}`) ?? null;
  const digitado = (m: string) => saldoVal("saldo_inicial", m);
  const acumDigitado = (m: string) => saldoVal("acumulado", m);
  const kIni = (m: string) => args.correcoes?.get(m) ?? 0;
  const kFim = (m: string) => args.correcoesFim?.get(m) ?? kIni(m);
  const eventos = new Set([...(args.eventos ?? []), ...meses.filter((m) => digitado(m) !== null)]);
  const primeiroDigitado = meses.find((m) => digitado(m) !== null);
  // saldo digitado antes do início dos totais: a conta já vem dele
  const partida = primeiroDigitado && mesesTotal[0] && primeiroDigitado < mesesTotal[0] ? primeiroDigitado : mesesTotal[0];
  const mostraDesde = meses.find((m) => eventos.has(m)) ?? mesesTotal[0];
  const saldoInicial: Record<string, number | null> = {};
  const acumulado: Record<string, number | null> = {};
  const acumuladoAuto: Record<string, number | null> = {};
  const correcao: Record<string, number> = {};
  const correcaoFim: Record<string, number> = {};
  let fimAnterior: number | null = null;
  let kFimAnterior = 0;
  let semSaldo: number | null = null; // a mesma conta sem nada digitado (no começo do mês)
  for (const m of meses) {
    if (m === mesesTotal[0]) semSaldo = 0;
    let ini: number | null = null;
    if (digitado(m) !== null) ini = digitado(m);
    else if (fimAnterior !== null) ini = r2(fimAnterior + kIni(m) - kFimAnterior);
    else if (m === partida) ini = kIni(m);
    const res = resultadoMes(m);
    const fimConta = ini === null ? null : r2(ini + res + kFim(m) - kIni(m));
    const fim = acumDigitado(m) ?? fimConta;
    const semSaldoFim: number | null = semSaldo === null ? null : r2(semSaldo + res);
    correcao[m] = ini === null ? 0 : r2(ini - (semSaldo ?? 0));
    correcaoFim[m] = fim === null ? 0 : r2(fim - (semSaldoFim ?? 0));
    const mostra = ini !== null && mesesTotal.includes(m) && (mostraDesde === undefined || m >= mostraDesde);
    saldoInicial[m] = mostra ? ini : null;
    acumulado[m] = (mostra || acumDigitado(m) !== null) && mesesTotal.includes(m) ? fim : null;
    acumuladoAuto[m] = mostra ? fimConta : null;
    semSaldo = semSaldoFim;
    fimAnterior = fim;
    kFimAnterior = kFim(m);
  }
  const capacidade: Record<string, number | null> = {};
  const payback: Record<string, number | null> = {};
  mesesTotal.forEach((m, i) => {
    const capDig = saldoVal("capacidade", m);
    const payDig = saldoVal("payback", m);
    if (acumulado[m] == null) {
      capacidade[m] = capDig;
      payback[m] = payDig;
      return;
    }
    const rec = receitaMes(m);
    capacidade[m] = capDig ?? (rec ? r2(((acumulado[m] ?? 0) / rec) * 100) : null);
    const prev = i > 0 ? resultadoMes(mesesTotal[i - 1]) : resultadoMes(m);
    const med = (prev + resultadoMes(m)) / 2;
    payback[m] = payDig ?? (med ? Math.round(((acumulado[m] ?? 0) / med) * 100) / 100 : null);
  });

  const proprios = args.saldosProprios ?? args.saldos;
  return {
    meses,
    mesesTotal,
    familias,
    naoClassificadas,
    saidas,
    resultado,
    receitas: { porMes: Object.fromEntries(meses.map((m) => [m, receitaMes(m)])), total: soma(receitaMes) },
    saldoInicial,
    saldoDigitado: Object.fromEntries(meses.map((m) => [m, digitado(m)])),
    acumulado,
    acumuladoAuto,
    saldos: Object.fromEntries(CAMPOS_SALDO.map((c) => [c.campo, Object.fromEntries(meses.map((m) => [m, saldoVal(c.campo, m)]))])),
    saldosDigitados: Object.fromEntries(
      [...CAMPOS_SALDO.map((c) => c.campo), ...CAMPOS_DIGITADOS_LOCAIS].map((campo) => [campo, Object.fromEntries(meses.map((m) => [m, proprios.get(`${campo}|${m}`) ?? null]))]),
    ),
    capacidade,
    payback,
    totalReceitas: soma(receitaMes),
    correcao,
    correcaoFim,
    eventos: [...eventos].sort(),
    deltaLinhas,
  };
}

/** Família financeira (visão de caixa) de uma categoria: cadastro → regras por grupo → "Outras Despesas". */
export function familiaFinanceira(c: { tipo: FinTipo; nome: string; grupo: string; fin_familia: string | null; fin_grupo: string | null }) {
  if (c.tipo === "receber") return { familia: "Recebimentos", grupo: c.grupo || "Recebimentos" };
  if (c.fin_familia) return { familia: c.fin_familia, grupo: c.fin_grupo ?? c.fin_familia };
  const g = c.grupo ?? "";
  if (/custo da merc/i.test(g)) return { familia: "Custo da Mercadoria", grupo: "Custo da Mercadoria" };
  if (/investimento/i.test(g)) return { familia: "Investimento", grupo: "Investimento" };
  if (/financeir/i.test(g)) {
    return /pagamento|cons[oó]rcio|empr[eé]stim|capital de giro|\bfgi\b|antecipa/i.test(c.nome) ? { familia: "Pagamento de Empréstimos", grupo: "Pagamento de Empréstimos" } : { familia: "Despesas Financeiras", grupo: "Despesas Financeiras" };
  }
  return { familia: "Outras Despesas", grupo: g || "Outras" };
}

export const ORDEM_FAMILIAS_FIN = ["Recebimentos", "Custo da Mercadoria", "Despesas Fixas", "Despesas Variáveis", "Despesas Financeiras", "Pagamento de Empréstimos", "Investimento", "Outras Despesas"];
export const ordemFamiliaFin = (a: string, b: string) => (ORDEM_FAMILIAS_FIN.indexOf(a) + 1 || 99) - (ORDEM_FAMILIAS_FIN.indexOf(b) + 1 || 99) || a.localeCompare(b);

export const GRUPOS_DESPESA_ORD = ["Custo da Mercadoria", "Despesas Administrativas", "Despesas com Pessoal", "Despesas de Vendas e Marketing", "Despesas Financeiras", "Devoluções de Vendas e Cancelamentos", "Impostos e Taxas", "Investimento", "Outras Despesas", "Patronal / Retiradas"];
export const GRUPOS_RECEITA_ORD = ["Receitas Operacionais", "Receitas Não Operacionais", "Outras Entradas", "Receitas Financeiras", "Devoluções de Compra"];
export const abreviarGrupo = (g: string) =>
  g.replace("Custo da Mercadoria", "Fornecedores").replace("Despesas ", "Desp. ").replace("Devoluções de Vendas e Cancelamentos", "Devoluções").replace("Patronal / Retiradas", "Patronal");
