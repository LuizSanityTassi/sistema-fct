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

export type ResultadoLancamento = { chave: string; ok: boolean; codigoOmie?: string | null; msg?: string; erro?: string };

/** Lança contas a pagar de UMA empresa (UpsertContaPagar), uma a uma, sem atropelar o limite da Omie. */
export async function lancarContas(ch: Chaves, emp: EmpresaOmie, cache: CacheOmie, contas: ContaApi[], cadastrarFornecedor: boolean, prazo = Infinity): Promise<ResultadoLancamento[]> {
  if (!cache.conta?.id || !cache.categoria?.codigo) {
    throw new OmieErro(`Antes de lançar na ${EMPRESAS_OMIE[emp]}, busque os cadastros na Omie (conta corrente e categoria não foram encontradas).`);
  }
  const fornecedores = new Map<string, number>();
  const resultados: ResultadoLancamento[] = [];
  for (const c of contas) {
    const r: ResultadoLancamento = { chave: c.chave, ok: false };
    if (Date.now() > prazo) {
      r.erro = "não deu tempo nesta leva. Recarregue a página e lance de novo: as já lançadas ficaram marcadas como enviadas.";
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
              : `busque os cadastros na Omie da ${EMPRESAS_OMIE[emp]} de novo (Conciliação → Omie) para o sistema conhecer as categorias das regras automáticas.`,
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
        data_emissao: c.venc,
        data_entrada: c.venc,
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
    resultados.push(r);
    await dormir(300);
  }
  return resultados;
}
