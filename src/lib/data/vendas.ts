// Vendas (telas): somas por filial e por período das tabelas vendas_* (preenchidas pelo robô do Trier) e as contas
// das colunas (ticket, unidades por atendimento, % premium, % genérico + similar, CMV). Quem vê cada loja é a regra
// das tabelas (admin, financeiro e coordenador todas; gerente as dele).
import { createClient } from "@/lib/supabase/server";

/** Regionais das vendas (decisão de 28/10/2026): Sul F001–F099, Serra F101–F199, Oeste F301–F422. */
export const REGIONAIS_VENDAS = ["Sul", "Serra", "Oeste"] as const;
export type RegionalVendas = (typeof REGIONAIS_VENDAS)[number];
export const ehRegionalVendas = (r: string | null | undefined): r is RegionalVendas => REGIONAIS_VENDAS.includes(r as RegionalVendas);

/** A venda da equipe de televendas sai das filiais e vai para a filial da central de cada vendedor (código 'TLV-…',
 * cidade = equipe; Criciúma e Lages no Sul, Concórdia no Oeste). Equipe sem central fica na "regional" Televendas. */
export const TELEVENDAS = "Televendas" as const;
export type RegionalOuTele = RegionalVendas | typeof TELEVENDAS;
const ehRegionalOuTele = (r: string | null | undefined): r is RegionalOuTele => r === TELEVENDAS || ehRegionalVendas(r);
export const PREFIXO_CENTRAL_TELE = "TLV-";
/** Linha de venda do televendas (uma central ou a linha Televendas de equipe sem central). */
export const ehTele = (l: { codigo: string; regional: string }) => l.regional === TELEVENDAS || l.codigo.startsWith(PREFIXO_CENTRAL_TELE);

export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/** Somas de um conjunto de vendas (uma filial, uma regional, a rede). */
export type BaseVendas = { venda: number; atendimentos: number; itens: number; unidades: number; vendaGrupos: number; custo: number; premium: number; generico: number; similares: number; referencia: number; fortvigor: number };
export type MetricasVendas = BaseVendas & { ticket: number | null; sacola: number | null; genSim: number; pctPremium: number | null; pctGenSim: number | null; cmv: number | null; rentab: number | null };

const div = (a: number, b: number) => (b ? a / b : null);
const n = (v: unknown) => Number(v ?? 0) || 0;

export function metricas(b: BaseVendas): MetricasVendas {
  const genSim = b.generico + b.similares;
  const cmv = div(b.custo, b.vendaGrupos);
  return {
    ...b,
    ticket: div(b.venda, b.atendimentos),
    sacola: div(b.unidades, b.atendimentos),
    genSim,
    pctPremium: b.vendaGrupos ? (b.premium / b.vendaGrupos) * 100 : null,
    pctGenSim: b.vendaGrupos ? (genSim / b.vendaGrupos) * 100 : null,
    cmv: cmv === null ? null : cmv * 100,
    rentab: cmv === null ? null : (1 - cmv) * 100,
  };
}

const VAZIO: BaseVendas = { venda: 0, atendimentos: 0, itens: 0, unidades: 0, vendaGrupos: 0, custo: 0, premium: 0, generico: 0, similares: 0, referencia: 0, fortvigor: 0 };
const CAMPOS = Object.keys(VAZIO) as (keyof BaseVendas)[];

export function somar(linhas: BaseVendas[]): MetricasVendas {
  const t = { ...VAZIO };
  for (const l of linhas) for (const c of CAMPOS) t[c] += l[c];
  return metricas(t);
}

export type LinhaFilialVendas = MetricasVendas & { branchId: string; codigo: string; nome: string; regional: RegionalOuTele; dias: number };

/** Vendas de cada filial no período (só as das regionais de venda), sem a venda da equipe de televendas, mais a linha
 * Televendas (só para quem vê a rede). */
export async function vendasPorFilial(de: string, ate: string): Promise<LinhaFilialVendas[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_filiais", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) =>
    ehRegionalOuTele(r.regional)
      ? [
          {
            ...metricas({ venda: n(r.venda), atendimentos: n(r.atendimentos), itens: n(r.itens), unidades: n(r.unidades), vendaGrupos: n(r.venda_grupos), custo: n(r.custo), premium: n(r.premium), generico: n(r.generico), similares: n(r.similares), referencia: n(r.referencia), fortvigor: n(r.fortvigor) }),
            branchId: r.branch_id ?? "televendas",
            codigo: r.codigo,
            nome: r.nome,
            regional: r.regional,
            dias: n(r.dias),
          },
        ]
      : [],
  );
}

export type PontoSerie = MetricasVendas & { periodo: string; regional: RegionalOuTele };

/** Vendas por dia ou por mês (periodo = 1º dia do mês) e regional. */
export async function serieVendas(de: string, ate: string, por: "dia" | "mes"): Promise<PontoSerie[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_serie", { p_de: de, p_ate: ate, p_por: por });
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((r) =>
    ehRegionalOuTele(r.regional)
      ? [{ ...metricas({ venda: n(r.venda), atendimentos: n(r.atendimentos), itens: 0, unidades: n(r.unidades), vendaGrupos: n(r.venda_grupos), custo: n(r.custo), premium: n(r.premium), generico: n(r.generico), similares: n(r.similares), referencia: n(r.referencia), fortvigor: 0 }), periodo: r.periodo, regional: r.regional }]
      : [],
  );
}

/** Junta os pontos do mesmo período (todas as regionais ou só uma). */
export function porPeriodo(pontos: PontoSerie[], regional?: RegionalVendas) {
  const mapa = new Map<string, PontoSerie[]>();
  for (const p of pontos) if (!regional || p.regional === regional) mapa.set(p.periodo, [...(mapa.get(p.periodo) ?? []), p]);
  return new Map([...mapa].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, somar(v)]));
}

// ---------- televendas (equipe de tele-vendas = uma "loja" à parte) ----------

/** Venda de um vendedor da equipe de televendas numa filial (onde o Trier lançou a venda). */
export type LinhaTelevendas = {
  vendedorCodigo: number;
  vendedorNome: string;
  equipe: string;
  funcao: string | null;
  branchId: string;
  codigo: string;
  loja: string;
  regional: string | null;
  venda: number;
  atendimentos: number;
  custo: number;
  /** parte marcada como tele-entrega no Trier */
  teleVenda: number;
  teleAtendimentos: number;
  /** venda e-commerce do vendedor: fica fora do televendas (volta para a filial) */
  ecomVenda: number;
};

export async function televendasNoPeriodo(de: string, ate: string): Promise<LinhaTelevendas[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_televendas", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    vendedorCodigo: r.vendedor_codigo,
    vendedorNome: r.vendedor_nome,
    equipe: r.equipe,
    funcao: r.funcao,
    branchId: r.branch_id,
    codigo: r.codigo,
    loja: r.loja,
    regional: r.regional,
    venda: n(r.venda),
    atendimentos: n(r.atendimentos),
    custo: n(r.custo),
    teleVenda: n(r.tele_venda),
    teleAtendimentos: n(r.tele_atendimentos),
    ecomVenda: n(r.ecom_venda),
  }));
}

export type ResumoTelevendas = { venda: number; atendimentos: number; custo: number; teleVenda: number; teleAtendimentos: number; ecomVenda: number; ticket: number | null; cmv: number | null; vendedores: number; lojas: number };

export function resumirTelevendas(linhas: LinhaTelevendas[]): ResumoTelevendas {
  const t = { venda: 0, atendimentos: 0, custo: 0, teleVenda: 0, teleAtendimentos: 0, ecomVenda: 0 };
  for (const l of linhas) {
    t.venda += l.venda;
    t.atendimentos += l.atendimentos;
    t.custo += l.custo;
    t.teleVenda += l.teleVenda;
    t.teleAtendimentos += l.teleAtendimentos;
    t.ecomVenda += l.ecomVenda;
  }
  const cmv = div(t.custo, t.venda);
  return { ...t, ticket: div(t.venda, t.atendimentos), cmv: cmv === null ? null : cmv * 100, vendedores: new Set(linhas.map((l) => l.vendedorCodigo)).size, lojas: new Set(linhas.map((l) => l.branchId)).size };
}

export type GrupoTelevendas = { vendedorCodigo: number; grupoCodigo: number; grupoNome: string; venda: number; unidades: number; custo: number };

/** Mix por grupo de cada vendedor do televendas no período (do relatório vendedor × grupo do mês, na proporção). */
export async function televendasGrupos(de: string, ate: string): Promise<GrupoTelevendas[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_televendas_grupos", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ vendedorCodigo: r.vendedor_codigo, grupoCodigo: r.grupo_codigo, grupoNome: r.grupo_nome, venda: n(r.venda), unidades: n(r.unidades), custo: n(r.custo) }));
}

/** Responsável do televendas (recebe as quebras de caixa e as sangrias da equipe) e quem pode ser escolhido. */
export async function responsavelTelevendas() {
  const supabase = await createClient();
  const [{ data: cfg }, { data: usuarios, error }] = await Promise.all([
    supabase.from("sistema_config").select("valor").eq("chave", "televendas").maybeSingle(),
    supabase.from("profiles").select("id, nome, papel").eq("ativo", true).not("papel", "in", "(usuario,relogio)").order("nome").range(0, 999),
  ]);
  if (error) throw new Error(error.message);
  const valor = cfg?.valor as { responsavel?: string } | null;
  const id = typeof valor?.responsavel === "string" ? valor.responsavel : null;
  return { id, nome: (usuarios ?? []).find((u) => u.id === id)?.nome ?? null, usuarios: usuarios ?? [] };
}

/** Equipe cadastrada (quem conta como televendas). */
export async function equipeTelevendas() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendas_televendas_vendedores").select("vendedor_codigo, nome, equipe, funcao").order("equipe").order("nome");
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------- metas do mês ----------

/** Chave da meta: 'filial:<branch_id>', 'televendas' ou 'vendedor:<código>'. */
export const chaveMetaFilial = (l: { branchId: string; regional: string }) => (l.regional === TELEVENDAS ? "televendas" : `filial:${l.branchId}`);
export const chaveMetaVendedor = (codigo: number) => `vendedor:${codigo}`;

/** Metas do mês (aaaa-mm-01) por chave. A meta de cada central do tele ('filial:<id da TLV-…>') é a soma das metas dos
 * vendedores dela (a equipe só é lida por quem vê a rede). */
export async function metasDoMes(mes: string): Promise<Map<string, number>> {
  const supabase = await createClient();
  const [metas, equipe, centrais] = await Promise.all([
    supabase.from("vendas_metas").select("chave, valor").eq("mes", mes).range(0, 4999),
    supabase.from("vendas_televendas_vendedores").select("vendedor_codigo, equipe"),
    supabase.from("branches").select("id, cidade").like("codigo", `${PREFIXO_CENTRAL_TELE}%`).eq("ativo", true),
  ]);
  if (metas.error) throw new Error(metas.error.message);
  const mapa = new Map((metas.data ?? []).map((m) => [m.chave, n(m.valor)]));
  for (const c of centrais.data ?? []) {
    const vendedores = (equipe.data ?? []).filter((v) => v.equipe === c.cidade).map((v) => mapa.get(chaveMetaVendedor(v.vendedor_codigo)));
    const soma = vendedores.reduce<number>((s, v) => s + (v ?? 0), 0);
    if (soma && !mapa.has(`filial:${c.id}`)) mapa.set(`filial:${c.id}`, soma);
  }
  return mapa;
}

export type VendedorPeriodo = { vendedorCodigo: number; vendedorNome: string; branchId: string; codigo: string; loja: string; regional: string | null; televendas: boolean; venda: number; atendimentos: number };

/** Venda de cada vendedor no período (todas as filiais) e a filial onde mais vendeu; do televendas, sem o e-commerce. */
export async function vendedoresNoPeriodo(de: string, ate: string): Promise<VendedorPeriodo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_vendedores_periodo", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ vendedorCodigo: r.vendedor_codigo, vendedorNome: r.vendedor_nome, branchId: r.branch_id, codigo: r.codigo, loja: r.loja, regional: r.regional, televendas: r.televendas, venda: n(r.venda), atendimentos: n(r.atendimentos) }));
}

/** Dias do período sem vendas guardadas (o robô ainda não buscou): os totais ficam menores até completar. */
export async function diasSemVendas(de: string, ate: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vendas_dias", { p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  const tem = new Set((data ?? []).map(String));
  const faltam: string[] = [];
  for (let dia = de; dia <= ate; dia = somarDias(dia, 1)) if (!tem.has(dia)) faltam.push(dia);
  return faltam;
}

/** "01/10 a 05/10 e 12/10": junta os dias seguidos. */
export function faixasDeDias(dias: string[]) {
  const faixas: [string, string][] = [];
  for (const d of dias) {
    const ult = faixas[faixas.length - 1];
    if (ult && somarDias(ult[1], 1) === d) ult[1] = d;
    else faixas.push([d, d]);
  }
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const partes = faixas.map(([a, b]) => (a === b ? br(a) : `${br(a)} a ${br(b)}`));
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : (partes[0] ?? "");
}

// ---------- datas (horário de Brasília) ----------

export const hojeNoBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
export const horaNoBrasil = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Último dia das telas: hoje (parcial, lido às `lidoEm`) quando o robô de hoje já leu o dia; senão ontem. */
export async function ultimoDiaVendas(): Promise<{ dia: string; parcial: boolean; lidoEm: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("vendas_hoje_lido_em");
  const hoje = hojeNoBrasil();
  return data ? { dia: hoje, parcial: true, lidoEm: data } : { dia: somarDias(hoje, -1), parcial: false, lidoEm: null };
}
export const somarDias = (dia: string, dias: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
export const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
export const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();
const dois = (v: number) => String(v).padStart(2, "0");
export const dataIso = (ano: number, mes: number, dia: number) => `${ano}-${dois(mes)}-${dois(Math.min(dia, ultimoDia(ano, mes)))}`;
/** O mesmo dia em outro mês/ano (31 → último dia quando o mês é menor). */
export function mesmoDia(dia: string, mesesAntes: number) {
  const [a, m, d] = dia.split("-").map(Number);
  const t = a * 12 + (m - 1) - mesesAntes;
  return dataIso(Math.floor(t / 12), (t % 12) + 1, d);
}

/** Variação em % (null quando não há base para comparar). */
export const variacaoPct = (atual: number, anterior: number) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);
