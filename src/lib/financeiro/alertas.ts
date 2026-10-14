// Alertas da visão geral (iguais aos do dashboard anterior): prejuízo no mês, categorias muito acima
// da média dos 3 meses anteriores, maior gasto e categoria que mais consumiu.
import type { FinTipo } from "./rotulos";

export type Alerta = { id: string; nivel: "critico" | "atencao" | "info"; texto: string };

type LinhaCat = { categoria_id: string; competencia: string; tipo: FinTipo; total: number };
type Categoria = { id: string; nome: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function montarAlertas(linhas: LinhaCat[], categorias: Categoria[], mesRef: string, rotuloMes: (m: string) => string): Alerta[] {
  const alertas: Alerta[] = [];
  const nome = new Map(categorias.map((c) => [c.id, c.nome]));
  const meses = [...new Set(linhas.map((l) => l.competencia))].sort();
  const rec = linhas.filter((l) => l.tipo === "receber" && l.competencia === mesRef).reduce((s, l) => s + l.total, 0);
  const pag = linhas.filter((l) => l.tipo === "pagar" && l.competencia === mesRef).reduce((s, l) => s + l.total, 0);
  if (rec > 0 && rec - pag < 0) {
    alertas.push({ id: `prejuizo-${mesRef}`, nivel: "critico", texto: `Resultado de ${rotuloMes(mesRef)} está negativo: ${moeda(rec - pag)} (receita ${moeda(rec)} − despesa ${moeda(pag)}).` });
  }
  const anteriores = meses.filter((m) => m < mesRef).slice(-3);
  if (anteriores.length >= 2) {
    const media = new Map<string, number>();
    const atual = new Map<string, number>();
    for (const l of linhas) {
      if (l.tipo !== "pagar") continue;
      if (anteriores.includes(l.competencia)) media.set(l.categoria_id, (media.get(l.categoria_id) ?? 0) + l.total);
      if (l.competencia === mesRef) atual.set(l.categoria_id, (atual.get(l.categoria_id) ?? 0) + l.total);
    }
    [...atual.entries()]
      .map(([id, v]) => ({ id, v, media: (media.get(id) ?? 0) / anteriores.length }))
      .filter((x) => x.media >= 100 && x.v > x.media * 1.3)
      .sort((a, b) => b.v - b.media - (a.v - a.media))
      .slice(0, 3)
      .forEach((x) => alertas.push({ id: `acima-${mesRef}-${x.id}`, nivel: "atencao", texto: `${nome.get(x.id) ?? "Categoria"} está ${((x.v / x.media - 1) * 100).toFixed(0)}% acima da média mensal (${moeda(x.v)} vs ${moeda(x.media)}).` }));
  }
  const gastos = linhas.filter((l) => l.tipo === "pagar" && l.competencia === mesRef);
  if (gastos.length) {
    const porCat = new Map<string, number>();
    for (const g of gastos) porCat.set(g.categoria_id, (porCat.get(g.categoria_id) ?? 0) + g.total);
    const [catTop, valTop] = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = gastos.reduce((s, g) => s + g.total, 0);
    alertas.push({ id: `cattop-${mesRef}`, nivel: "info", texto: `Categoria que mais consumiu em ${rotuloMes(mesRef)}: ${nome.get(catTop) ?? "—"} — ${moeda(valTop)} (${((valTop / total) * 100).toFixed(0)}% das saídas).` });
  }
  return alertas;
}
