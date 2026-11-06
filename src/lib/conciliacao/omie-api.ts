// Cliente da API do Omie (só servidor). Duas empresas, cada uma com suas chaves (app_key/app_secret), que vêm de
// `chavesOmie(supabase, empresa)`: o que o administrador gravou em Administração → Integrações (Vault) ou, se não
// houver, as variáveis OMIE_<EMPRESA>_APP_KEY/APP_SECRET. Nunca vão para o navegador. Portado do api.php anterior.
import type { SupabaseClient } from "@supabase/supabase-js";
import { chavesOmieDe, type ChavesOmie } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";

export type EmpresaOmie = "nazario" | "varela";
export const EMPRESAS_OMIE: Record<EmpresaOmie, string> = { nazario: "Nazário", varela: "Varela" };
export const ehEmpresaOmie = (v: unknown): v is EmpresaOmie => v === "nazario" || v === "varela";
export type Chaves = Pick<ChavesOmie, "app_key" | "app_secret">;

const URL_OMIE = process.env.OMIE_URL ?? "https://app.omie.com.br/api/v1/";
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OmieErro extends Error {}

/** Chaves da empresa (tela de Integrações ou ambiente) ou null se ainda não configuradas. */
export const chavesOmie = (supabase: SupabaseClient<Database>, emp: EmpresaOmie) => chavesOmieDe(supabase, emp);

/** O que a tela pode saber das chaves: se existem, de onde vêm e os 4 últimos caracteres. */
export async function statusChaves(supabase: SupabaseClient<Database>): Promise<Record<EmpresaOmie, { configurado: boolean; final: string; origem: "sistema" | "ambiente" | null }>> {
  const s = async (emp: EmpresaOmie) => {
    const c = await chavesOmieDe(supabase, emp);
    return { configurado: !!c, final: c ? c.app_key.slice(-4) : "", origem: c?.origem ?? null };
  };
  return { nazario: await s("nazario"), varela: await s("varela") };
}

type Resposta = Record<string, unknown>;

async function chamar(ch: Chaves, emp: EmpresaOmie, caminho: string, call: string, param: Record<string, unknown>): Promise<Resposta> {
  if (!ch?.app_key || !ch.app_secret) throw new OmieErro(`As chaves da Omie da ${EMPRESAS_OMIE[emp]} não estão configuradas (Administração → Integrações).`);
  const corpo = JSON.stringify({ call, app_key: ch.app_key, app_secret: ch.app_secret, param: [param] });
  let ultimo = "";
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    let texto = "";
    let codigo = 0;
    try {
      const r = await fetch(URL_OMIE + caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, signal: AbortSignal.timeout(60_000) });
      codigo = r.status;
      texto = await r.text();
    } catch (e) {
      ultimo = e instanceof Error ? e.message : "sem conexão";
      if (tentativa < 2) {
        await dormir(2000);
        continue;
      }
      throw new OmieErro(`Não consegui falar com a Omie (${ultimo}).`);
    }
    let json: unknown;
    try {
      json = JSON.parse(texto);
    } catch {
      throw new OmieErro(`Resposta inesperada da Omie (HTTP ${codigo}).`);
    }
    if (!json || typeof json !== "object") throw new OmieErro(`Resposta inesperada da Omie (HTTP ${codigo}).`);
    const j = json as Resposta;
    if (typeof j.faultstring === "string") {
      ultimo = j.faultstring;
      // API bloqueada por consumo indevido: insistir não adianta, a Omie diz quantos segundos faltam
      if (/bloqueada/i.test(ultimo)) throw new OmieErro(ultimo);
      // limite de uso / requisição repetida: espera e tenta de novo
      if (tentativa < 2 && /consumo redundante|aguarde|too many|tente novamente em/i.test(ultimo)) {
        await dormir(3000);
        continue;
      }
      throw new OmieErro(ultimo);
    }
    return j;
  }
  throw new OmieErro(ultimo || "A Omie não respondeu.");
}

const semRegistros = (msg: string) => /n[aã]o (existem|h[aá]) registros/i.test(msg);

async function todas<T = Resposta>(ch: Chaves, emp: EmpresaOmie, caminho: string, call: string, extra: Record<string, unknown>, campo: string): Promise<T[]> {
  const out: T[] = [];
  for (let pagina = 1; pagina <= 40; pagina++) {
    let r: Resposta;
    try {
      r = await chamar(ch, emp, caminho, call, { pagina, registros_por_pagina: 500, ...extra });
    } catch (e) {
      if (e instanceof OmieErro && semRegistros(e.message)) break;
      throw e;
    }
    out.push(...((r[campo] as T[] | undefined) ?? []));
    if (pagina >= Number(r.total_de_paginas ?? 1)) break;
  }
  return out;
}

/** Movimento de conta corrente do Omie (pagamento, recebimento ou lançamento direto no extrato), só o que o caixa usa. */
export type MovimentoCaixaOmie = {
  categorias?: { cCodCateg?: string; nDistrPercentual?: number }[];
  departamentos?: { cCodDepartamento?: string; nDistrPercentual?: number }[];
  detalhes?: { cCodCateg?: string; cGrupo?: string; cNatureza?: string; cOrigem?: string; nValorMovCC?: number; nCodMovCC?: number; nCodBaixa?: number; nCodTitulo?: number };
  resumo?: { nValPago?: number };
};

/** Uma página dos movimentos de conta corrente de um dia (pela data de pagamento), com a distribuição por departamento. */
export async function movimentosCaixaDoDia(ch: Chaves, emp: EmpresaOmie, diaBr: string, pagina: number) {
  try {
    const r = await chamar(ch, emp, "financas/mf/", "ListarMovimentos", { nPagina: pagina, nRegPorPagina: 100, dDtPagtoDe: diaBr, dDtPagtoAte: diaBr, cTpLancamento: "CC", cExibirDepartamentos: "S" });
    return { movimentos: (r.movimentos as MovimentoCaixaOmie[] | undefined) ?? [], paginas: Number(r.nTotPaginas ?? 1), total: Number(r.nTotRegistros ?? 0) };
  } catch (e) {
    if (e instanceof OmieErro && semRegistros(e.message)) return { movimentos: [], paginas: 0, total: 0 };
    throw e;
  }
}

/** Todas as categorias da empresa (receita e despesa), código e nome. */
export async function listarCategoriasOmie(ch: Chaves, emp: EmpresaOmie) {
  const cats = await todas<{ codigo: string | number; descricao: string }>(ch, emp, "geral/categorias/", "ListarCategorias", {}, "categoria_cadastro");
  return cats.map((c) => ({ codigo: String(c.codigo), nome: c.descricao }));
}

/** Todos os títulos a pagar com vencimento no período. Sem conseguir ler tudo, dá erro: nada sobe sem conferir. */
export async function todosTitulosOmie(ch: Chaves, emp: EmpresaOmie, de: string, ate: string, limiteMs: number) {
  const prazo = Date.now() + limiteMs;
  const titulos: { codigo: string; barra: string; omie: string; doc: string; venc: string; valor: number }[] = [];
  for (let pagina = 1, paginas = 1; pagina <= paginas; pagina++) {
    if (Date.now() > prazo) throw new OmieErro(`Não deu tempo de conferir tudo com a Omie da ${EMPRESAS_OMIE[emp]}: filtre por um período menor.`);
    const r = await listarTitulosOmie(ch, emp, de, ate, pagina);
    paginas = r.paginas;
    for (const [codigo, barra, omie, doc, venc, valor] of r.titulos) titulos.push({ codigo, barra, omie, doc, venc, valor });
  }
  return titulos;
}

export function normOmie(s: unknown) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export type Departamento = { codigo: string; descricao: string };

/** Departamento pelo começo do nome: "F301 …", "301 …", "F001 …", "423 - …", "TRIO …". */
export function departamentoPorPrefixo(deps: Departamento[], prefixo: string) {
  const m = /^F?(\d+)$/i.exec(prefixo);
  const re = m ? new RegExp(`^F?0*${Number(m[1])}\\b`) : new RegExp(`^${normOmie(prefixo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
  return deps.find((d) => re.test(normOmie(d.descricao))) ?? null;
}

export type CacheOmie = {
  quando: string;
  por: string | null;
  conta: { id: number; nome: string } | null;
  categoria: { codigo: string; nome: string } | null;
  departamentos: Record<string, { codigo: string; nome: string }>;
  departamentosFaltando: string[];
  todos: Departamento[];
  opcoesConta: string[];
  opcoesCategoria: string[];
  /** Categorias de despesa com código (para as regras automáticas). Cache antigo não tem: buscar os cadastros de novo. */
  categorias?: { codigo: string; nome: string }[];
};

/** Busca na Omie as contas correntes, categorias e departamentos e liga pelos nomes. */
export async function buscarCadastros(ch: Chaves, emp: EmpresaOmie, nomeConta: string, nomeCategoria: string, departamentosPedidos: string[], por: string | null): Promise<CacheOmie> {
  type Conta = { nCodCC: number; descricao: string; inativo?: string };
  type Categoria = { codigo: string; descricao: string; conta_inativa?: string; conta_despesa?: string };
  type Dep = { codigo: string | number; descricao: string; inativo?: string };
  const contas = (await todas<Conta>(ch, emp, "geral/contacorrente/", "ListarContasCorrentes", { apenas_importado_api: "N" }, "ListarContasCorrentes")).filter((c) => c.inativo !== "S");
  const cats = (await todas<Categoria>(ch, emp, "geral/categorias/", "ListarCategorias", { filtrar_apenas_ativo: "S" }, "categoria_cadastro")).filter((c) => c.conta_inativa !== "S");
  const deps: Departamento[] = (await todas<Dep>(ch, emp, "geral/departamentos/", "ListarDepartamentos", {}, "departamentos"))
    .filter((d) => d.inativo !== "S")
    .map((d) => ({ codigo: String(d.codigo), descricao: String(d.descricao ?? "") }));

  const conta = contas.find((c) => normOmie(c.descricao) === normOmie(nomeConta));
  const candidatas = cats.filter((c) => normOmie(c.descricao) === normOmie(nomeCategoria));
  const categoria = candidatas.find((c) => c.conta_despesa === "S") ?? candidatas[0];
  const departamentos: CacheOmie["departamentos"] = {};
  const faltando: string[] = [];
  for (const nome of departamentosPedidos) {
    let achou = deps.find((d) => normOmie(d.descricao) === normOmie(nome)) ?? null;
    if (!achou) {
      const m = /^(F?\d{1,3}|TRIO)\b/i.exec(nome);
      if (m) achou = departamentoPorPrefixo(deps, m[1]);
    }
    if (achou) departamentos[nome] = { codigo: achou.codigo, nome: achou.descricao };
    else faltando.push(nome);
  }
  return {
    quando: new Date().toISOString(),
    por,
    conta: conta ? { id: conta.nCodCC, nome: conta.descricao } : null,
    categoria: categoria ? { codigo: String(categoria.codigo), nome: categoria.descricao } : null,
    departamentos,
    departamentosFaltando: faltando,
    todos: deps,
    opcoesConta: contas.map((c) => c.descricao),
    opcoesCategoria: cats.filter((c) => c.conta_despesa === "S").map((c) => c.descricao),
    categorias: cats.filter((c) => c.conta_despesa === "S").map((c) => ({ codigo: String(c.codigo), nome: c.descricao })),
  };
}

const docFmt = (d: string) =>
  d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;

/** Código do fornecedor na Omie: procura pelo CNPJ/CPF (ou nome) e, se pedido, cadastra. */
async function codigoFornecedor(ch: Chaves, emp: EmpresaOmie, cnpj: string, nome: string, cadastrar: boolean, cache: Map<string, number>): Promise<number> {
  type Cliente = { codigo_cliente_omie: number; cnpj_cpf?: string };
  const doc = cnpj.replace(/\D/g, "");
  if (doc && doc.length !== 11 && doc.length !== 14) throw new OmieErro("CNPJ/CPF do fornecedor inválido.");
  const chave = doc || `N:${normOmie(nome)}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;
  const buscar = async (filtro: Record<string, string>) => {
    try {
      const r = await chamar(ch, emp, "geral/clientes/", "ListarClientes", { pagina: 1, registros_por_pagina: 50, apenas_importado_api: "N", clientesFiltro: filtro });
      return (r.clientes_cadastro as Cliente[] | undefined) ?? [];
    } catch (e) {
      if (e instanceof OmieErro && semRegistros(e.message)) return [];
      throw e;
    }
  };
  if (doc) {
    let lista = await buscar({ cnpj_cpf: docFmt(doc) });
    if (!lista.length) lista = await buscar({ cnpj_cpf: doc });
    lista = lista.filter((c) => (c.cnpj_cpf ?? "").replace(/\D/g, "") === doc);
    if (lista.length) {
      cache.set(chave, lista[0].codigo_cliente_omie);
      return lista[0].codigo_cliente_omie;
    }
    if (!cadastrar) throw new OmieErro(`fornecedor ${docFmt(doc)} não está cadastrado na Omie.`);
    if (!nome.trim()) throw new OmieErro("fornecedor sem nome para cadastrar.");
    try {
      const r = await chamar(ch, emp, "geral/clientes/", "IncluirCliente", {
        codigo_cliente_integracao: `FCT${doc}`,
        razao_social: nome.slice(0, 60),
        nome_fantasia: nome.slice(0, 100),
        cnpj_cpf: docFmt(doc),
        tags: [{ tag: "Fornecedor" }],
      });
      const codigo = Number(r.codigo_cliente_omie);
      cache.set(chave, codigo);
      return codigo;
    } catch (e) {
      // corrida: alguém cadastrou no meio do caminho
      const lista2 = (await buscar({ cnpj_cpf: docFmt(doc) })).filter((c) => (c.cnpj_cpf ?? "").replace(/\D/g, "") === doc);
      if (lista2.length) {
        cache.set(chave, lista2[0].codigo_cliente_omie);
        return lista2[0].codigo_cliente_omie;
      }
      throw new OmieErro(`não consegui cadastrar o fornecedor na Omie: ${e instanceof Error ? e.message : e}`);
    }
  }
  // sem CNPJ: só se o nome for único
  const lista = await buscar({ razao_social: nome.slice(0, 60) });
  const iguais = lista.filter((c) => normOmie((c as { razao_social?: string }).razao_social) === normOmie(nome));
  if (iguais.length === 1) {
    cache.set(chave, iguais[0].codigo_cliente_omie);
    return iguais[0].codigo_cliente_omie;
  }
  throw new OmieErro(iguais.length ? "mais de um fornecedor com esse nome na Omie; informe o CNPJ." : "fornecedor sem CNPJ e não encontrado pelo nome na Omie.");
}

export type ContaApi = {
  chave: string;
  codigo: string;
  cnpj: string;
  nome: string;
  valor: number;
  venc: string; // dd/mm/aaaa
  /** Emissão do título no Trier (dd/mm/aaaa). Sem ela, vai o vencimento. */
  emissao?: string | null;
  numdoc: string;
  nota: string;
  barra: string;
  obs: string;
  departamento: string;
  fil: number | null;
  /** Categoria vinda de uma regra automática (sem regra: a categoria padrão). */
  categoria?: string;
  /** O departamento veio de uma regra: não cai para o da filial se não for achado. */
  departamentoFixo?: boolean;
};

/** `adiada`: não houve tentativa, faltou tempo nesta chamada; vale mandar de novo. `parada`: o lote parou por erros seguidos ou API bloqueada. */
export type ResultadoLancamento = { chave: string; ok: boolean; codigoOmie?: string | null; msg?: string; erro?: string; adiada?: boolean; parada?: boolean };

/** Erros seguidos que param o lote: a Omie bloqueia a API por 30 minutos quando recebe muitas chamadas com erro. */
const MAX_ERROS_SEGUIDOS = 5;

/** Uma página dos títulos a pagar da Omie por vencimento: [código de integração, código de barras, código na Omie, CPF/CNPJ, vencimento dd/mm/aaaa, valor]. */
export async function listarTitulosOmie(ch: Chaves, emp: EmpresaOmie, de: string, ate: string, pagina: number) {
  type Mov = { detalhes?: { cCodIntTitulo?: string; cCodigoBarras?: string; nCodTitulo?: number; cCPFCNPJCliente?: string; dDtVenc?: string; nValorTitulo?: number } };
  try {
    const r = await chamar(ch, emp, "financas/mf/", "ListarMovimentos", { nPagina: pagina, nRegPorPagina: 100, dDtVencDe: de, dDtVencAte: ate, cNatureza: "P" });
    const titulos = ((r.movimentos as Mov[] | undefined) ?? []).map((m) => [m.detalhes?.cCodIntTitulo ?? "", String(m.detalhes?.cCodigoBarras ?? "").trim(), String(m.detalhes?.nCodTitulo ?? ""), String(m.detalhes?.cCPFCNPJCliente ?? "").replace(/\D/g, ""), m.detalhes?.dDtVenc ?? "", Number(m.detalhes?.nValorTitulo ?? 0)] as const);
    return { paginas: Number(r.nTotPaginas ?? 1), titulos };
  } catch (e) {
    if (e instanceof OmieErro && semRegistros(e.message)) return { paginas: 1, titulos: [] };
    throw e;
  }
}

/** Títulos em aberto pela lista oficial de contas a pagar (ListarContasPagar), que informa o total e ordena por código. Só leitura. */
export async function listarContasPorStatus(ch: Chaves, emp: EmpresaOmie, status: "AVENCER" | "VENCEHOJE", pagina: number) {
  type Conta = {
    codigo_lancamento_omie?: number;
    codigo_lancamento_integracao?: string;
    codigo_barras_ficha_compensacao?: string;
    cnab_integracao_bancaria?: { codigo_barras_boleto?: string };
    codigo_cliente_fornecedor?: number;
    codigo_categoria?: string;
    data_vencimento?: string;
    valor_documento?: number;
    distribuicao?: { cCodDep?: string; nValDep?: number }[];
    numero_parcela?: string;
    numero_documento?: string;
    numero_documento_fiscal?: string;
    status_titulo?: string;
    id_origem?: string;
    info?: { dInc?: string; uInc?: string };
  };
  try {
    const r = await chamar(ch, emp, "financas/contapagar/", "ListarContasPagar", { pagina, registros_por_pagina: 500, filtrar_por_status: status, ordenar_por: "CODIGO" });
    const titulos = ((r.conta_pagar_cadastro as Conta[] | undefined) ?? []).map((c) => ({
      id: String(c.codigo_lancamento_omie ?? ""),
      codigo: c.codigo_lancamento_integracao ?? "",
      barra: String(c.codigo_barras_ficha_compensacao || c.cnab_integracao_bancaria?.codigo_barras_boleto || "").trim(),
      cliente: String(c.codigo_cliente_fornecedor ?? ""),
      categoria: c.codigo_categoria ?? "",
      venc: c.data_vencimento ?? "",
      valor: Number(c.valor_documento ?? 0),
      dep: (c.distribuicao ?? []).map((x) => x.cCodDep ?? "").join(","),
      parcela: c.numero_parcela ?? "",
      numDoc: c.numero_documento_fiscal ?? "",
      numTitulo: c.numero_documento ?? "",
      status: c.status_titulo ?? "",
      origem: c.id_origem ?? "",
      incluido: c.info?.dInc ?? "",
    }));
    return { paginas: Number(r.total_de_paginas ?? 1), total: Number(r.total_de_registros ?? 0), titulos };
  } catch (e) {
    if (e instanceof OmieErro && semRegistros(e.message)) return { paginas: 1, total: 0, titulos: [] };
    throw e;
  }
}

/** Para procurar duplicados: cada título com departamento (filial), parcela, documento, situação e série de repetição. Só leitura. */
export async function listarTitulosDetalhados(ch: Chaves, emp: EmpresaOmie, de: string, ate: string, pagina: number) {
  type Mov = {
    departamentos?: { cCodDepartamento?: string }[];
    detalhes?: { cCodIntTitulo?: string; cCodigoBarras?: string; nCodTitulo?: number; cCPFCNPJCliente?: string; dDtVenc?: string; nValorTitulo?: number; cNumParcela?: string; cNumDocFiscal?: string; cNumTitulo?: string; cStatus?: string; cOrigem?: string; nCodTitRepet?: number; nCodCliente?: number; dDtRegistro?: string };
  };
  try {
    const r = await chamar(ch, emp, "financas/mf/", "ListarMovimentos", { nPagina: pagina, nRegPorPagina: 100, dDtVencDe: de, dDtVencAte: ate, cNatureza: "P", cExibirDepartamentos: "S" });
    const titulos = ((r.movimentos as Mov[] | undefined) ?? []).map((m) => {
      const d = m.detalhes;
      return {
        id: String(d?.nCodTitulo ?? ""),
        codigo: d?.cCodIntTitulo ?? "",
        barra: String(d?.cCodigoBarras ?? "").trim(),
        doc: String(d?.cCPFCNPJCliente ?? "").replace(/\D/g, ""),
        venc: d?.dDtVenc ?? "",
        valor: Number(d?.nValorTitulo ?? 0),
        dep: (m.departamentos ?? []).map((x) => x.cCodDepartamento ?? "").join(","),
        parcela: d?.cNumParcela ?? "",
        numDoc: d?.cNumDocFiscal ?? "",
        numTitulo: d?.cNumTitulo ?? "",
        status: d?.cStatus ?? "",
        origem: d?.cOrigem ?? "",
        repet: String(d?.nCodTitRepet ?? ""),
        cliente: String(d?.nCodCliente ?? ""),
        registro: d?.dDtRegistro ?? "",
      };
    });
    return { paginas: Number(r.nTotPaginas ?? 1), titulos };
  } catch (e) {
    if (e instanceof OmieErro && semRegistros(e.message)) return { paginas: 1, titulos: [] };
    throw e;
  }
}

/** Lança contas a pagar de UMA empresa (UpsertContaPagar), uma a uma, sem atropelar o limite da Omie. */
export async function lancarContas(
  ch: Chaves,
  emp: EmpresaOmie,
  cache: CacheOmie,
  contas: ContaApi[],
  cadastrarFornecedor: boolean,
  prazo = Infinity,
  /** Chamado logo depois que o Omie aceita cada conta (para registrar na hora o que já subiu). */
  aoLancar?: (r: ResultadoLancamento) => Promise<void>,
): Promise<ResultadoLancamento[]> {
  if (!cache.conta?.id || !cache.categoria?.codigo) {
    throw new OmieErro(`Antes de lançar na ${EMPRESAS_OMIE[emp]}, busque os cadastros na Omie (conta corrente e categoria não foram encontradas).`);
  }
  const fornecedores = new Map<string, number>();
  const resultados: ResultadoLancamento[] = [];
  let seguidos = 0;
  let parou = "";
  for (const c of contas) {
    const r: ResultadoLancamento = { chave: c.chave, ok: false };
    if (parou) {
      r.erro = parou;
      r.adiada = r.parada = true;
      resultados.push(r);
      continue;
    }
    if (Date.now() > prazo) {
      r.erro = "não deu tempo nesta leva. Recarregue a página e lance de novo: as já lançadas ficaram marcadas como enviadas.";
      r.adiada = true;
      resultados.push(r);
      continue;
    }
    try {
      let dep = cache.departamentos[c.departamento] ?? null;
      if (!dep && c.departamentoFixo) {
        const prefixo = /^(F?\d{1,3}|TRIO)\b/i.exec(c.departamento.trim());
        const x = cache.todos.find((d) => normOmie(d.descricao) === normOmie(c.departamento)) ?? (prefixo ? departamentoPorPrefixo(cache.todos, prefixo[1]) : null);
        if (!x) throw new OmieErro(`o departamento “${c.departamento}” (regra automática) não foi achado na Omie da ${EMPRESAS_OMIE[emp]}; confira o nome na regra.`);
        dep = { codigo: x.codigo, nome: x.descricao };
      }
      let codigoCategoria = cache.categoria.codigo;
      if (c.categoria) {
        const nome = c.categoria;
        const cat = cache.categorias?.find((x) => normOmie(x.nome) === normOmie(nome));
        if (!cat)
          throw new OmieErro(
            cache.categorias
              ? `a categoria “${nome}” (regra automática) não existe na Omie da ${EMPRESAS_OMIE[emp]}; confira o nome na regra.`
              : `busque os cadastros na Omie da ${EMPRESAS_OMIE[emp]} de novo (DDA x Trier → Omie) para o sistema conhecer as categorias das regras automáticas.`,
          );
        codigoCategoria = cat.codigo;
      }
      if (!dep && c.fil != null) {
        const x = departamentoPorPrefixo(cache.todos, String(c.fil));
        if (x) dep = { codigo: x.codigo, nome: x.descricao };
      }
      if (!dep) throw new OmieErro(`departamento da filial ${c.fil ?? "?"} não foi achado na Omie da ${EMPRESAS_OMIE[emp]} (cadastre lá e busque os cadastros de novo).`);
      const codigoFornec = await codigoFornecedor(ch, emp, c.cnpj, c.nome, cadastrarFornecedor, fornecedores);
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(c.venc)) throw new OmieErro("vencimento inválido.");
      const valor = Math.round(c.valor * 100) / 100;
      if (valor <= 0) throw new OmieErro("valor zerado ou negativo.");
      if (!c.codigo) throw new OmieErro("conta sem código de integração.");
      const p: Record<string, unknown> = {
        codigo_lancamento_integracao: c.codigo.slice(0, 20),
        codigo_cliente_fornecedor: codigoFornec,
        data_vencimento: c.venc,
        data_previsao: c.venc,
        data_emissao: c.emissao ?? c.venc,
        data_entrada: c.emissao ?? c.venc,
        valor_documento: valor,
        codigo_categoria: codigoCategoria,
        id_conta_corrente: cache.conta.id,
        numero_documento: c.numdoc.slice(0, 20),
        observacao: c.obs.slice(0, 2000),
        distribuicao: [{ cCodDep: dep.codigo, nPerDep: 100, nValDep: valor }],
      };
      if (c.nota) p.numero_documento_fiscal = c.nota.slice(0, 20);
      if (/^\d{44,48}$/.test(c.barra)) {
        p.codigo_barras_ficha_compensacao = c.barra; // aba "Diversos"
        // aba "Integração Bancária e CNAB": forma de pagamento "Pagamento de Boleto" + código de barras (vai na remessa ao banco)
        p.cnab_integracao_bancaria = { codigo_forma_pagamento: "BOL", codigo_barras_boleto: c.barra };
      }
      const x = await chamar(ch, emp, "financas/contapagar/", "UpsertContaPagar", p);
      if (x.codigo_status !== undefined && String(x.codigo_status) !== "0") throw new OmieErro(String(x.descricao_status ?? "recusado"));
      r.ok = true;
      r.codigoOmie = x.codigo_lancamento_omie != null ? String(x.codigo_lancamento_omie) : null;
      r.msg = String(x.descricao_status ?? "");
    } catch (e) {
      r.erro = e instanceof Error ? e.message : String(e);
    }
    if (r.ok && aoLancar) {
      try {
        await aoLancar(r);
      } catch (e) {
        // a conta JÁ está no Omie: não vira erro (não pode ser relançada como nova); só avisa que o registro falhou
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[omie] registro do envio:", r.chave, msg);
        r.msg = `${r.msg ? `${r.msg} · ` : ""}lançada no Omie, mas o registro no sistema falhou: ${msg}`;
      }
    }
    seguidos = r.ok ? 0 : seguidos + 1;
    if (r.erro && /bloqueada/i.test(r.erro)) parou = r.erro;
    else if (seguidos >= MAX_ERROS_SEGUIDOS) parou = `${MAX_ERROS_SEGUIDOS} erros seguidos (o último: ${r.erro})`;
    resultados.push(r);
    await dormir(300);
  }
  return resultados;
}

// ---------- contas a receber (sangrias) ----------

/** Departamentos ativos da empresa (para achar o da filial pelo código). Só leitura. */
export async function listarDepartamentosOmie(ch: Chaves, emp: EmpresaOmie, incluirInativos = false): Promise<Departamento[]> {
  type Dep = { codigo: string | number; descricao: string; inativo?: string };
  return (await todas<Dep>(ch, emp, "geral/departamentos/", "ListarDepartamentos", {}, "departamentos"))
    .filter((d) => incluirInativos || d.inativo !== "S")
    .map((d) => ({ codigo: String(d.codigo), descricao: String(d.descricao ?? "") }));
}

/** Contas a receber de um cliente registradas no período (dd/mm/aaaa), de qualquer situação. Só leitura. */
export async function listarContasReceberDoCliente(ch: Chaves, emp: EmpresaOmie, cliente: number, registroDe: string, registroAte: string) {
  type Cr = {
    codigo_lancamento_omie: number;
    codigo_lancamento_integracao?: string;
    data_vencimento: string;
    valor_documento: number;
    status_titulo?: string;
    distribuicao?: { cCodDep?: string }[];
  };
  const lista = await todas<Cr>(
    ch,
    emp,
    "financas/contareceber/",
    "ListarContasReceber",
    { apenas_importado_api: "N", filtrar_cliente: cliente, filtrar_por_registro_de: registroDe, filtrar_por_registro_ate: registroAte },
    "conta_receber_cadastro",
  );
  return lista.map((c) => ({
    codigo: String(c.codigo_lancamento_omie),
    integracao: String(c.codigo_lancamento_integracao ?? ""),
    vencimento: String(c.data_vencimento ?? ""),
    valor: Number(c.valor_documento),
    departamento: String(c.distribuicao?.[0]?.cCodDep ?? ""),
    status: String(c.status_titulo ?? ""),
  }));
}

/** Uma conta a receber (pelo código do Omie), para conferir antes de ligar uma sangria a ela. Só leitura. */
export async function consultarContaReceber(ch: Chaves, emp: EmpresaOmie, codigo: number) {
  const r = await chamar(ch, emp, "financas/contareceber/", "ConsultarContaReceber", { codigo_lancamento_omie: codigo });
  const dist = (r.distribuicao as { cCodDep?: string }[] | undefined) ?? [];
  return {
    codigo: String(r.codigo_lancamento_omie ?? codigo),
    cliente: Number(r.codigo_cliente_fornecedor),
    vencimento: String(r.data_vencimento ?? ""),
    valor: Number(r.valor_documento),
    departamento: String(dist[0]?.cCodDep ?? ""),
    status: String(r.status_titulo ?? ""),
  };
}

/** Grava a conta a receber (UpsertContaReceber: o mesmo código de integração atualiza em vez de criar outra). */
export async function gravarContaReceber(ch: Chaves, emp: EmpresaOmie, lancamento: Record<string, unknown>) {
  const x = await chamar(ch, emp, "financas/contareceber/", "UpsertContaReceber", lancamento);
  if (x.codigo_status !== undefined && String(x.codigo_status) !== "0") throw new OmieErro(String(x.descricao_status ?? "recusado pela Omie"));
  if (x.codigo_lancamento_omie == null) throw new OmieErro("a Omie não devolveu o código do lançamento");
  return String(x.codigo_lancamento_omie);
}

/** Conta a pagar como está na Omie, só o que a correção de valor confere e precisa. Só leitura. */
export async function consultarContaPagar(ch: Chaves, emp: EmpresaOmie, codigo: number) {
  const r = await chamar(ch, emp, "financas/contapagar/", "ConsultarContaPagar", { codigo_lancamento_omie: codigo });
  return {
    codigo: Number(r.codigo_lancamento_omie ?? codigo),
    valor: Number(r.valor_documento),
    status: String(r.status_titulo ?? ""),
    barra: String(r.codigo_barras_ficha_compensacao ?? (r.cnab_integracao_bancaria as { codigo_barras_boleto?: string } | undefined)?.codigo_barras_boleto ?? ""),
    observacao: String(r.observacao ?? ""),
    categorias: ((r.categorias as { codigo_categoria?: string; percentual?: number }[] | undefined) ?? []).map((c) => ({ codigo: String(c.codigo_categoria ?? ""), percentual: Number(c.percentual ?? 0) })),
    categoria: String(r.codigo_categoria ?? ""),
    distribuicao: ((r.distribuicao as { cCodDep?: string; nPerDep?: number }[] | undefined) ?? []).map((d) => ({ codigo: String(d.cCodDep ?? ""), percentual: Number(d.nPerDep ?? 0) })),
  };
}

/** Altera o valor de uma conta a pagar de categoria e departamento únicos (os rateios acompanham o valor) e a observação. */
export async function alterarValorContaPagar(ch: Chaves, emp: EmpresaOmie, codigo: number, categoria: string, departamento: string, valor: number, observacao: string) {
  const v = Math.round(valor * 100) / 100;
  return chamar(ch, emp, "financas/contapagar/", "AlterarContaPagar", {
    codigo_lancamento_omie: codigo,
    valor_documento: v,
    categorias: [{ codigo_categoria: categoria, percentual: 100, valor: v }],
    distribuicao: [{ cCodDep: departamento, nPerDep: 100, nValDep: v }],
    observacao: observacao.slice(0, 2000),
  });
}
