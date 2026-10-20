// Leitura da DRE contábil (servidor). O RLS deixa ver só Administrador, Financeiro e Contador.
import { calcularDre, ehLinhaDre, somarLancamentos, type Lancamentos } from "@/lib/financeiro/dre-contabil";
import { createClient } from "@/lib/supabase/server";

/** Empresas com DRE importada e os meses de cada uma ("aaaa-mm"), do mais recente. */
export async function empresasDre() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("dre_contabil_importacoes").select("empresa, meses, arquivo, criado_por_nome, criado_em").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  const porEmpresa = new Map<string, { empresa: string; meses: Set<string>; ultima: { arquivo: string | null; por: string | null; em: string } }>();
  for (const r of data ?? []) {
    let e = porEmpresa.get(r.empresa);
    if (!e) {
      e = { empresa: r.empresa, meses: new Set(), ultima: { arquivo: r.arquivo, por: r.criado_por_nome, em: r.criado_em } };
      porEmpresa.set(r.empresa, e);
    }
    for (const m of r.meses) e.meses.add(m.slice(0, 7));
  }
  return [...porEmpresa.values()].map((e) => ({ ...e, meses: [...e.meses].sort().reverse() })).sort((a, b) => a.empresa.localeCompare(b.empresa, "pt-BR"));
}

/** Lançamentos da empresa nos meses pedidos: por filial (chave = branch_id; "" = da empresa) e mês. */
export async function lancamentosDre(empresa: string, de: string, ate: string) {
  const supabase = await createClient();
  const linhas: { branch_id: string | null; competencia: string; linha: string; valor: number }[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("dre_contabil")
      .select("branch_id, competencia, linha, valor")
      .eq("empresa", empresa)
      .gte("competencia", `${de}-01`)
      .lte("competencia", `${ate}-01`)
      .order("id")
      .range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const mapa = new Map<string, Map<string, Lancamentos>>(); // filial → mês → lançamentos
  for (const l of linhas) {
    if (!ehLinhaDre(l.linha)) continue;
    const filial = l.branch_id ?? "";
    const mes = l.competencia.slice(0, 7);
    let porMes = mapa.get(filial);
    if (!porMes) mapa.set(filial, (porMes = new Map()));
    const lanc = porMes.get(mes) ?? {};
    lanc[l.linha] = (lanc[l.linha] ?? 0) + Number(l.valor);
    porMes.set(mes, lanc);
  }
  return mapa;
}

export type MapaDre = Awaited<ReturnType<typeof lancamentosDre>>;

/** Lançamentos somados de uma filial (ou "*" = consolidado, com os valores da empresa) nos meses dados. */
export function somar(mapa: MapaDre, filial: string, meses: string[]): Lancamentos {
  const filiais = filial === "*" ? [...mapa.keys()] : [filial];
  return somarLancamentos(filiais.flatMap((f) => meses.map((m) => mapa.get(f)?.get(m) ?? {})));
}

export const contas = (mapa: MapaDre, filial: string, meses: string[]) => calcularDre(somar(mapa, filial, meses));
