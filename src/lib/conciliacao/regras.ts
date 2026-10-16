// Regras automáticas da conciliação (motor de regras), só servidor. Uma regra tem condições — nome contém
// (beneficiário do boleto, fornecedor do Trier ou fornecedor real do de-para), raiz do CNPJ, filiais, faixa de valor
// e tipo de divergência — e ações: categoria e/ou departamento da Omie no envio, e tratar sozinha a pendência
// (resolver ou justificar). Para cada ação vale a 1ª regra ativa que casa (ordem crescente, depois nome).
// Regra nunca troca decisão de uma pessoa: só mexe em pendência "pendente" ou que ela mesma tratou.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { Linha } from "@/lib/tipos";
import { Motor } from "./motor";
import { Omie, type ItemOmie, type LinhaOmie } from "./omie";
import type { CacheOmie } from "./omie-api";
import { PROBLEMA_LABEL, PROBLEMAS, type Problema } from "./rotulos";

type Cliente = SupabaseClient<Database>;
type Pendencia = Linha<"conc_pendencias">;
type ItemGravado = Linha<"conc_itens">;
type Historico = { status: string; quando: string; por: string; motivo: string }[];

export type Regra = Linha<"conc_regras">;
export type AcaoRegra = "categoria" | "departamento" | "pendencia";
export type StatusRegra = "resolvido" | "justificado";
export type Uso = Map<string, number>;

/** O que a regra olha numa conta (boleto e/ou títulos do Trier). */
export type AlvoRegra = { nomes: string[]; raiz: string | null; filial: number | null; valor: number; problema: string | null };

const PROBLEMAS_SET = new Set<string>(PROBLEMAS);
const so = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const preenchidos = (l: (string | null | undefined)[]) => l.filter((x): x is string => !!x && !!x.trim());

export const problemaDoItem = (grupo: string, categoria: string) => (grupo === "so_dda" ? "SO_DDA" : PROBLEMAS_SET.has(categoria) ? categoria : null);

/** Conta montada na hora da conciliação. */
export function alvoDeItem(it: ItemOmie, problema: string | null): AlvoRegra {
  const d = it.d;
  return {
    nomes: preenchidos([d?.nome, d?.deParaFornecedor, ...it.ts.map((t) => t.forn)]),
    raiz: d && d.tipo !== "1" ? d.raiz || null : null,
    filial: Omie.filialDe(it),
    valor: d ? d.valor : (it.ts[0]?.valor ?? 0),
    problema,
  };
}

/** Conta já gravada (conc_itens). */
export function alvoDeLinha(
  l: Pick<ItemGravado, "beneficiario" | "fornecedor" | "fornecedor_real" | "cnpj" | "barra" | "filial" | "valor" | "categoria" | "grupo"> & { dados?: Json | null },
): AlvoRegra {
  const dados = (l.dados ?? null) as { trier?: { forn?: string }[]; dda?: { raiz?: string } | null } | null;
  const cnpj = so(l.cnpj);
  return {
    nomes: preenchidos([l.beneficiario, l.fornecedor_real, l.fornecedor, ...(dados?.trier ?? []).map((t) => t.forn)]),
    raiz: l.barra ? dados?.dda?.raiz?.trim() || (cnpj.length >= 8 ? cnpj.slice(0, 8) : null) : null,
    filial: l.filial,
    valor: Number(l.valor),
    problema: problemaDoItem(l.grupo, l.categoria),
  };
}

export function casa(r: Regra, a: AlvoRegra): boolean {
  if (r.nome_contem) {
    const n = Motor.norm(r.nome_contem);
    if (!a.nomes.some((x) => Motor.norm(x).includes(n))) return false;
  }
  if (r.cnpj_raiz && a.raiz !== r.cnpj_raiz.trim()) return false;
  if (r.filiais.length && (a.filial == null || !r.filiais.includes(a.filial))) return false;
  if (r.valor_min != null && a.valor < Number(r.valor_min)) return false;
  if (r.valor_max != null && a.valor > Number(r.valor_max)) return false;
  if (r.problemas.length && (!a.problema || !r.problemas.includes(a.problema))) return false;
  return true;
}

export const temAcao = (r: Regra, acao: AcaoRegra) => (acao === "categoria" ? !!r.categoria_omie : acao === "departamento" ? !!r.departamento_omie : !!r.pendencia_acao);
export const ordenarRegras = (rs: Regra[]) => [...rs].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));

/** 1ª regra ativa que casa para a ação (a lista já vem na ordem). */
export const primeiraRegra = (regras: Regra[], alvo: AlvoRegra, acao: AcaoRegra) => regras.find((r) => r.ativo && temAcao(r, acao) && casa(r, alvo)) ?? null;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "nome contém CLARO · filiais 301, 302 · até R$ 500,00" para a lista. */
export function descreverCondicoes(r: Regra): string[] {
  const out: string[] = [];
  if (r.nome_contem) out.push(`nome contém “${r.nome_contem}”`);
  if (r.cnpj_raiz) out.push(`CNPJ começa com ${r.cnpj_raiz.trim().replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3")}`);
  if (r.filiais.length) out.push(`${r.filiais.length === 1 ? "filial" : "filiais"} ${r.filiais.join(", ")}`);
  if (r.valor_min != null && r.valor_max != null) out.push(`de ${moeda(Number(r.valor_min))} a ${moeda(Number(r.valor_max))}`);
  else if (r.valor_min != null) out.push(`a partir de ${moeda(Number(r.valor_min))}`);
  else if (r.valor_max != null) out.push(`até ${moeda(Number(r.valor_max))}`);
  if (r.problemas.length) out.push(`divergência: ${r.problemas.map((p) => PROBLEMA_LABEL[p as Problema] ?? p).join(" ou ")}`);
  return out;
}

export function descreverAcoes(r: Regra): string[] {
  const out: string[] = [];
  if (r.categoria_omie) out.push(`categoria Omie “${r.categoria_omie}”`);
  if (r.departamento_omie) out.push(`departamento “${r.departamento_omie}”`);
  if (r.pendencia_acao) out.push(`${r.pendencia_acao === "resolvido" ? "resolve" : "justifica (ignora)"} a pendência: ${r.pendencia_motivo ?? ""}`);
  return out;
}

export async function listarRegras(supabase: Cliente): Promise<Regra[]> {
  const { data, error } = await supabase.from("conc_regras").select("*").order("ordem").order("nome");
  if (error) throw new Error(`Regras automáticas: ${error.message}`);
  return ordenarRegras(data);
}

export async function regrasAtivas(supabase: Cliente) {
  return (await listarRegras(supabase)).filter((r) => r.ativo);
}

export const contarUso = (uso: Uso, r: Regra | null | undefined) => {
  if (r) uso.set(r.id, (uso.get(r.id) ?? 0) + 1);
};

/** Soma o uso das regras (contador da tela). Falha aqui não desfaz o que já foi feito. */
export async function gravarUso(supabase: Cliente, uso: Uso) {
  if (!uso.size) return;
  const ids = [...uso.keys()];
  const { error } = await supabase.rpc("conc_regras_registrar_uso", { p_ids: ids, p_qtds: ids.map((i) => uso.get(i)!) });
  if (error) console.error("[regras] uso:", error.message);
}

// ---------- Omie: categoria e departamento ----------

export type RegrasDaConta = { categoria: Regra | null; departamento: Regra | null };

export const regrasDaConta = (regras: Regra[], alvo: AlvoRegra): RegrasDaConta => ({ categoria: primeiraRegra(regras, alvo, "categoria"), departamento: primeiraRegra(regras, alvo, "departamento") });

/** Regras diferentes usadas numa conta (a mesma regra pode dar categoria e departamento). */
export const regrasUsadas = (rr: RegrasDaConta) => [...new Map([rr.categoria, rr.departamento].filter((r): r is Regra => !!r).map((r) => [r.id, r])).values()];

/** Troca categoria (D) e departamento (AX) das linhas do Omie pelas regras e anota a regra na observação (S). */
export function aplicarNasLinhas(linhas: LinhaOmie[], alvos: AlvoRegra[], regras: Regra[]): RegrasDaConta[] {
  return linhas.map((l, i) => {
    const rr = regrasDaConta(regras, alvos[i]);
    if (rr.categoria) l.D = rr.categoria.categoria_omie!;
    if (rr.departamento) {
      l.AX = rr.departamento.departamento_omie!;
      l._semDepartamento = false;
    }
    const usadas = regrasUsadas(rr);
    if (usadas.length) l.S = `${l.S} | Regra: ${usadas.map((r) => r.nome).join(", ")}`;
    return rr;
  });
}

/** Nomes de categoria (despesa) e departamento que a Omie das duas empresas conhece, para a tela de regras. */
export async function opcoesOmie(supabase: Cliente) {
  const { data } = await supabase.from("conc_config").select("chave, valor").in("chave", ["omie_cache_nazario", "omie_cache_varela", "omie"]);
  const categorias = new Set<string>();
  const departamentos = new Set<string>();
  let buscou = false;
  for (const c of data ?? []) {
    if (c.chave === "omie") {
      const cat = (c.valor as { categoria?: string } | null)?.categoria;
      if (cat) categorias.add(cat);
      continue;
    }
    const cache = c.valor as Partial<CacheOmie> | null;
    if (!cache) continue;
    buscou = true;
    for (const n of cache.categorias?.map((x) => x.nome) ?? cache.opcoesCategoria ?? []) categorias.add(n);
    for (const d of cache.todos ?? []) if (d.descricao) departamentos.add(d.descricao);
  }
  const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
  return { categorias: ord(categorias), departamentos: ord(departamentos), buscou };
}

// ---------- pendências ----------

export const motivoDaRegra = (r: Regra) => `Regra “${r.nome}”: ${r.pendencia_motivo ?? ""}`.trim();

export type DecisaoRegra = { status: "pendente" | StatusRegra; regra: Regra | null; motivo: string };

/** O que as regras fazem com uma pendência; null = nada muda. */
export function decidirPendencia(p: Pick<Pendencia, "status" | "auto" | "regra_id">, rp: Regra | null): DecisaoRegra | null {
  const daRegra = p.auto && !!p.regra_id && (p.status === "resolvido" || p.status === "justificado");
  if (daRegra) {
    if (rp && rp.id === p.regra_id && rp.pendencia_acao === p.status) return null;
    if (rp) return { status: rp.pendencia_acao as StatusRegra, regra: rp, motivo: motivoDaRegra(rp) };
    return { status: "pendente", regra: null, motivo: "A regra que tratava esta pendência não vale mais para ela" };
  }
  if (p.status === "pendente" && rp) return { status: rp.pendencia_acao as StatusRegra, regra: rp, motivo: motivoDaRegra(rp) };
  return null;
}

type CamposDecisao = { status?: Pendencia["status"]; auto?: boolean; motivo?: string | null; decidido_por?: string | null; decidido_em?: string | null; regra_id?: string | null; historico?: Json };

export function aplicarDecisao<P extends CamposDecisao>(p: P, dec: DecisaoRegra, agora: string): P {
  const historico = [...((p.historico as Historico | null | undefined) ?? []), { status: dec.status, quando: agora, por: "regra", motivo: dec.motivo }] as Json;
  if (dec.regra) return { ...p, status: dec.status, auto: true, motivo: dec.motivo, decidido_por: null, decidido_em: agora, regra_id: dec.regra.id, historico };
  return { ...p, status: "pendente", auto: false, motivo: null, decidido_por: null, decidido_em: null, regra_id: null, historico };
}

const LOTE = 500;

/** Pendências que as regras podem tocar: em aberto e as que alguma regra tratou. */
async function pendenciasDasRegras(supabase: Cliente) {
  const lista: Pendencia[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("conc_pendencias")
      .select("*")
      .or("status.eq.pendente,and(auto.is.true,regra_id.not.is.null)")
      .order("chave")
      .range(inicio, inicio + 999);
    if (error) throw new Error(`Pendências: ${error.message}`);
    lista.push(...data);
    if (data.length < 1000) break;
  }
  return lista;
}

/** Alvo de cada pendência, pela conta gravada na última conciliação em que ela apareceu (nomes do Trier e do de-para). */
async function alvosDasPendencias(supabase: Cliente, pend: Pendencia[]) {
  const porConc = new Map<string, string[]>();
  for (const p of pend) if (p.conciliacao_id) porConc.set(p.conciliacao_id, [...(porConc.get(p.conciliacao_id) ?? []), p.chave]);
  const itens = new Map<string, AlvoRegra>();
  for (const [conc, chaves] of porConc) {
    for (let i = 0; i < chaves.length; i += 300) {
      const { data, error } = await supabase
        .from("conc_itens")
        .select("chave, beneficiario, fornecedor, fornecedor_real, cnpj, barra, filial, valor, categoria, grupo, dados")
        .eq("conciliacao_id", conc)
        .in("chave", chaves.slice(i, i + 300));
      if (error) throw new Error(`Itens da conciliação: ${error.message}`);
      for (const l of data) if (!itens.has(`${conc}|${l.chave}`)) itens.set(`${conc}|${l.chave}`, alvoDeLinha(l));
    }
  }
  return new Map(
    pend.map((p) => {
      const doItem = p.conciliacao_id ? itens.get(`${p.conciliacao_id}|${p.chave}`) : undefined;
      const cnpj = so(p.cnpj);
      const alvo: AlvoRegra = doItem
        ? { ...doItem, problema: p.problema }
        : { nomes: preenchidos([p.beneficiario]), raiz: cnpj.length >= 8 ? cnpj.slice(0, 8) : null, filial: p.filial, valor: Number(p.valor), problema: p.problema };
      return [p.chave, alvo] as const;
    }),
  );
}

/** Quantas pendências cada regra pega hoje (abertas ou já tratadas por regra) e quantas ela tratou. */
export async function previaPendencias(supabase: Cliente, regras: Regra[]) {
  const pend = await pendenciasDasRegras(supabase);
  const alvos = await alvosDasPendencias(supabase, pend);
  const casam = new Map<string, number>();
  const tratadas = new Map<string, number>();
  for (const p of pend) {
    if (p.auto && p.regra_id) tratadas.set(p.regra_id, (tratadas.get(p.regra_id) ?? 0) + 1);
    const a = alvos.get(p.chave)!;
    for (const r of regras) if (r.pendencia_acao && casa(r, a)) casam.set(r.id, (casam.get(r.id) ?? 0) + 1);
  }
  return { casam, tratadas, abertas: pend.filter((p) => p.status === "pendente").length };
}

/** Quantas contas da última conciliação cada regra de categoria/departamento pega. */
export async function previaUltimaConciliacao(supabase: Cliente, regras: Regra[]) {
  const comOmie = regras.filter((r) => r.categoria_omie || r.departamento_omie);
  const casam = new Map<string, number>();
  if (!comOmie.length) return { casam, conciliacao: null as { id: string; titulo: string | null; criado_em: string } | null };
  const { data: conc } = await supabase.from("conc_conciliacoes").select("id, titulo, criado_em").order("criado_em", { ascending: false }).limit(1).maybeSingle();
  if (!conc) return { casam, conciliacao: null };
  const vistos = new Set<string>();
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("conc_itens")
      .select("chave, beneficiario, fornecedor, fornecedor_real, cnpj, barra, filial, valor, categoria, grupo")
      .eq("conciliacao_id", conc.id)
      .order("id")
      .range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    for (const l of data) {
      if (vistos.has(l.chave)) continue;
      vistos.add(l.chave);
      const a = alvoDeLinha(l);
      for (const r of comOmie) if (casa(r, a)) casam.set(r.id, (casam.get(r.id) ?? 0) + 1);
    }
    if (data.length < 1000) break;
  }
  return { casam, conciliacao: conc };
}

/**
 * Passa as regras de novo nas pendências: trata as abertas que casam e reabre as que uma regra tratou e não vale mais
 * (regra desativada, excluída ou alterada). Decisão de pessoa e pendência "em análise" ficam como estão.
 */
export async function reaplicarRegras(supabase: Cliente, regras: Regra[], soDaRegra?: string) {
  const ativas = ordenarRegras(regras.filter((r) => r.ativo));
  const pend = (await pendenciasDasRegras(supabase)).filter((p) => !soDaRegra || (p.auto && p.regra_id === soDaRegra));
  const alvos = await alvosDasPendencias(supabase, pend);
  const agora = new Date().toISOString();
  const uso: Uso = new Map();
  const gravar: Pendencia[] = [];
  let tratadas = 0;
  let reabertas = 0;
  for (const p of pend) {
    const dec = decidirPendencia(p, primeiraRegra(ativas, alvos.get(p.chave)!, "pendencia"));
    if (!dec) continue;
    gravar.push(aplicarDecisao(p, dec, agora));
    if (dec.regra) {
      tratadas += 1;
      contarUso(uso, dec.regra);
    } else reabertas += 1;
  }
  for (let i = 0; i < gravar.length; i += LOTE) {
    const { error } = await supabase.from("conc_pendencias").upsert(gravar.slice(i, i + LOTE), { onConflict: "chave" });
    if (error) throw new Error(`Pendências: ${error.message}`);
  }
  await gravarUso(supabase, uso);
  return { tratadas, reabertas };
}
