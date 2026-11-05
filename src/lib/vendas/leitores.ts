// Leitores dos relatórios de vendas do Trier (Excel já convertido em matriz de linhas). Funções puras: recebem a
// matriz e devolvem os números por filial (número da filial no Trier: F002 → 2). Layouts conferidos nos Excel de
// 27/10/2026 (todas as filiais, agrupado por filial).

export type Matriz = unknown[][];

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = txt(v);
  if (!s) return 0;
  const n = Number(/,\d{1,3}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
};
const inteiro = (v: unknown) => (typeof v === "number" ? Number.isInteger(v) : /^\d+$/.test(txt(v)));
const cent = (v: number) => Math.round(v * 100) / 100;
/** "F002 - TERMINAL - 30.598.529/0002-09" (ou "FILIAL: 2 F002 - …") → 2 */
const filialDoTexto = (s: string) => {
  const m = /\bF(\d{1,3})\b/.exec(s);
  return m ? Number(m[1]) : null;
};
const indice = (linha: unknown[], teste: (t: string) => boolean, depoisDe = -1) => linha.findIndex((c, i) => i > depoisDe && teste(txt(c)));

export class LeituraErro extends Error {}

// ---------- Rel_0056 Vendas por Data, agrupado por filial, só o total ----------

export type VendaFilial = { filial: number; atendimentos: number; itens: number; unidades: number; valorBruto: number; desconto: number; venda: number };

/**
 * Cabeçalho: 1ª linha com as formas de pagamento (… TOTAL VENDAS …) e, embaixo, uma linha por medida (Qtd. Vendas,
 * Qtd. Itens, Qtd. Unidades, Valor Bruto, Valor Descto, Média Líquida, Particip.(%), Valor Líquido). Cada filial:
 * "FILIAL: 2 F002 - …", "TOTAL FILIAL:" e uma linha por medida, na mesma ordem. Os números vêm da coluna TOTAL VENDAS.
 */
export function lerVendasPorData(m: Matriz): VendaFilial[] {
  const ih = m.findIndex((l) => indice(l, (t) => t === "TOTAL VENDAS") >= 0);
  if (ih < 0) throw new LeituraErro('não achei a coluna "TOTAL VENDAS" (o relatório mudou?)');
  const col = indice(m[ih], (t) => t === "TOTAL VENDAS");
  const medidas: string[] = [];
  for (let i = ih + 1; i < m.length && !/^FILIAL:|^TOTAL/i.test(txt(m[i][0])); i++) medidas.push(txt(m[i][0]));
  const pos = (re: RegExp) => medidas.findIndex((x) => re.test(x));
  const p = { atend: pos(/^Qtd\. Vendas/i), itens: pos(/^Qtd\. Itens/i), unid: pos(/^Qtd\. Unidades/i), bruto: pos(/^Valor Bruto/i), desc: pos(/^Valor Descto/i), liq: pos(/^Valor L[ií]quido/i) };
  if (Object.values(p).some((v) => v < 0)) throw new LeituraErro(`faltam medidas no cabeçalho (achei: ${medidas.join(", ")})`);
  const out: VendaFilial[] = [];
  let filial: number | null = null;
  for (let i = ih + 1 + medidas.length; i < m.length; i++) {
    const a = txt(m[i][0]);
    if (/^FILIAL:/i.test(a)) filial = filialDoTexto(a);
    else if (/^TOTAL FILIAL/i.test(a) && filial !== null) {
      const v = (k: number) => num(m[i + 1 + k]?.[col]);
      out.push({ filial, atendimentos: Math.round(v(p.atend)), itens: Math.round(v(p.itens)), unidades: v(p.unid), valorBruto: cent(v(p.bruto)), desconto: cent(v(p.desc)), venda: cent(v(p.liq)) });
      i += medidas.length;
      filial = null;
    }
  }
  return out;
}

// ---------- Rel_0080 Custo da Mercadoria Vendida, agrupado por filial e grupo (ou laboratório), só os totais ----------

export type LinhaCmv = { filial: number; codigo: number; nome: string; quantidade: number; venda: number; custo: number };

/**
 * Cabeçalho "Código | Descrição | … | Quant. | Total Venda | … | Total Venda" (a 1ª Total Venda é o valor de venda, a
 * última o custo). Cada filial começa numa linha "2 | | | F002 - …"; depois uma linha por grupo/laboratório
 * "102 | GENERICOS | … | qtd | venda | … | custo". "Total Geral:" no fim.
 */
export function lerCmvAgrupado(m: Matriz): LinhaCmv[] {
  const ih = m.findIndex((l) => txt(l[0]) === "Código" && indice(l, (t) => t === "Quant.") >= 0);
  if (ih < 0) throw new LeituraErro('não achei o cabeçalho "Código … Quant. … Total Venda" (o relatório mudou?)');
  const h = m[ih];
  const cq = indice(h, (t) => t === "Quant.");
  const cv = indice(h, (t) => t === "Total Venda", cq);
  const cc = h.map(txt).lastIndexOf("Total Venda");
  if (cv < 0 || cc <= cv) throw new LeituraErro("não achei as colunas de venda e custo");
  const out: LinhaCmv[] = [];
  let filial: number | null = null;
  for (let i = ih + 1; i < m.length; i++) {
    const l = m[i];
    const a = txt(l[0]);
    const b = txt(l[1]);
    if (!inteiro(l[0])) continue; // sub-cabeçalho, Total Geral, rodapé
    if (!b) {
      const f = filialDoTexto(l.map(txt).join(" "));
      if (f !== null) filial = f;
      continue;
    }
    if (filial === null) throw new LeituraErro(`linha ${i + 1} antes da primeira filial (o relatório veio sem agrupar por filial?)`);
    out.push({ filial, codigo: Number(a), nome: b, quantidade: num(l[cq]), venda: cent(num(l[cv])), custo: cent(num(l[cc])) });
  }
  return out;
}

// ---------- Rel_0028 Vendas por Vendedor ----------

export type LinhaVendedorGrupo = { filial: number; vendedor: number; vendedorNome: string; grupo: number; grupoNome: string; quantidade: number; desconto: number; custo: number; venda: number };

/**
 * "Totais por vendedor e grupo de produtos", agrupado por filial. "Filial: | | 2 | F002 - …", "Vendedor: | | 1165 |
 * NOME", uma linha por grupo "47 | PREMIUM | | | qtd | desconto | custo | vendas | …", "Total Vendedor:" e
 * "Rentab. Vendedor:". Cabeçalho com quebras de linha: Quantidade, Valor de Desconto, Valor de Custo, Valor de Vendas.
 */
export function lerVendedorGrupo(m: Matriz): LinhaVendedorGrupo[] {
  const ih = m.findIndex((l) => txt(l[0]) === "Código" && indice(l, (t) => /^Quantidade/i.test(t)) >= 0);
  if (ih < 0) throw new LeituraErro('não achei o cabeçalho "Código | Grupo de produtos | Quantidade …" (o relatório mudou?)');
  const h = m[ih];
  const cq = indice(h, (t) => /^Quantidade/i.test(t));
  const cd = indice(h, (t) => /^Valor de Desconto/i.test(t));
  const cc = indice(h, (t) => /^Valor de Custo/i.test(t));
  const cv = indice(h, (t) => /^Valor de Vendas/i.test(t));
  if ([cd, cc, cv].some((c) => c < 0)) throw new LeituraErro("não achei as colunas de desconto, custo e vendas");
  const out: LinhaVendedorGrupo[] = [];
  let filial: number | null = null;
  let vendedor: { codigo: number; nome: string } | null = null;
  for (let i = ih + 1; i < m.length; i++) {
    const l = m[i];
    const a = txt(l[0]);
    if (/^Filial:/i.test(a)) {
      filial = filialDoTexto(l.map(txt).join(" "));
      vendedor = null;
    } else if (/^Vendedor:/i.test(a)) {
      const cod = l.slice(1).find((c) => inteiro(c));
      const nome = l.slice(1).map(txt).filter((t) => t && !/^\d+$/.test(t))[0] ?? "";
      vendedor = cod === undefined ? null : { codigo: Number(cod), nome };
    } else if (inteiro(l[0]) && txt(l[1]) && filial !== null && vendedor) {
      out.push({ filial, vendedor: vendedor.codigo, vendedorNome: vendedor.nome, grupo: Number(a), grupoNome: txt(l[1]), quantidade: num(l[cq]), desconto: cent(num(l[cd])), custo: cent(num(l[cc])), venda: cent(num(l[cv])) });
    }
  }
  return out;
}

export type LinhaVendedor = { filial: number; vendedor: number; vendedorNome: string; atendimentos: number; custo: number; venda: number };

/**
 * "Totais por vendedor", agrupado por filial (também a versão só tele-entrega). Cabeçalho "Código | | Vendedor |
 * Qtd. Vendas | | Valor Custo | Valor Vendas | Margem Lucro"; "Filial: | 2 | F002 - …"; uma linha por vendedor;
 * "Total Filial:" e "Total Geral:".
 */
export function lerVendasPorVendedor(m: Matriz): LinhaVendedor[] {
  const ih = m.findIndex((l) => txt(l[0]) === "Código" && indice(l, (t) => t === "Qtd. Vendas") >= 0);
  if (ih < 0) throw new LeituraErro('não achei o cabeçalho "Código | Vendedor | Qtd. Vendas …" (o relatório mudou?)');
  const h = m[ih];
  const cn = indice(h, (t) => t === "Vendedor");
  const cq = indice(h, (t) => t === "Qtd. Vendas");
  const cc = indice(h, (t) => t === "Valor Custo");
  const cv = indice(h, (t) => t === "Valor Vendas");
  if ([cn, cc, cv].some((c) => c < 0)) throw new LeituraErro("não achei as colunas de vendedor, custo e vendas");
  const out: LinhaVendedor[] = [];
  let filial: number | null = null;
  for (let i = ih + 1; i < m.length; i++) {
    const l = m[i];
    const a = txt(l[0]);
    if (/^Filial:/i.test(a)) filial = filialDoTexto(l.map(txt).join(" "));
    else if (inteiro(l[0]) && filial !== null && txt(l[cn])) out.push({ filial, vendedor: Number(a), vendedorNome: txt(l[cn]), atendimentos: Math.round(num(l[cq])), custo: cent(num(l[cc])), venda: cent(num(l[cv])) });
  }
  return out;
}

// ---------- Rel_0027 Relação de Vendas, só vendas e-commerce, agrupado por filial ----------

export type VendaEcommerce = { filial: number; vendedor: number; venda: number; atendimentos: number };

/**
 * Uma linha por venda (Núm. Venda | Fil. | … | Vend. | … | Total Líquido) e, embaixo, as formas de pagamento dela
 * (CARTAO … ECOMMERCE). Soma por filial e vendedor; devolução (líquido negativo) desconta um atendimento.
 * Layout conferido nos Excel de 15 a 29/10/2026.
 */
export function lerVendasEcommerce(m: Matriz): VendaEcommerce[] {
  const ih = m.findIndex((l) => indice(l, (t) => t === "Vend.") >= 0 && indice(l, (t) => /L[ií]quido/i.test(t)) >= 0);
  if (ih < 0) {
    // dia sem venda e-commerce: o Trier manda só o cabeçalho do filtro
    if (m.some((l) => l.some((c) => /^Forma de Pagamento:/i.test(txt(c))))) return [];
    throw new LeituraErro('não achei o cabeçalho "Núm. Venda | Fil. | … | Vend. | … | Total Líquido" (o relatório mudou?)');
  }
  const h = m[ih];
  const cNum = indice(h, (t) => /^N[uú]m/i.test(t));
  const cFil = indice(h, (t) => t === "Fil.");
  const cVend = indice(h, (t) => t === "Vend.");
  const cLiq = indice(h, (t) => /L[ií]quido/i.test(t));
  if ([cNum, cFil, cVend, cLiq].some((c) => c < 0)) throw new LeituraErro("não achei as colunas de venda, filial, vendedor e líquido");
  const soma = new Map<string, VendaEcommerce>();
  for (let i = ih + 1; i < m.length; i++) {
    const l = m[i];
    if (!inteiro(l[cNum]) || !inteiro(l[cFil]) || !inteiro(l[cVend]) || typeof l[cLiq] !== "number") continue;
    const filial = Number(l[cFil]);
    const vendedor = Number(l[cVend]);
    const liquido = num(l[cLiq]);
    const k = `${filial}|${vendedor}`;
    const atual = soma.get(k) ?? { filial, vendedor, venda: 0, atendimentos: 0 };
    atual.venda = cent(atual.venda + liquido);
    atual.atendimentos += liquido < 0 ? -1 : 1;
    soma.set(k, atual);
  }
  return [...soma.values()];
}

/** "Total Geral:" do relatório (coluna de venda), para conferir a soma do que foi lido. */
export function totalGeral(m: Matriz, coluna: (cabecalho: unknown[]) => number): number | null {
  const ih = m.findIndex((l) => txt(l[0]) === "Código");
  const l = m.find((x) => x.some((c) => /^Total Geral:?$/i.test(txt(c))));
  if (ih < 0 || !l) return null;
  const c = coluna(m[ih]);
  return c >= 0 ? cent(num(l[c])) : null;
}

// ---------- Rel_0024 Vendas Produtos, totais por data, agrupado por filial (receita do mês para a DRE) ----------

export type ReceitaFilial = { filial: number; nome: string; venda: number; custo: number; dias: number };

/**
 * Cabeçalho "Data | … | Qtd. Vendid | Total Vlr. Custo | Total Vlr. Bruto | Total Vlr. Descto | % Descto | Total Vlr. Vend.
 * | Part. %"; cada filial abre com "Filial: | 1 | F001 - FRETTA - …", segue uma linha por dia (data em número de série) e
 * fecha com "Total Filial:"; no fim, "Total Geral:". Confere: os dias somam o total de cada filial e as filiais somam o
 * Total Geral; qualquer diferença acima de 5 centavos é erro (nada é gravado).
 */
export function lerReceitaPorFilial(m: Matriz): { filiais: ReceitaFilial[]; totalGeral: number } {
  const iCab = m.findIndex((r) => (r ?? []).some((c) => /vlr\.?\s*vend/i.test(txt(c))));
  if (iCab < 0) throw new LeituraErro('não achei a coluna "Total Vlr. Vend." no relatório');
  const cVenda = indice(m[iCab], (t) => /vlr\.?\s*vend/i.test(t));
  const cCusto = indice(m[iCab], (t) => /vlr\.?\s*custo/i.test(t));
  const filiais: ReceitaFilial[] = [];
  let atual: (ReceitaFilial & { somaDias: number }) | null = null;
  let totalGeral: number | null = null;
  for (let i = iCab + 1; i < m.length; i++) {
    const r = m[i] ?? [];
    const a = txt(r[0]);
    if (/^filial:?$/i.test(a)) {
      if (atual) throw new LeituraErro(`a filial ${atual.filial} não fechou com "Total Filial"`);
      const n = inteiro(r[1]) ? Number(r[1]) : filialDoTexto(txt(r[2]));
      if (n === null || !Number.isFinite(n)) throw new LeituraErro(`linha ${i + 1}: não entendi o número da filial`);
      atual = { filial: n, nome: txt(r[2]), venda: 0, custo: 0, dias: 0, somaDias: 0 };
    } else if (/^total filial/i.test(a)) {
      if (!atual) throw new LeituraErro(`linha ${i + 1}: "Total Filial" sem filial aberta`);
      const venda = cent(num(r[cVenda]));
      if (Math.abs(cent(atual.somaDias) - venda) > 0.05) throw new LeituraErro(`filial ${atual.filial}: os dias somam ${cent(atual.somaDias)} e o total da filial é ${venda}`);
      filiais.push({ filial: atual.filial, nome: atual.nome, venda, custo: cent(num(r[cCusto])), dias: atual.dias });
      atual = null;
    } else if (/^total geral/i.test(a)) {
      totalGeral = cent(num(r[cVenda]));
    } else if (atual && (typeof r[0] === "number" || /^\d{2}\/\d{2}\/\d{4}$/.test(a))) {
      atual.somaDias += num(r[cVenda]);
      atual.dias += 1;
    }
  }
  if (atual) throw new LeituraErro(`a filial ${atual.filial} não fechou com "Total Filial"`);
  if (totalGeral === null) throw new LeituraErro('o relatório não trouxe o "Total Geral"');
  if (!filiais.length) throw new LeituraErro("o relatório não trouxe nenhuma filial");
  const soma = cent(filiais.reduce((s, f) => s + f.venda, 0));
  if (Math.abs(soma - totalGeral) > 0.05) throw new LeituraErro(`as filiais somam ${soma} e o Total Geral é ${totalGeral}`);
  return { filiais, totalGeral };
}
