// Importação dos relatórios do Omie para fin_lancamentos (só servidor). Três formatos:
//  • "LANÇAMENTOS DESPESAS" (export "Fluxo Por Filial"): FILIAL · TIPO · GRUPO · Categoria · Valor Pago · MÊS,
//    com as células mescladas (linha herda filial/tipo/grupo da de cima) e o mês por nome → dia 1 do mês;
//  • "Pagamentos/Recebimentos Fluxo de Caixa – Tabela" (Finanças → Fluxo de Caixa → Tabela, exportado do pivot):
//    Departamento · Tipo · Grupo · Categoria · Valor da Conta, departamento/tipo/grupo só na 1ª linha de cada bloco,
//    linha "Total geral" no fim e SEM data (o período é o filtro da tela do Omie) → dia 1 do mês escolhido;
//  • "Contas a Pagar/Receber" (pivot por CNPJ): Empresa · CNPJ · Razão Social · Categoria · Emissão · Valor da Conta.
// A unidade sai do CNPJ (ou código Fxxx / nome especial). Tudo entra como realizado, origem "omie".
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Database } from "@/lib/supabase/types";
import type { FinTipo } from "./rotulos";

type Cliente = SupabaseClient<Database>;

export type ItemImportado = {
  arquivo: string;
  filialTexto: string;
  branchId: string | null;
  tipo: FinTipo;
  grupo: string | null;
  categoria: string;
  valor: number;
  data: string;
};

export type LeituraArquivo = { nome: string; formato: "lancamentos" | "tabela" | "contas" | "desconhecido"; lidos: number; avisos: string[]; semUnidade: string[]; usaramReferencia: number; /** informação (não é erro) */ nota?: string };

export type ResolverUnidade = (texto: string) => string | null;

const MESES: Record<string, number> = { janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, março: 3, mar: 3, abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12 };
const limpar = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const r2 = (v: number) => Math.round(v * 100) / 100;

function dataOmie(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(v.getTime() - v.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20_000 && v < 80_000) return new Date(Math.round((v - 25_569) * 86_400_000)).toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/**
 * Lê um arquivo do Omie e devolve os itens (ainda sem categoria resolvida) + resumo da leitura. `mes` (aaaa-mm, da
 * tela "Importar novo mês") dá a data das linhas do relatório em tabela, que não tem data.
 */
export function lerPlanilhaOmie(nome: string, buf: Buffer, opcoes: { ano: number; dataReferencia: string; resolverUnidade: ResolverUnidade; mes?: string | null }): { itens: ItemImportado[]; leitura: LeituraArquivo } {
  const itens: ItemImportado[] = [];
  const leitura: LeituraArquivo = { nome, formato: "desconhecido", lidos: 0, avisos: [], semUnidade: [], usaramReferencia: 0 };
  const semUnidade = new Set<string>();
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const planilhas = wb.SheetNames.map((n) => ({ nome: n, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, defval: "" }) }));

  // (1) "LANÇAMENTOS DESPESAS": cabeçalho com FILIAL e Valor Pago
  const lanc = planilhas.map((p) => ({ ...p, hi: p.rows.findIndex((r) => Array.isArray(r) && r.some((c) => /filial/i.test(String(c))) && r.some((c) => /valor\s*pago/i.test(String(c)))) })).find((p) => p.hi >= 0);
  // (2) tabela do Fluxo de Caixa: cabeçalho com Departamento e Valor da Conta (antes do pivot por CNPJ: a linha de
  //     filtros do relatório de recebimentos lista a categoria "Clientes Pix CNPJ" e enganaria a detecção do pivot)
  const tabela = lanc
    ? undefined
    : planilhas
        .map((p) => ({ ...p, hi: p.rows.findIndex((r) => Array.isArray(r) && r.some((c) => /^departamento$/i.test(limpar(c))) && r.some((c) => /^valor da conta$/i.test(limpar(c)))) }))
        .find((p) => p.hi >= 0);
  if (tabela) {
    leitura.formato = "tabela";
    const H = tabela.rows[tabela.hi].map((x) => limpar(x).toLowerCase());
    const col = (re: RegExp) => H.findIndex((h) => re.test(h));
    const cD = col(/^departamento$/), cT = col(/^tipo$/), cG = col(/^grupo$/), cC = col(/^categoria$/), cV = col(/^valor da conta$/);
    const titulo = limpar(tabela.rows[0]?.[0]) + " " + tabela.nome;
    let tipo: FinTipo = /receb/i.test(titulo) ? "receber" : "pagar";
    let grupo = "";
    let departamento = "";
    let branchId: string | null = null;
    const data = opcoes.mes ? `${opcoes.mes}-01` : opcoes.dataReferencia;
    for (let i = tabela.hi + 1; i < tabela.rows.length; i++) {
      const r = tabela.rows[i] ?? [];
      const dv = cD >= 0 ? limpar(r[cD]) : "";
      if (/^total geral$/i.test(dv)) break;
      if (dv) {
        departamento = dv;
        branchId = opcoes.resolverUnidade(dv);
      }
      const tv = cT >= 0 ? limpar(r[cT]) : "";
      if (/receber/i.test(tv)) tipo = "receber";
      else if (/pagar/i.test(tv)) tipo = "pagar";
      const gv = cG >= 0 ? limpar(r[cG]) : "";
      if (gv) grupo = gv;
      const categoria = cC >= 0 ? limpar(r[cC]) : "";
      const vv = cV >= 0 ? r[cV] : null;
      if (!categoria || vv === "" || vv == null || Number.isNaN(Number(vv)) || !departamento) continue;
      if (!branchId) {
        semUnidade.add(departamento);
        continue;
      }
      const valor = r2(Math.abs(Number(vv)));
      if (!valor) continue;
      if (!opcoes.mes) leitura.usaramReferencia += 1;
      itens.push({ arquivo: nome, filialTexto: departamento, branchId, tipo, grupo: grupo || null, categoria, valor, data });
    }
    leitura.nota = opcoes.mes
      ? `Relatório em tabela do Omie: não traz data — os valores entram em ${opcoes.mes.slice(5)}/${opcoes.mes.slice(0, 4)}. Confira se ele foi exportado filtrando só esse mês.`
      : `Relatório em tabela do Omie: não traz data — os valores entram na data de referência (${opcoes.dataReferencia.split("-").reverse().join("/")}). Melhor usar Caixa contábil → Importar novo mês, que pergunta o mês.`;
  } else if (lanc) {
    leitura.formato = "lancamentos";
    const H = lanc.rows[lanc.hi].map((x) => String(x).toLowerCase());
    const col = (re: RegExp) => H.findIndex((h) => re.test(h));
    const cF = col(/filial/), cT = col(/tipo/), cG = col(/grupo/), cC = col(/categoria/), cV = col(/valor/), cM = col(/m[eê]s/);
    let tipo: FinTipo = "pagar";
    let grupo = "";
    let filialTexto = "";
    let branchId: string | null = null;
    for (let i = lanc.hi + 1; i < lanc.rows.length; i++) {
      const r = lanc.rows[i] ?? [];
      const fv = cF >= 0 ? limpar(r[cF]) : "";
      if (fv) {
        filialTexto = fv;
        branchId = opcoes.resolverUnidade(fv);
      }
      const tv = cT >= 0 ? String(r[cT] ?? "") : "";
      if (/receber/i.test(tv)) tipo = "receber";
      else if (/pagar/i.test(tv)) tipo = "pagar";
      const gv = cG >= 0 ? limpar(r[cG]) : "";
      if (gv) grupo = gv;
      const categoria = cC >= 0 ? limpar(r[cC]) : "";
      const vv = cV >= 0 ? r[cV] : null;
      if (!categoria || vv === "" || vv == null || Number.isNaN(Number(vv))) continue;
      if (!filialTexto) continue;
      if (!branchId) {
        semUnidade.add(filialTexto);
        continue;
      }
      const mes = MESES[limpar(cM >= 0 ? r[cM] : "").toLowerCase()];
      let data: string;
      if (mes) data = `${opcoes.ano}-${String(mes).padStart(2, "0")}-01`;
      else {
        data = opcoes.dataReferencia;
        leitura.usaramReferencia += 1;
      }
      itens.push({ arquivo: nome, filialTexto, branchId, tipo, grupo: grupo || null, categoria, valor: r2(Math.abs(Number(vv))), data });
    }
  } else {
    // (2) pivot por CNPJ: tipo pelo nome da aba
    const piv = planilhas.map((p) => ({ ...p, hi: p.rows.findIndex((r) => Array.isArray(r) && r.some((c) => /CNPJ/i.test(String(c)))) })).find((p) => p.hi >= 0);
    if (!piv) {
      leitura.avisos.push('formato não reconhecido (esperado "LANÇAMENTOS DESPESAS", a tabela de Pagamentos/Recebimentos do Fluxo de Caixa ou "Contas a Pagar/Receber" do Omie).');
      return { itens, leitura };
    }
    leitura.formato = "contas";
    const tipo: FinTipo = /receber/i.test(piv.nome) ? "receber" : "pagar";
    const datas: string[] = [];
    for (let i = piv.hi + 1; i < piv.rows.length; i++) {
      const d = dataOmie(piv.rows[i]?.[4]);
      if (d) datas.push(d);
    }
    const referencia = datas.length ? datas.sort()[datas.length - 1] : opcoes.dataReferencia;
    let cnpj = "";
    let categoria = "";
    for (let i = piv.hi + 1; i < piv.rows.length; i++) {
      const r = piv.rows[i] ?? [];
      if ([r[1], r[2], r[3], r[4], r[5]].every((x) => x === "" || x == null)) continue;
      if (r[1] !== "" && r[1] != null) cnpj = limpar(r[1]);
      if (r[3] !== "" && r[3] != null) categoria = limpar(r[3]);
      const vc = r[5];
      if (vc === "" || vc == null || Number.isNaN(Number(vc)) || !categoria) continue;
      const branchId = opcoes.resolverUnidade(cnpj);
      if (!branchId) {
        semUnidade.add(cnpj || "(sem CNPJ)");
        continue;
      }
      let data = dataOmie(r[4]);
      if (!data) {
        data = referencia;
        leitura.usaramReferencia += 1;
      }
      itens.push({ arquivo: nome, filialTexto: cnpj, branchId, tipo, grupo: null, categoria, valor: r2(Math.abs(Number(vc))), data });
    }
  }
  leitura.lidos = itens.length;
  leitura.semUnidade = [...semUnidade];
  return { itens, leitura };
}

// ---------- análise (prévia) e importação ----------

type Categoria = { id: string; tipo: FinTipo; grupo: string; nome: string; ativo: boolean };
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const GRUPO_PADRAO: Record<FinTipo, string> = { pagar: "Outras Despesas", receber: "Recebimentos" };

export type ItemAnalisado = ItemImportado & {
  categoriaId: string | null;
  grupoFinal: string;
  categoriaNova: boolean;
  situacao: "novo" | "dup_arquivo" | "dup_banco" | "mes_fechado" | "invalido";
};

export type Analise = {
  itens: ItemAnalisado[];
  total: number;
  novos: number;
  dupArquivo: number;
  dupBanco: number;
  mesFechado: number;
  invalidos: number;
  totalPagar: number;
  totalReceber: number;
  categoriasNovas: { tipo: FinTipo; grupo: string; nome: string; qtd: number }[];
  mesesFechados: string[];
};

/** Classifica cada item: novo / repetido no arquivo / já no banco / mês fechado / inválido. Não grava nada. */
export async function analisarImportacao(supabase: Cliente, itens: ItemImportado[], admin: boolean): Promise<Analise> {
  const [{ data: cats, error: eCat }, { data: fechados }] = await Promise.all([
    supabase.from("fin_categorias").select("id, tipo, grupo, nome, ativo"),
    supabase.from("fin_meses_fechados").select("competencia"),
  ]);
  if (eCat) throw new Error(eCat.message);
  const categorias = (cats ?? []) as Categoria[];
  const porChave = new Map<string, Categoria>();
  const porNome = new Map<string, Categoria>();
  for (const c of categorias) {
    porChave.set(`${c.tipo}|${norm(c.grupo)}|${norm(c.nome)}`, c);
    const k = `${c.tipo}|${norm(c.nome)}`;
    if (!porNome.has(k) || (!porNome.get(k)!.ativo && c.ativo)) porNome.set(k, c);
  }
  const mesesFechados = new Set((fechados ?? []).map((m) => m.competencia.trim()));

  // lançamentos já existentes no período (para a proteção anti-duplicidade)
  const existentes = new Set<string>();
  if (itens.length) {
    const datas = itens.map((i) => i.data).sort();
    const de = datas[0];
    const ate = datas[datas.length - 1];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase.from("fin_lancamentos").select("branch_id, tipo, categoria_id, valor, data").gte("data", de).lte("data", ate).order("id").range(inicio, inicio + 999);
      if (error) throw new Error(error.message);
      for (const l of data) existentes.add(`${l.branch_id}|${l.tipo}|${l.categoria_id}|${r2(Number(l.valor))}|${l.data}`);
      if (data.length < 1000) break;
    }
  }

  const vistos = new Set<string>();
  const novasMap = new Map<string, { tipo: FinTipo; grupo: string; nome: string; qtd: number }>();
  const analisados: ItemAnalisado[] = itens.map((it) => {
    const cat = (it.grupo ? porChave.get(`${it.tipo}|${norm(it.grupo)}|${norm(it.categoria)}`) : undefined) ?? porNome.get(`${it.tipo}|${norm(it.categoria)}`);
    const grupoFinal = cat?.grupo ?? it.grupo ?? GRUPO_PADRAO[it.tipo];
    const categoriaNova = !cat;
    const chaveCat = cat?.id ?? `nova:${it.tipo}|${norm(grupoFinal)}|${norm(it.categoria)}`;
    if (categoriaNova) {
      const k = `${it.tipo}|${norm(grupoFinal)}|${norm(it.categoria)}`;
      const n = novasMap.get(k) ?? { tipo: it.tipo, grupo: grupoFinal, nome: it.categoria, qtd: 0 };
      n.qtd += 1;
      novasMap.set(k, n);
    }
    let situacao: ItemAnalisado["situacao"] = "novo";
    if (!(it.valor > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(it.data)) situacao = "invalido";
    else if (!admin && mesesFechados.has(it.data.slice(0, 7))) situacao = "mes_fechado";
    else {
      const chave = `${it.branchId}|${it.tipo}|${chaveCat}|${it.valor}|${it.data}`;
      if (vistos.has(chave)) situacao = "dup_arquivo";
      else {
        vistos.add(chave);
        if (existentes.has(chave)) situacao = "dup_banco";
      }
    }
    return { ...it, categoriaId: cat?.id ?? null, grupoFinal, categoriaNova, situacao };
  });

  const conta = (s: ItemAnalisado["situacao"]) => analisados.filter((i) => i.situacao === s).length;
  return {
    itens: analisados,
    total: analisados.length,
    novos: conta("novo"),
    dupArquivo: conta("dup_arquivo"),
    dupBanco: conta("dup_banco"),
    mesFechado: conta("mes_fechado"),
    invalidos: conta("invalido"),
    totalPagar: r2(analisados.filter((i) => i.tipo === "pagar").reduce((s, i) => s + i.valor, 0)),
    totalReceber: r2(analisados.filter((i) => i.tipo === "receber").reduce((s, i) => s + i.valor, 0)),
    categoriasNovas: [...novasMap.values()].sort((a, b) => a.grupo.localeCompare(b.grupo) || a.nome.localeCompare(b.nome)),
    mesesFechados: [...new Set(analisados.filter((i) => i.situacao === "mes_fechado").map((i) => i.data.slice(0, 7)))].sort(),
  };
}

/** Grava os itens "novo" (e os duplicados, se pedido) num lote; cria as categorias que faltam. */
export async function executarImportacao(supabase: Cliente, userId: string, analise: Analise, incluirDuplicados: boolean, arquivos: string[]) {
  const permitidas = new Set<ItemAnalisado["situacao"]>(["novo", ...(incluirDuplicados ? (["dup_arquivo", "dup_banco"] as const) : [])]);
  const itens = analise.itens.filter((i) => permitidas.has(i.situacao));
  if (!itens.length) throw new Error("Nada para importar.");
  if (itens.length > 20_000) throw new Error("Máximo de 20.000 lançamentos por importação.");

  // categorias novas
  const idPorChave = new Map<string, string>();
  if (analise.categoriasNovas.length) {
    const { data, error } = await supabase
      .from("fin_categorias")
      .upsert(analise.categoriasNovas.map((c) => ({ tipo: c.tipo, grupo: c.grupo, nome: c.nome })), { onConflict: "tipo,grupo,nome" })
      .select("id, tipo, grupo, nome");
    if (error) throw new Error(`Categorias: ${error.message}`);
    for (const c of data) idPorChave.set(`${c.tipo}|${norm(c.grupo)}|${norm(c.nome)}`, c.id);
  }

  const loteId = randomUUID();
  const linhas = itens.map((i) => {
    const categoriaId = i.categoriaId ?? idPorChave.get(`${i.tipo}|${norm(i.grupoFinal)}|${norm(i.categoria)}`);
    if (!categoriaId) throw new Error(`Categoria não resolvida: ${i.categoria}`);
    return {
      branch_id: i.branchId!,
      tipo: i.tipo,
      categoria_id: categoriaId,
      valor: i.valor,
      data: i.data,
      competencia: i.data.slice(0, 7),
      descricao: "Importado do Omie",
      origem: "omie" as const,
      lote_id: loteId,
      created_by: userId,
    };
  });
  let inseridos = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from("fin_lancamentos").insert(linhas.slice(i, i + 500));
    if (error) {
      if (inseridos > 0) await supabase.from("fin_lancamentos").delete().eq("lote_id", loteId); // nada pela metade
      throw new Error(`Não consegui gravar (${error.message}). Nenhum lançamento deste lote ficou no sistema.`);
    }
    inseridos += Math.min(500, linhas.length - i);
  }
  const pulados = analise.itens.length - itens.length - analise.invalidos - analise.mesFechado;
  await registrarAuditoria(supabase, {
    userId,
    acao: "importar",
    entidade: "fin_lancamentos",
    registroId: loteId,
    novo: { origem: "omie", lote: loteId, inseridos, pulados: Math.max(0, pulados), categorias_novas: analise.categoriasNovas.length, arquivos, total_pagar: analise.totalPagar, total_receber: analise.totalReceber },
  });
  return { loteId, inseridos, pulados: Math.max(0, pulados) };
}

/** Apaga todos os lançamentos de um lote (quem importou, ou admin/financeiro). Meses fechados barram pelo trigger. */
export async function desfazerLote(supabase: Cliente, userId: string, loteId: string) {
  const { data, error } = await supabase.from("fin_lancamentos").select("id, valor, data").eq("lote_id", loteId);
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("Nenhum lançamento encontrado para este lote (talvez já desfeito).");
  const { error: eDel } = await supabase.from("fin_lancamentos").delete().eq("lote_id", loteId);
  if (eDel) throw new Error(eDel.message);
  await registrarAuditoria(supabase, { userId, acao: "excluir", entidade: "fin_lancamentos", registroId: loteId, anterior: { lote: loteId, removidos: data.length, total: r2(data.reduce((s, l) => s + Number(l.valor), 0)) } });
  return data.length;
}
