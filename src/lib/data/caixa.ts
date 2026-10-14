import { listarCategorias, listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { movimentoDiario, rpcPaginado } from "@/lib/data/dre";
import { familiaFinanceira, ordemFamiliaFin } from "@/lib/financeiro/dre";
import { EMPRESAS_CAIXA, type FinTipo } from "@/lib/financeiro/rotulos";
import { createClient } from "@/lib/supabase/server";

type Empresa = (typeof EMPRESAS_CAIXA)[number];

async function unidadesDaEmpresa(e: Empresa) {
  const unidades = await listarUnidadesFinanceiro();
  return unidades.filter((u) => (e.grupos as readonly string[]).includes(u.grupo)).map((u) => u.id);
}

// ---------- diário ----------

export type DiarioEmpresa = {
  empresa: string;
  pagoAuto: number;
  recebidoLancado: number;
  campos: Record<string, number | null>;
  textos: Record<string, string | null>;
};

export async function fluxoDiario(data: string): Promise<DiarioEmpresa[]> {
  const supabase = await createClient();
  const { data: inputs, error } = await supabase.from("fin_fluxo_diario").select("grupo, campo, valor, texto").eq("data", data);
  if (error) throw error;
  const saida: DiarioEmpresa[] = [];
  for (const e of EMPRESAS_CAIXA) {
    const ids = await unidadesDaEmpresa(e);
    let pagoAuto = 0;
    let recebidoLancado = 0;
    if (ids.length) {
      const { data: lanc, error: eL } = await supabase.from("fin_lancamentos").select("tipo, valor").eq("data", data).in("branch_id", ids).limit(5000);
      if (eL) throw eL;
      for (const l of lanc) {
        if (l.tipo === "pagar") pagoAuto += Number(l.valor);
        else recebidoLancado += Number(l.valor);
      }
    }
    const meus = (inputs ?? []).filter((i) => i.grupo === e.nome);
    saida.push({
      empresa: e.nome,
      pagoAuto: Math.round(pagoAuto * 100) / 100,
      recebidoLancado: Math.round(recebidoLancado * 100) / 100,
      campos: Object.fromEntries(meus.map((i) => [i.campo, i.valor === null ? null : Number(i.valor)])),
      textos: Object.fromEntries(meus.map((i) => [i.campo, i.texto])),
    });
  }
  return saida;
}

// ---------- mensal ----------

export type MensalEmpresa = {
  empresa: string;
  recebidoAuto: number;
  despesas: { familia: string; realizadoAuto: number }[];
  inputs: Record<string, { provisao: number | null; realizado: number | null }>;
};

export async function fluxoMensal(competencia: string): Promise<MensalEmpresa[]> {
  const supabase = await createClient();
  const [categorias, { data: inputs, error }] = await Promise.all([listarCategorias(), supabase.from("fin_fluxo_mensal").select("grupo, linha, provisao, realizado").eq("competencia", competencia)]);
  if (error) throw error;
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const saida: MensalEmpresa[] = [];
  for (const e of EMPRESAS_CAIXA) {
    const ids = await unidadesDaEmpresa(e);
    const linhas = ids.length ? await rpcPaginado((a, b) => supabase.rpc("fin_dre", { p_de: competencia, p_ate: competencia, p_branches: ids }).range(a, b)) : [];
    let recebidoAuto = 0;
    const porFamilia = new Map<string, number>();
    for (const l of linhas) {
      if (l.tipo === "receber") {
        recebidoAuto += Number(l.total);
        continue;
      }
      const c = porId.get(l.categoria_id);
      const fam = c ? familiaFinanceira({ tipo: c.tipo as FinTipo, nome: c.nome, grupo: c.grupo, fin_familia: c.fin_familia, fin_grupo: c.fin_grupo }).familia : "Outras Despesas";
      porFamilia.set(fam, (porFamilia.get(fam) ?? 0) + Number(l.total));
    }
    saida.push({
      empresa: e.nome,
      recebidoAuto: Math.round(recebidoAuto * 100) / 100,
      despesas: [...porFamilia.entries()].map(([familia, v]) => ({ familia, realizadoAuto: Math.round(v * 100) / 100 })).sort((a, b) => ordemFamiliaFin(a.familia, b.familia)),
      inputs: Object.fromEntries((inputs ?? []).filter((i) => i.grupo === e.nome).map((i) => [i.linha, { provisao: i.provisao === null ? null : Number(i.provisao), realizado: i.realizado === null ? null : Number(i.realizado) }])),
    });
  }
  return saida;
}

// ---------- semanal (dia a dia) ----------

export type DiaSemanal = { dia: string; porEmpresa: Record<string, { receber: number; pagar: number }>; detalhe: { familia: string; categoria: string; porEmpresa: Record<string, { receber: number; pagar: number }> }[] };

export async function fluxoSemanal(competencia: string): Promise<DiaSemanal[]> {
  const categorias = await listarCategorias();
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const dias = new Map<string, DiaSemanal>();
  const garantirDia = (d: string) => {
    let x = dias.get(d);
    if (!x) {
      x = { dia: d, porEmpresa: {}, detalhe: [] };
      dias.set(d, x);
    }
    return x;
  };
  for (const e of EMPRESAS_CAIXA) {
    const linhas = await movimentoDiario({ grupo: "TODOS", grupos: e.grupos }, competencia);
    for (const l of linhas) {
      const d = garantirDia(l.data);
      const emp = (d.porEmpresa[e.nome] ??= { receber: 0, pagar: 0 });
      emp[l.tipo] += l.total;
      const c = porId.get(l.categoria_id);
      const fam = !c ? "Outras" : c.tipo === "receber" ? "Recebimentos" : familiaFinanceira({ tipo: c.tipo as FinTipo, nome: c.nome, grupo: c.grupo, fin_familia: c.fin_familia, fin_grupo: c.fin_grupo }).familia;
      const nome = c?.nome ?? "(sem categoria)";
      let det = d.detalhe.find((x) => x.familia === fam && x.categoria === nome);
      if (!det) {
        det = { familia: fam, categoria: nome, porEmpresa: {} };
        d.detalhe.push(det);
      }
      const de = (det.porEmpresa[e.nome] ??= { receber: 0, pagar: 0 });
      de[l.tipo] += l.total;
    }
  }
  for (const d of dias.values()) d.detalhe.sort((a, b) => ordemFamiliaFin(a.familia, b.familia) || a.categoria.localeCompare(b.categoria, "pt-BR"));
  return [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
