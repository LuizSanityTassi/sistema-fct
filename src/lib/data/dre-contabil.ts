// Leitura da DRE contábil (servidor). O RLS deixa ver só Administrador, Financeiro e Contador.
import { baseDoRateio, calcularDre, ehLinhaDre, ehLinhaRateio, ratear, somarLancamentos, type Lancamentos, type LinhaRateio } from "@/lib/financeiro/dre-contabil";
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

export type RateioDre = { id: string; empresa: string; competencia: string; item: string; linha: LinhaRateio; valor: number; observacao: string | null; criado_por_nome: string | null; criado_em: string };

/** Valores da empresa a ratear por faturamento, nos meses pedidos. */
export async function rateiosDre(empresa: string, de: string, ate: string): Promise<RateioDre[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dre_contabil_rateios")
    .select("id, empresa, competencia, item, linha, valor, observacao, criado_por_nome, criado_em")
    .eq("empresa", empresa)
    .gte("competencia", `${de}-01`)
    .lte("competencia", `${ate}-01`)
    .order("competencia")
    .order("item");
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) => (ehLinhaRateio(r.linha) ? [{ ...r, competencia: r.competencia.slice(0, 7), linha: r.linha, valor: Number(r.valor) }] : []));
}

/** Valores gravados (sem rateio) da empresa nos meses pedidos ("aaaa-mm"), com a conta digitada: chave "filial|mês|conta" ("" = da empresa). */
export async function valoresGravados(empresa: string, meses: string[], filial?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("dre_contabil")
    .select("branch_id, competencia, linha, valor, formula")
    .eq("empresa", empresa)
    .in(
      "competencia",
      meses.map((m) => `${m}-01`),
    );
  if (filial) q = q.eq("branch_id", filial);
  const { data, error } = await q.range(0, 9999);
  if (error) throw new Error(error.message);
  const out = new Map<string, { valor: number; formula: string | null }>();
  for (const r of data ?? []) {
    const k = `${r.branch_id ?? ""}|${r.competencia.slice(0, 7)}|${r.linha}`;
    const antes = out.get(k);
    out.set(k, { valor: (antes?.valor ?? 0) + Number(r.valor), formula: r.formula ?? antes?.formula ?? null });
  }
  return out;
}

/** Divisão de cada rateio do mês entre as filiais (pela receita bruta do mês). */
export function distribuirRateios(mapa: MapaDre, mes: string, rateios: RateioDre[]) {
  const bases = [...mapa.keys()].filter(Boolean).map((id) => ({ id, base: baseDoRateio(mapa.get(id)?.get(mes) ?? {}) }));
  return rateios.filter((r) => r.competencia === mes).map((r) => ({ rateio: r, porFilial: ratear(r.valor, bases) }));
}

/**
 * Lançamentos da empresa nos meses pedidos: por filial (chave = branch_id; "" = da empresa) e mês, já com os rateios
 * por faturamento somados na conta de cada um.
 */
export async function lancamentosDre(empresa: string, de: string, ate: string) {
  const [mapa, rateios] = await Promise.all([lancamentosImportados(empresa, de, ate), rateiosDre(empresa, de, ate)]);
  for (const mes of new Set(rateios.map((r) => r.competencia))) {
    for (const { rateio, porFilial } of distribuirRateios(mapa, mes, rateios)) {
      for (const [filial, { valor }] of porFilial) {
        const lanc = mapa.get(filial)!.get(mes)!;
        lanc[rateio.linha] = (lanc[rateio.linha] ?? 0) + valor;
      }
    }
  }
  return { mapa, rateios };
}

async function lancamentosImportados(empresa: string, de: string, ate: string) {
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

export type MapaDre = Awaited<ReturnType<typeof lancamentosImportados>>;

/** Lançamentos somados de uma filial (ou "*" = consolidado, com os valores da empresa) nos meses dados. */
export function somar(mapa: MapaDre, filial: string, meses: string[]): Lancamentos {
  const filiais = filial === "*" ? [...mapa.keys()] : [filial];
  return somarLancamentos(filiais.flatMap((f) => meses.map((m) => mapa.get(f)?.get(m) ?? {})));
}

export const contas = (mapa: MapaDre, filial: string, meses: string[]) => calcularDre(somar(mapa, filial, meses));

/** Filial (ou "", valores da empresa) com algum lançamento no mês. */
export const temLancamento = (mapa: MapaDre, filial: string, mes: string) => Object.values(mapa.get(filial)?.get(mes) ?? {}).some((v) => v);

/**
 * Junta os lançamentos de várias empresas num mapa só ("todas as empresas"). As filiais não se repetem entre empresas;
 * os valores da própria empresa (chave "", a depreciação da Nazário) somam mês a mês.
 */
export function juntarMapas(mapas: MapaDre[]): MapaDre {
  const out: MapaDre = new Map();
  for (const mapa of mapas) {
    for (const [filial, porMes] of mapa) {
      let destino = out.get(filial);
      if (!destino) out.set(filial, (destino = new Map()));
      for (const [mes, lanc] of porMes) destino.set(mes, somarLancamentos([destino.get(mes) ?? {}, lanc]));
    }
  }
  return out;
}
