// Migração do fluxo de caixa anterior (SQLite "fluxo-caixa.db") para o Sistema FCT — só servidor,
// com a sessão do administrador (RLS). Mesma lógica de scripts/migrar-financeiro.mjs, mais os extras:
// molde da DRE, ajustes do contador, saldos, orçamento, fluxo mensal/diário e inadimplência.
// Reexecutável: unidades só são criadas se faltarem; categorias são upsert; lançamentos por legado_id.
import initSqlJs from "sql.js/dist/sql-asm.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/auditoria";
import type { Database, Json } from "@/lib/supabase/types";
import type { FinTipo } from "./rotulos";

type Cliente = SupabaseClient<Database>;
type Row = Record<string, unknown>;

export type Seeds = {
  familias?: { nome: string; sinal?: number; grupos: { nome: string; categorias: string[] }[] }[];
  cat2cls?: Record<string, { familia: string; grupo: string; sinal: number }>;
  cat2fin?: Record<string, { familia: string; grupo: string }>;
};

export type Legado = {
  categorias: { tipo: string; grupo: string; categoria: string }[];
  filiais: { nome: string; empresa: string; regional: string; ativo: number }[];
  lancamentos: { id: number; filial: string; tipo: string; grupo: string; categoria: string; valor: number; data: string; obs: string | null; lote_id: string | null }[];
  overrides: { empresa: string; filial: string; categoria: string; mes: string; valor: number }[];
  saldos: { empresa: string; filial: string; mes: string; campo: string; valor: number }[];
  orcamento: { empresa: string; filial: string; grupo: string; categoria: string; mes: string; valor: number | null; realizado: number | null }[];
  fluxoMensal: { empresa: string; mes: string; linha: string; provisao: number | null; realizado: number | null }[];
  fluxoDiario: { empresa: string; data: string; campo: string; valor: number | null; txt: string | null }[];
  inadimplencia: { tipo: string; ano: number; mes: number; atrasado: number | null; recebido: number | null }[];
};

export const limpar = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const chaveNome = (s: string) => semAcento(limpar(s)).toLowerCase();
export const TIPO: Record<string, FinTipo> = { pagar: "pagar", receber: "receber" };
const GRUPOS_IGNORADOS = new Set(["teste", "testeshim", "zz"]);
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const r2 = (v: number) => Math.round(v * 100) / 100;

/** "empresa" do legado → grupo da diretoria usado nas telas. */
export function grupoLegado(empresa: unknown) {
  const e = chaveNome(String(empresa ?? "")).toUpperCase();
  if (!e || e === "GRUPO") return "TODOS";
  if (e === "NAZARIO") return "NAZÁRIO";
  if (e === "ITAJAI") return "ITAJAÍ";
  if (e === "VARELA" || e === "BLUMENAU") return e;
  return e;
}

function consultar(db: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>, sql: string): Row[] {
  const r = db.exec(sql);
  if (!r.length) return [];
  const { columns, values } = r[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

export async function lerLegado(buf: Buffer): Promise<Legado> {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(buf));
  try {
    const tabelas = new Set(consultar(db, "select name from sqlite_master where type='table'").map((r) => String(r.name)));
    if (!tabelas.has("lancamentos") || !tabelas.has("categorias")) throw new Error("Este arquivo não parece ser o banco do fluxo de caixa (faltam as tabelas lancamentos/categorias).");
    const opc = <T,>(tabela: string, sql: string): T[] => (tabelas.has(tabela) ? (consultar(db, sql) as T[]) : []);
    return {
      categorias: consultar(db, "select tipo, grupo, categoria from categorias") as Legado["categorias"],
      filiais: opc("filiais", "select nome, empresa, regional, ativo from filiais"),
      lancamentos: consultar(db, "select id, filial, tipo, grupo, categoria, valor, data, obs, lote_id from lancamentos order by id") as Legado["lancamentos"],
      overrides: opc("contabil_override", "select empresa, filial, categoria, mes, valor from contabil_override"),
      saldos: opc("saldos_dre", "select empresa, filial, mes, campo, valor from saldos_dre"),
      orcamento: opc("orcamento", "select empresa, filial, grupo, categoria, mes, valor, realizado from orcamento"),
      fluxoMensal: opc("fluxo_mensal", "select empresa, mes, linha, provisao, realizado from fluxo_mensal"),
      fluxoDiario: opc("fluxo_diario", "select empresa, data, campo, valor, txt from fluxo_diario"),
      inadimplencia: opc("inadimplencia", "select tipo, ano, mes, atrasado, recebido from inadimplencia"),
    };
  } finally {
    db.close();
  }
}

// ---------- unidades ----------

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const COD_RE = /\bF\d{3}\b/;
const digitos = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const EMPRESA_LEGADO: Record<string, string> = { VARELA: "VARELA", ITAJAI: "VARELA", NAZARIO: "NAZARIO", BLUMENAU: "NAZARIO" };
const REGIONAL_LEGADO: Record<string, string> = { SUL: "Sul", SERRA: "Serra", OESTE: "Oeste", BLUMENAU: "Blumenau", "VALE DO ITAJAI": "Vale do Itajaí" };
const NOMES: Record<string, string> = { "SAO VICENTE": "SÃO VICENTE", ITAJAI: "ITAJAÍ", CENTENARIO: "CENTENÁRIO", "ALVARO CATAO": "ÁLVARO CATÃO", ADMINSTRATIVO: "ADMINISTRATIVO" };
const ESPECIAIS: Record<string, { codigo: string; nome: string; empresa: string; regional: string }> = {
  TELEVENDAS: { codigo: "TLV", nome: "TELEVENDAS", empresa: "VARELA", regional: "Administrativo" },
  TERCEIRIZADAS: { codigo: "TERC", nome: "TERCEIRIZADAS (legado)", empresa: "VARELA", regional: "Terceirizadas" },
  "423 - ADMINISTRATIVO 20-82": { codigo: "F423", nome: "ADMINISTRATIVO", empresa: "NAZARIO", regional: "Administrativo" },
};
const regionalPorCodigo = (codigo: string) => {
  const n = Number(codigo.slice(1));
  return n < 100 ? "Sul" : n < 200 ? "Serra" : n < 300 ? "Vale do Itajaí" : n < 500 ? "Oeste" : "Blumenau";
};

export type Branch = { id: string; codigo: string; nome: string; cnpj: string | null; organization_id: string; ativo: boolean };
export type NovaUnidade = { nomeLegado: string; codigo: string; nome: string; cnpj: string | null; empresa: string; regional: string; ativo: boolean };

export function existente(nomeLegado: string, branches: Branch[]) {
  const cnpj = CNPJ_RE.exec(nomeLegado)?.[0];
  if (cnpj) {
    const b = branches.find((x) => digitos(x.cnpj) === digitos(cnpj));
    if (b) return b;
  }
  const codigo = COD_RE.exec(nomeLegado)?.[0] ?? ESPECIAIS[limpar(nomeLegado)]?.codigo;
  return codigo ? branches.find((x) => x.codigo === codigo) : undefined;
}

function planejarNova(nomeLegado: string, filiaisLegado: Legado["filiais"]): NovaUnidade | null {
  const legado = filiaisLegado.find((f) => f.nome === nomeLegado);
  const esp = ESPECIAIS[limpar(nomeLegado)];
  if (esp) return { nomeLegado, ...esp, cnpj: null, ativo: true };
  const codigo = COD_RE.exec(nomeLegado)?.[0];
  if (!codigo) return null;
  const cnpj = CNPJ_RE.exec(nomeLegado)?.[0] ?? null;
  let nome = limpar(nomeLegado.replace(CNPJ_RE, "").replace(COD_RE, "").replace(/INATIVA/i, "").replace(/[-–]/g, " ")).toUpperCase();
  nome = NOMES[nome] ?? nome;
  const empresa = EMPRESA_LEGADO[limpar(legado?.empresa).toUpperCase()] ?? (codigo >= "F300" ? "NAZARIO" : "VARELA");
  const regional = REGIONAL_LEGADO[limpar(legado?.regional).toUpperCase()] ?? regionalPorCodigo(codigo);
  const ativo = !/INATIVA/i.test(nomeLegado) && (legado ? legado.ativo !== 0 : true);
  return { nomeLegado, codigo, nome, cnpj, empresa, regional, ativo };
}

// ---------- categorias ----------

type CategoriaNova = { tipo: FinTipo; grupo: string; nome: string; dre_familia: string | null; dre_grupo: string | null; dre_sinal: number | null; fin_familia: string | null; fin_grupo: string | null };

function procurar<T>(mapa: Record<string, T> | undefined, nome: string): T | undefined {
  if (!mapa) return undefined;
  return mapa[nome] ?? mapa[limpar(nome)] ?? Object.entries(mapa).find(([k]) => chaveNome(k) === chaveNome(nome))?.[1];
}

export function montarCategorias(legado: Legado, seeds: Seeds) {
  const categorias = new Map<string, CategoriaNova>();
  const chave = (tipo: string, grupo: string, nome: string) => `${tipo}|${grupo}|${nome}`;
  const registrar = (tipoLegado: unknown, grupoLegado_: unknown, nomeLegado: unknown) => {
    const tipo = TIPO[chaveNome(String(tipoLegado ?? ""))];
    const grupo = limpar(grupoLegado_);
    const nome = limpar(nomeLegado);
    if (!tipo || !grupo || !nome) return null;
    const k = chave(tipo, grupo, nome);
    if (!categorias.has(k)) {
      const cls = procurar(seeds.cat2cls, nome);
      const fin = procurar(seeds.cat2fin, nome);
      categorias.set(k, { tipo, grupo, nome, dre_familia: cls?.familia ?? null, dre_grupo: cls?.grupo ?? null, dre_sinal: cls?.sinal ?? null, fin_familia: fin?.familia ?? null, fin_grupo: fin?.grupo ?? null });
    }
    return k;
  };
  for (const c of legado.categorias) {
    if (GRUPOS_IGNORADOS.has(chaveNome(c.grupo))) continue;
    registrar(c.tipo, c.grupo, c.categoria);
  }
  let combosNovos = 0;
  for (const l of legado.lancamentos) {
    const antes = categorias.size;
    registrar(l.tipo, l.grupo, l.categoria);
    if (categorias.size > antes) combosNovos += 1;
  }
  return { categorias, chave, registrar, combosNovos };
}

// ---------- plano ----------

export type Plano = {
  unidades: { existentes: { legado: string; codigo: string; nome: string; qtd: number }[]; novas: (NovaUnidade & { qtd: number })[]; semMapa: string[] };
  categorias: { total: number; combosNovos: number; semDre: number };
  lancamentos: { total: number; receber: number; pagar: number; totalReceber: number; totalPagar: number; jaExistem: number; de: string | null; ate: string | null };
  extras: { overrides: number; saldos: number; orcamento: number; fluxoMensal: number; fluxoDiario: number; inadimplencia: number; estruturaDre: number };
};

async function carregarBase(supabase: Cliente) {
  const [{ data: orgs, error: eOrgs }, { data: branches, error: eBr }] = await Promise.all([
    supabase.from("organizations").select("id, nome_fantasia"),
    supabase.from("branches").select("id, codigo, nome, cnpj, organization_id, ativo"),
  ]);
  if (eOrgs) throw new Error(eOrgs.message);
  if (eBr) throw new Error(eBr.message);
  const orgPorNome = (nome: string) => (orgs ?? []).find((o) => chaveNome(o.nome_fantasia ?? "") === chaveNome(nome)) ?? null;
  return { orgPorNome, branches: (branches ?? []) as Branch[] };
}

export function mapearUnidades(legado: Legado, branches: Branch[], orgPorNome: (n: string) => { id: string } | null) {
  const nomes = [...new Set(legado.lancamentos.map((l) => l.filial))].sort();
  const contagem = new Map<string, number>();
  for (const l of legado.lancamentos) contagem.set(l.filial, (contagem.get(l.filial) ?? 0) + 1);
  const mapa = new Map<string, string>();
  const existentes: Plano["unidades"]["existentes"] = [];
  const novas: Plano["unidades"]["novas"] = [];
  const semMapa: string[] = [];
  for (const nome of nomes) {
    const b = existente(nome, branches);
    if (b) {
      mapa.set(nome, b.id);
      existentes.push({ legado: nome, codigo: b.codigo, nome: b.nome, qtd: contagem.get(nome) ?? 0 });
      continue;
    }
    const plano = planejarNova(nome, legado.filiais);
    if (!plano || !orgPorNome(plano.empresa)) {
      semMapa.push(nome);
      continue;
    }
    novas.push({ ...plano, qtd: contagem.get(nome) ?? 0 });
  }
  return { mapa, existentes, novas, semMapa };
}

export async function planejarMigracao(supabase: Cliente, legado: Legado, seeds: Seeds): Promise<Plano> {
  const { orgPorNome, branches } = await carregarBase(supabase);
  const { existentes, novas, semMapa } = mapearUnidades(legado, branches, orgPorNome);
  const { categorias, combosNovos } = montarCategorias(legado, seeds);
  const { count } = await supabase.from("fin_lancamentos").select("id", { count: "exact", head: true }).not("legado_id", "is", null);
  const receber = legado.lancamentos.filter((l) => TIPO[chaveNome(l.tipo)] === "receber");
  const pagar = legado.lancamentos.filter((l) => TIPO[chaveNome(l.tipo)] === "pagar");
  const datas = legado.lancamentos.map((l) => l.data).sort();
  return {
    unidades: { existentes, novas, semMapa },
    categorias: { total: categorias.size, combosNovos, semDre: [...categorias.values()].filter((c) => !c.dre_familia).length },
    lancamentos: {
      total: legado.lancamentos.length,
      receber: receber.length,
      pagar: pagar.length,
      totalReceber: r2(receber.reduce((s, l) => s + Number(l.valor), 0)),
      totalPagar: r2(pagar.reduce((s, l) => s + Number(l.valor), 0)),
      jaExistem: count ?? 0,
      de: datas[0] ?? null,
      ate: datas[datas.length - 1] ?? null,
    },
    extras: {
      overrides: legado.overrides.length,
      saldos: legado.saldos.length,
      orcamento: legado.orcamento.length,
      fluxoMensal: legado.fluxoMensal.length,
      fluxoDiario: legado.fluxoDiario.length,
      inadimplencia: legado.inadimplencia.length,
      estruturaDre: (seeds.familias ?? []).reduce((s, f) => s + f.grupos.length, 0),
    },
  };
}

// ---------- execução ----------

export type ResultadoMigracao = { unidadesCriadas: string[]; categorias: number; inseridos: number; jaExistiam: number; extras: Record<string, number>; avisos: string[] };

export async function executarMigracao(supabase: Cliente, userId: string, legado: Legado, seeds: Seeds): Promise<ResultadoMigracao> {
  const avisos: string[] = [];
  const { orgPorNome, branches } = await carregarBase(supabase);
  const { mapa, novas, semMapa } = mapearUnidades(legado, branches, orgPorNome);
  if (semMapa.length) throw new Error(`Filiais do legado sem correspondência e sem regra de criação: ${semMapa.join(", ")}`);

  // 1) unidades novas
  const unidadesCriadas: string[] = [];
  if (novas.length) {
    const { data, error } = await supabase
      .from("branches")
      .insert(novas.map((n) => ({ organization_id: orgPorNome(n.empresa)!.id, codigo: n.codigo, nome: n.nome, cnpj: n.cnpj, regional: n.regional, ativo: n.ativo })))
      .select("id, codigo");
    if (error) throw new Error(`Criar unidades: ${error.message}`);
    for (const n of novas) {
      const b = data.find((x) => x.codigo === n.codigo);
      if (b) {
        mapa.set(n.nomeLegado, b.id);
        unidadesCriadas.push(b.codigo);
      }
    }
    await registrarAuditoria(supabase, { userId, acao: "importar", entidade: "branches", novo: { origem: "migracao-financeiro", unidades: unidadesCriadas } });
  }

  // 2) categorias
  const { categorias, chave, registrar } = montarCategorias(legado, seeds);
  const { data: cats, error: eCat } = await supabase.from("fin_categorias").upsert([...categorias.values()], { onConflict: "tipo,grupo,nome" }).select("id, tipo, grupo, nome");
  if (eCat) throw new Error(`Categorias: ${eCat.message}`);
  const idCategoria = new Map(cats.map((c) => [chave(c.tipo, c.grupo, c.nome), c.id]));
  const idPorNome = new Map<string, string>(); // nome → id (preferindo pagar), p/ overrides e orçamento do legado
  for (const c of cats) {
    const k = chaveNome(c.nome);
    if (!idPorNome.has(k) || c.tipo === "pagar") idPorNome.set(k, c.id);
  }

  // 3) molde da DRE
  const extras: Record<string, number> = {};
  if (seeds.familias?.length) {
    const linhas = seeds.familias.flatMap((f, i) => f.grupos.map((g, j) => ({ familia: f.nome, grupo: g.nome, ordem_familia: i + 1, ordem_grupo: j + 1, sinal: f.sinal ?? -1 })));
    const { error } = await supabase.from("fin_dre_estrutura").upsert(linhas, { onConflict: "familia,grupo" });
    if (error) avisos.push(`Molde da DRE: ${error.message}`);
    else extras.estruturaDre = linhas.length;
  }

  // 4) lançamentos
  const linhas = legado.lancamentos.map((l) => {
    const k = registrar(l.tipo, l.grupo, l.categoria);
    const categoria_id = k ? idCategoria.get(k) : undefined;
    if (!categoria_id) throw new Error(`Categoria sem id: ${l.tipo} / ${l.grupo} / ${l.categoria}`);
    const obs = limpar(l.obs);
    return {
      branch_id: mapa.get(l.filial)!,
      tipo: TIPO[chaveNome(l.tipo)],
      categoria_id,
      valor: r2(Number(l.valor)),
      data: l.data,
      competencia: l.data.slice(0, 7),
      descricao: obs || null,
      origem: (/omie/i.test(obs) ? "omie" : "migracao") as "omie" | "migracao",
      lote_id: UUID_RE.test(l.lote_id ?? "") ? l.lote_id : null,
      legado_id: l.id,
    };
  });
  let inseridos = 0;
  for (let i = 0; i < linhas.length; i += 500) {
    const { data, error } = await supabase.from("fin_lancamentos").upsert(linhas.slice(i, i + 500), { onConflict: "legado_id", ignoreDuplicates: true }).select("legado_id");
    if (error) throw new Error(`Lançamentos (a partir de ${i}): ${error.message}`);
    inseridos += data.length;
  }

  // 5) extras (ajustes do contador, saldos, orçamento, fluxo, inadimplência)
  const branchDe = (filialLegado: string) => (limpar(filialLegado) ? (mapa.get(limpar(filialLegado)) ?? existente(limpar(filialLegado), branches)?.id ?? null) : null);
  const num = (v: unknown) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : r2(Number(v)));

  const ajustes = legado.overrides.flatMap((o) => {
    const categoria_id = idPorNome.get(chaveNome(o.categoria));
    const valor = num(o.valor);
    return categoria_id && valor !== null ? [{ grupo: grupoLegado(o.empresa), branch_id: branchDe(o.filial), categoria_id, competencia: o.mes, valor, atualizado_por: userId }] : [];
  });
  if (ajustes.length) {
    const { error } = await supabase.from("fin_dre_ajustes").upsert(ajustes, { onConflict: "chave" });
    if (error) avisos.push(`Ajustes da DRE: ${error.message}`);
    else extras.ajustesDre = ajustes.length;
  }
  const saldos = legado.saldos.flatMap((s) => {
    const valor = num(s.valor);
    return valor !== null ? [{ grupo: grupoLegado(s.empresa), branch_id: branchDe(s.filial), competencia: s.mes, campo: s.campo, valor, atualizado_por: userId }] : [];
  });
  if (saldos.length) {
    const { error } = await supabase.from("fin_dre_saldos").upsert(saldos, { onConflict: "chave" });
    if (error) avisos.push(`Saldos da DRE: ${error.message}`);
    else extras.saldos = saldos.length;
  }
  const orcamentos = legado.orcamento.flatMap((o) => {
    const k = registrar("Pagar", o.grupo, o.categoria);
    const categoria_id = (k ? idCategoria.get(k) : undefined) ?? idPorNome.get(chaveNome(o.categoria));
    return categoria_id ? [{ grupo: grupoLegado(o.empresa), categoria_id, competencia: o.mes, valor: num(o.valor), realizado_informado: num(o.realizado), atualizado_por: userId }] : [];
  });
  if (orcamentos.length) {
    const { error } = await supabase.from("fin_orcamentos").upsert(orcamentos, { onConflict: "grupo,categoria_id,competencia" });
    if (error) avisos.push(`Orçamento: ${error.message}`);
    else extras.orcamento = orcamentos.length;
  }
  if (legado.fluxoMensal.length) {
    const { error } = await supabase.from("fin_fluxo_mensal").upsert(
      legado.fluxoMensal.map((f) => ({ grupo: grupoLegado(f.empresa), competencia: f.mes, linha: f.linha, provisao: num(f.provisao), realizado: num(f.realizado), atualizado_por: userId })),
      { onConflict: "grupo,competencia,linha" },
    );
    if (error) avisos.push(`Fluxo mensal: ${error.message}`);
    else extras.fluxoMensal = legado.fluxoMensal.length;
  }
  if (legado.fluxoDiario.length) {
    const { error } = await supabase.from("fin_fluxo_diario").upsert(
      legado.fluxoDiario.map((f) => ({ grupo: grupoLegado(f.empresa), data: f.data, campo: f.campo, valor: num(f.valor), texto: f.txt ? String(f.txt) : null, atualizado_por: userId })),
      { onConflict: "grupo,data,campo" },
    );
    if (error) avisos.push(`Fluxo diário: ${error.message}`);
    else extras.fluxoDiario = legado.fluxoDiario.length;
  }
  if (legado.inadimplencia.length) {
    const { error } = await supabase.from("fin_inadimplencia").upsert(
      legado.inadimplencia.filter((i) => i.tipo === "crediario" || i.tipo === "convenio").map((i) => ({ tipo: i.tipo, ano: Number(i.ano), mes: Number(i.mes), atrasado: num(i.atrasado), recebido: num(i.recebido), atualizado_por: userId })),
      { onConflict: "tipo,ano,mes" },
    );
    if (error) avisos.push(`Inadimplência: ${error.message}`);
    else extras.inadimplencia = legado.inadimplencia.length;
  }

  const resultado: ResultadoMigracao = { unidadesCriadas, categorias: cats.length, inseridos, jaExistiam: linhas.length - inseridos, extras, avisos };
  await registrarAuditoria(supabase, { userId, acao: "importar", entidade: "fin_lancamentos", novo: { origem: "migracao", ...resultado, extras: extras as Json } });
  return resultado;
}
