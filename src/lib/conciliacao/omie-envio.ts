// Envio das contas conciliadas ao Omie (só servidor): monta as contas a partir dos itens gravados,
// valida (🟢/🟡/🔴), gera a planilha oficial de importação (JSZip sobre o modelo) ou lança pela API,
// registra o que foi enviado (para não mandar duas vezes) e resolve as pendências correspondentes.
import { INICIO_OPERACAO } from "@/lib/operacao";
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/auditoria";
import type { ItemConciliacao } from "@/lib/data/conciliacao";
import type { Database, Json } from "@/lib/supabase/types";
import type { Linha } from "@/lib/tipos";
import { Motor, type TituloDDA, type TituloTrierConciliado } from "./motor";
import { Omie, type ConfigOmie, type ItemOmie, type LinhaOmie } from "./omie";
import { mapaFiliais, obterConfig } from "@/lib/data/conciliacao";
import { conferirDuplicidade, normalizarBarra, type Bloqueio, type ContaConferir } from "./duplicidade";
import { LIMITE_LANCAMENTO_API } from "./rotulos";
import { buscarCadastros, chavesOmie, EMPRESAS_OMIE, lancarContas, todosTitulosOmie, type CacheOmie, type Chaves, type ContaApi, type EmpresaOmie, type ResultadoLancamento } from "./omie-api";
import { OMIE_MODELO_B64 } from "./omie-modelo";
import { alvoDeLinha, aplicarNasLinhas, contarUso, gravarUso, regrasAtivas, regrasDaConta, regrasUsadas, type Regra, type RegrasDaConta, type Uso } from "./regras";
import { BUCKET_CONCILIACAO } from "./servico";

/** Busca na Omie conta corrente, categoria e departamentos da empresa e guarda em conc_config (omie_cache_<empresa>). */
export async function atualizarCadastrosOmie(supabase: Cliente, ch: Chaves, empresa: EmpresaOmie, sessao: { id: string; nome: string }) {
  const cfg = await obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO);
  const filiais = await mapaFiliais();
  // Nazário: nomes exatos dos departamentos (lista do financeiro); Varela: pelo código da filial (F001…)
  const pedidos = empresa === "nazario" ? Omie.DEPARTAMENTOS.map((d) => d.nome) : [...filiais.porFilial.entries()].filter(([n]) => n < 300).map(([, b]) => b.codigo);
  const cache = await buscarCadastros(ch, empresa, cfg.conta, cfg.categoria, pedidos, sessao.nome);
  const { error } = await supabase.from("conc_config").upsert({ chave: `omie_cache_${empresa}`, valor: cache as unknown as Json, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id }, { onConflict: "chave" });
  if (error) throw new Error(error.message);
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "conc_config",
    novo: { omie_cadastros: empresa, conta: cache.conta?.nome ?? null, categoria: cache.categoria?.nome ?? null, departamentos: Object.keys(cache.departamentos).length, faltando: cache.departamentosFaltando.length },
  });
  return cache;
}

type Cliente = SupabaseClient<Database>;
type Conciliacao = Linha<"conc_conciliacoes">;

const diaDe = (iso: string | null | undefined) => (iso ? Math.round(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000) : null);
const r2 = (v: number) => Math.round(v * 100) / 100;
const hojeIso = () => new Date().toISOString().slice(0, 10);

export const CONFIG_OMIE_PADRAO: ConfigOmie = { categoria: "Boletos Pagos Fornecedores", conta: "Itaú Principal" };
const CONFERIR = new Set(["VALOR_DATA", "DOCUMENTO", "DATA", "VALOR", "FILIAL"]);

// ---------- de item gravado para o formato que o helper do Omie entende ----------

type DadosItem = {
  trier?: { doc: string; fil: number; forn: string; emis: string | null; venc: string | null; valor: number; pagar: number }[];
  dda?: { arquivo?: string; mov?: string; emis?: string | null; pagador?: string | null; tipoBoleto?: string | null; fil?: number | null; filForte?: boolean; raiz?: string } | null;
  filTrier?: number | null;
  anomalias?: string[];
  fora_padrao?: boolean;
};

export function itemDeLinha(l: ItemConciliacao): ItemOmie {
  const dados = (l.dados ?? {}) as DadosItem;
  const ts: TituloTrierConciliado[] = (dados.trier ?? []).map((t, j) => ({
    doc: t.doc,
    fil: t.fil,
    fcod: "",
    forn: t.forn,
    curto: "",
    emis: diaDe(t.emis),
    venc: diaDe(t.venc),
    valor: Number(t.valor),
    pagar: Number(t.pagar ?? t.valor),
    j,
    m: null,
    resultado: l.categoria,
  }));
  let d: TituloDDA | null = null;
  if (l.barra) {
    const cnpj = (l.cnpj ?? "").replace(/\D/g, "");
    const desc = l.desconto as { valor: number; ate: string | null; percentual: number | null; noVencimento: boolean | null } | null;
    d = {
      arquivo: dados.dda?.arquivo ?? "",
      geracao: null,
      mov: dados.dda?.mov ?? "01",
      barra: l.barra,
      doc: cnpj.padStart(15, "0"),
      raiz: dados.dda?.raiz ?? cnpj.padStart(14, "0").slice(0, 8),
      tipo: cnpj.length === 11 ? "1" : "2",
      nome: l.beneficiario ?? "",
      venc: diaDe(l.vencimento),
      valor: Number(l.valor),
      numdoc: l.numdoc ?? "",
      desconto: desc ? { valor: desc.valor, ate: diaDe(desc.ate), percentual: desc.percentual, noVencimento: desc.noVencimento } : null,
      emis: diaDe(dados.dda?.emis ?? null),
      pagador: dados.dda?.pagador ?? "",
      pagadorCnpj: dados.dda?.pagador ?? undefined,
      tipoBoleto: dados.dda?.tipoBoleto ?? undefined,
      fil: l.filial,
      filForte: !!dados.dda?.filForte,
      deParaFornecedor: l.fornecedor_real ?? undefined,
      alerta: l.alerta ?? undefined,
    };
  }
  return { id: l.chave, tipo: d ? "boleto" : "trier", d, ts, resultado: l.categoria };
}

// ---------- contas para a tela ----------

export type ContaEnvio = {
  chave: string;
  grupo: string;
  categoria: string;
  filial: number | null;
  nome: string;
  fornecedor: string | null;
  cnpj: string | null;
  valor: number;
  vencimento: string | null;
  alerta: string | null;
  fornecedorReal: string | null;
  semDepartamento: boolean;
  empresa: EmpresaOmie | null;
  barra: string | null;
  raiz: string;
  enviadoEm: string | null;
  enviadoVia: string | null;
  pendencia: { status: string; motivo: string | null } | null;
  /** Avisos da detecção de anomalias (histórico do fornecedor). */
  anomalias: string[];
  /** Regras automáticas que valem para a conta (categoria e/ou departamento da Omie). */
  regras: { nomes: string; categoria: string | null; departamento: string | null } | null;
};

export function contaDeLinha(l: ItemConciliacao, enviado: { enviado_em: string; via: string } | undefined, pendencia: { status: string; motivo: string | null } | undefined, regras: Regra[] = []): ContaEnvio {
  const it = itemDeLinha(l);
  const dep = Omie.departamento(Omie.filialDe(it), it.d ? it.d.pagadorCnpj || it.d.pagador : null);
  const anomalias = Array.isArray((l.dados as DadosItem | null)?.anomalias) ? ((l.dados as DadosItem).anomalias as string[]) : [];
  const rr = regrasDaConta(regras, alvoDeLinha(l));
  const usadas = regrasUsadas(rr);
  return {
    regras: usadas.length ? { nomes: usadas.map((r) => r.nome).join(", "), categoria: rr.categoria?.categoria_omie ?? null, departamento: rr.departamento?.departamento_omie ?? null } : null,
    anomalias,
    chave: l.chave,
    grupo: l.grupo,
    categoria: l.categoria,
    filial: l.filial,
    nome: l.beneficiario ?? l.fornecedor ?? "—",
    fornecedor: l.fornecedor,
    cnpj: l.cnpj,
    valor: Number(l.valor),
    vencimento: l.vencimento,
    alerta: l.alerta,
    fornecedorReal: l.fornecedor_real,
    semDepartamento: !dep && !rr.departamento,
    empresa: Omie.empresaDe(it, dep),
    barra: l.barra,
    raiz: it.d?.raiz ?? Motor.norm(l.fornecedor),
    enviadoEm: enviado?.enviado_em ?? null,
    enviadoVia: enviado?.via ?? null,
    pendencia: pendencia ?? null,
  };
}

/** Todas as contas de uma conciliação (uma por chave), com situação de envio e pendência, para a tela "Enviar ao Omie". */
/** O que a aba do Omie mostra: as contas de um grupo que ainda não foram enviadas. */
export async function contasAEnviar(supabase: Cliente, conciliacaoId: string, grupo: string): Promise<ContaEnvio[]> {
  const ler = (inicio: number) =>
    supabase
      .from("conc_itens")
      .select("*", { count: inicio === 0 ? "exact" : undefined })
      .eq("conciliacao_id", conciliacaoId)
      .eq("grupo", grupo)
      .is("enviado_em", null)
      .gte("vencimento", INICIO_OPERACAO)
      .order("vencimento")
      .order("beneficiario")
      .order("id")
      .range(inicio, inicio + 999);
  const primeiro = await ler(0);
  if (primeiro.error) throw new Error(primeiro.error.message);
  const faltam = Math.max(0, Math.ceil((primeiro.count ?? 0) / 1000) - 1);
  const resto = await Promise.all(Array.from({ length: faltam }, (_, i) => ler((i + 1) * 1000)));
  const linhas: ItemConciliacao[] = [...primeiro.data];
  for (const r of resto) {
    if (r.error) throw new Error(r.error.message);
    linhas.push(...r.data);
  }
  const vistos = new Set<string>();
  const unicos = linhas.filter((l) => (vistos.has(l.chave) ? false : (vistos.add(l.chave), true)));
  const lotes = Array.from({ length: Math.ceil(unicos.length / 500) }, (_, i) => unicos.slice(i * 500, (i + 1) * 500).map((l) => l.chave));
  const pendencias = new Map<string, { status: string; motivo: string | null }>();
  const respostas = await Promise.all(lotes.map((lote) => supabase.from("conc_pendencias").select("chave, status, motivo").in("chave", lote)));
  for (const { data, error } of respostas) {
    if (error) throw new Error(error.message);
    for (const p of data) pendencias.set(p.chave, { status: p.status, motivo: p.motivo });
  }
  const regras = await regrasAtivas(supabase);
  return unicos.map((l) => contaDeLinha(l, undefined, pendencias.get(l.chave), regras));
}

/** As contas selecionadas, para validar e enviar. */
export async function contasDaConciliacao(supabase: Cliente, conciliacaoId: string, somenteChaves: string[]): Promise<ContaEnvio[]> {
  const unicos = await itensPorChave(supabase, conciliacaoId, somenteChaves);
  const chaves = unicos.map((l) => l.chave);
  const enviados = new Map<string, { enviado_em: string; via: string }>();
  const pendencias = new Map<string, { status: string; motivo: string | null }>();
  for (let i = 0; i < chaves.length; i += 500) {
    const lote = chaves.slice(i, i + 500);
    const [env, pend] = await Promise.all([
      supabase.from("conc_enviados_omie").select("chave, enviado_em, via").in("chave", lote).is("desfeito_em", null),
      supabase.from("conc_pendencias").select("chave, status, motivo").in("chave", lote),
    ]);
    // erro na leitura não pode virar "pode enviar" na tela
    if (env.error) throw new Error(`Não consegui conferir os envios: ${env.error.message}`);
    if (pend.error) throw new Error(`Não consegui ler as pendências: ${pend.error.message}`);
    for (const e of env.data) enviados.set(e.chave, { enviado_em: e.enviado_em, via: e.via });
    for (const p of pend.data) pendencias.set(p.chave, { status: p.status, motivo: p.motivo });
  }
  const regras = await regrasAtivas(supabase);
  return unicos.map((l) => contaDeLinha(l, enviados.get(l.chave), pendencias.get(l.chave), regras));
}

// ---------- validação ----------

export type Validacao = {
  validas: string[];
  grave: { chave: string; nome: string; filial: number | null; valor: number; vencimento: string | null; motivos: string[] }[];
  atencao: { chave: string; nome: string; filial: number | null; valor: number; vencimento: string | null; motivos: string[] }[];
  totalValidas: number;
};

export function validarEnvio(contas: ContaEnvio[], verbo: "planilha" | "api"): Validacao {
  const grave = new Map<string, string[]>();
  const atencao = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, c: ContaEnvio, txt: string) => m.set(c.chave, [...(m.get(c.chave) ?? []), txt]);
  const porBarra = new Map<string, ContaEnvio[]>();
  const porTrio = new Map<string, ContaEnvio[]>();
  for (const c of contas) {
    if (c.enviadoEm) add(grave, c, `já enviada ao Omie em ${c.enviadoEm.slice(0, 10)}`);
    if (c.semDepartamento) {
      if (verbo === "api" && c.empresa) add(atencao, c, "departamento será procurado na Omie pelo código da filial");
      else add(grave, c, "sem departamento (filial fora da lista do Omie)");
    }
    if (c.alerta) add(grave, c, `alerta: ${c.alerta}`);
    // anomalias graves (valor EXTREMAMENTE acima, banco diferente) bloqueiam; as outras só avisam
    for (const a of c.anomalias) add(/EXTREMAMENTE|banco diferente/.test(a) ? grave : atencao, c, `fora do padrão: ${a}`);
    if (c.pendencia?.status === "justificado") add(grave, c, `pendência justificada: ${c.pendencia.motivo ?? ""}`);
    if (c.barra) porBarra.set(c.barra, [...(porBarra.get(c.barra) ?? []), c]);
    const k3 = `${c.raiz}|${Math.round(c.valor * 100)}|${c.vencimento ?? ""}`;
    porTrio.set(k3, [...(porTrio.get(k3) ?? []), c]);
    // regra absoluta (auditoria 06/11/2026): conta sem boleto não sobe — quando o boleto chegasse, ele subiria de novo
    // com outro código e a mesma dívida ficaria duas vezes no Omie. Espere o boleto (DDA) ou lance à mão no Omie.
    if (!c.barra) add(grave, c, "sem boleto (código de barras): não sobe ao Omie, para não duplicar quando o boleto chegar");
    if (CONFERIR.has(c.categoria)) add(atencao, c, `para conferir: ${Motor.ROTULO[c.categoria] ?? c.categoria}`);
  }
  for (const l of porBarra.values()) if (l.length > 1) l.forEach((c) => add(grave, c, `mesmo código de barras ${l.length}× na seleção`));
  // boletos com códigos de barras diferentes não são duplicata: só avisa quando algum não tem código para comparar
  for (const l of porTrio.values()) if (l.length > 1 && l.some((c) => !c.barra)) l.forEach((c) => add(atencao, c, `mesmo fornecedor, valor e vencimento ${l.length}× (possível duplicidade)`));
  const porChave = new Map(contas.map((c) => [c.chave, c]));
  const lista = (m: Map<string, string[]>) =>
    [...m.entries()].map(([chave, motivos]) => {
      const c = porChave.get(chave)!;
      return { chave, nome: c.nome, filial: c.filial, valor: c.valor, vencimento: c.vencimento, motivos };
    });
  const validas = contas.filter((c) => !grave.has(c.chave));
  return { validas: validas.map((c) => c.chave), grave: lista(grave), atencao: lista(atencao), totalValidas: r2(validas.reduce((s, c) => s + c.valor, 0)) };
}

// ---------- carregar itens selecionados ----------

async function itensPorChave(supabase: Cliente, conciliacaoId: string, chaves: string[]) {
  const linhas: ItemConciliacao[] = [];
  for (let i = 0; i < chaves.length; i += 300) {
    const { data, error } = await supabase.from("conc_itens").select("*").eq("conciliacao_id", conciliacaoId).in("chave", chaves.slice(i, i + 300));
    if (error) throw new Error(error.message);
    linhas.push(...data);
  }
  // uma conta por chave (o mesmo boleto pode estar duas vezes se veio de dois arquivos)
  const vistos = new Set<string>();
  return linhas.filter((l) => (vistos.has(l.chave) ? false : (vistos.add(l.chave), true)));
}

const GRUPO_LEGADO: Record<string, string> = { exato: "exatos", aproximado: "aproximados", so_trier: "soTrier", so_dda: "soDDA" };

async function marcarEnviados(
  supabase: Cliente,
  userId: string,
  conc: Conciliacao,
  itens: { linha: ItemConciliacao; item: ItemOmie; empresa: EmpresaOmie | null; codigoOmie?: string | null }[],
  via: "planilha" | "api",
  arquivoId: string | null,
  agora = new Date().toISOString(),
) {
  if (!itens.length) return;
  const linhas = itens.map(({ linha, item, empresa, codigoOmie }) => ({
    chave: linha.chave,
    // o banco recusa o mesmo boleto ativo duas vezes (índice único conc_enviados_omie_barra_ativa)
    barra: linha.barra ? normalizarBarra(linha.barra) || null : null,
    enviado_em: agora,
    enviado_por: userId,
    conciliacao_id: conc.id,
    arquivo_id: arquivoId,
    via,
    empresa,
    filial: Omie.filialDe(item),
    valor: Number(linha.valor),
    vencimento: linha.vencimento,
    beneficiario: (linha.beneficiario ?? linha.fornecedor ?? "").slice(0, 80),
    grupo: GRUPO_LEGADO[linha.grupo] ?? linha.grupo,
    omie_codigo: codigoOmie ?? null,
    desfeito_em: null,
    desfeito_por: null,
    motivo_desfazer: null,
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from("conc_enviados_omie").upsert(linhas.slice(i, i + 500), { onConflict: "chave" });
    if (error) {
      if (error.code === "23505") throw new Error("Registro de enviados: este boleto já consta como enviado ao Omie por outra conta (mesmo código de barras). Nada foi duplicado no registro; confira no Omie.");
      throw new Error(`Registro de enviados: ${error.message}`);
    }
  }
  await resolverPendencias(supabase, userId, itens.map((i) => i.linha.chave), via === "api" ? "Lançado no Omie" : "Enviado ao Omie");
}

/** Boletos (código de barras) que já têm envio ativo, por qualquer chave/filial/conciliação. */
async function barrasJaEnviadas(supabase: Cliente, barras: string[]) {
  const out = new Map<string, string>();
  const unicas = [...new Set(barras.filter(Boolean))];
  for (let i = 0; i < unicas.length; i += 300) {
    const { data, error } = await supabase.from("conc_enviados_omie").select("chave, barra").in("barra", unicas.slice(i, i + 300)).is("desfeito_em", null);
    if (error) throw new Error(`Não consegui conferir os boletos já enviados: ${error.message}`);
    for (const e of data) if (e.barra) out.set(e.barra, e.chave);
  }
  return out;
}

/** Reserva as contas (pela chave e pelo boleto) antes de falar com o Omie: outro envio ao mesmo tempo não pega as mesmas. */
async function reservar(supabase: Cliente, contas: { chave: string; barra: string | null }[]) {
  const idsDe = (c: { chave: string; barra: string | null }) => [`c:${c.chave}`, ...(c.barra ? [`b:${normalizarBarra(c.barra)}`] : [])];
  const pedidos = contas.flatMap(idsDe);
  if (!pedidos.length) return { livres: new Set<string>(), ocupadas: new Set<string>(), ids: [] as string[] };
  const { data, error } = await supabase.rpc("conc_reservar_envio", { p_ids: pedidos });
  if (error) throw new Error(`Não consegui reservar as contas para o envio: ${error.message}`);
  const minhas = new Set(data ?? []);
  const livres = new Set<string>();
  const ocupadas = new Set<string>();
  const soltar: string[] = [];
  for (const c of contas) {
    const ids = idsDe(c);
    if (ids.every((id) => minhas.has(id))) livres.add(c.chave);
    else {
      ocupadas.add(c.chave);
      soltar.push(...ids.filter((id) => minhas.has(id)));
    }
  }
  if (soltar.length) await liberar(supabase, soltar);
  return { livres, ocupadas, ids: pedidos.filter((id) => minhas.has(id) && !soltar.includes(id)) };
}

async function liberar(supabase: Cliente, ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.rpc("conc_liberar_envio", { p_ids: ids });
  if (error) console.error("[omie] liberar reserva:", error.message); // vence sozinha em 15 min
}

/**
 * A mesma validação da tela (🔴), refeita no servidor: o envio não confia no que veio do navegador.
 * Devolve as chaves barradas com o motivo.
 */
async function barradasPelaValidacao(supabase: Cliente, conciliacaoId: string, chaves: string[], verbo: "planilha" | "api") {
  const contas = await contasDaConciliacao(supabase, conciliacaoId, chaves);
  const v = validarEnvio(contas, verbo);
  return new Map(v.grave.map((g) => [g.chave, g.motivos.join("; ")]));
}

async function resolverPendencias(supabase: Cliente, userId: string, chaves: string[], motivo: string) {
  const agora = new Date().toISOString();
  for (let i = 0; i < chaves.length; i += 500) {
    const { data, error: eSel } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(i, i + 500)).in("status", ["pendente", "em_analise"]);
    if (eSel) {
      console.error("[omie] pendências:", eSel.message);
      continue;
    }
    if (!data?.length) continue;
    const linhas = data.map((p) => ({
      ...p,
      status: "resolvido" as const,
      auto: true,
      motivo,
      decidido_por: userId,
      decidido_em: agora,
      historico: [...(((p.historico as { status: string; quando: string; por: string; motivo: string }[] | null) ?? [])), { status: "resolvido", quando: agora, por: "sistema", motivo }] as Json,
    }));
    const { error } = await supabase.from("conc_pendencias").upsert(linhas, { onConflict: "chave" });
    if (error) console.error("[omie] pendências:", error.message);
  }
}

// ---------- planilha ----------

/** Uma contagem por regra e conta (a mesma regra dando categoria e departamento conta uma vez). */
function usoDasRegras(lista: RegrasDaConta[]): Uso {
  const uso: Uso = new Map();
  for (const rr of lista) for (const r of regrasUsadas(rr)) contarUso(uso, r);
  return uso;
}

export async function gerarPlanilhaOmie(supabase: Cliente, userId: string, conc: Conciliacao, chaves: string[], cfg: ConfigOmie) {
  if (!chaves.length) throw new Error("Nenhuma conta selecionada.");
  if (chaves.length > 10_000) throw new Error("O modelo do Omie aceita até 10.000 linhas por planilha.");
  const enviadas = await jaEnviadas(supabase, chaves);
  // a validação da tela vale também aqui (o servidor não confia na seleção que veio do navegador)
  const barradas = await barradasPelaValidacao(supabase, conc.id, chaves.filter((c) => !enviadas.has(c)), "planilha");
  const candidatas = (await itensPorChave(supabase, conc.id, chaves)).filter((l) => !enviadas.has(l.chave) && !barradas.has(l.chave));
  // o mesmo boleto já enviado por outra chave (outra filial/conciliação) não entra
  const jaPorBarra = await barrasJaEnviadas(supabase, candidatas.map((l) => (l.barra ? normalizarBarra(l.barra) : "")));
  const semRepetir = candidatas.filter((l) => !(l.barra && jaPorBarra.has(normalizarBarra(l.barra))));
  const reserva = await reservar(supabase, semRepetir.map((l) => ({ chave: l.chave, barra: l.barra })));
  try {
    return await montarPlanilha(supabase, userId, conc, chaves, cfg, semRepetir.filter((l) => reserva.livres.has(l.chave)));
  } finally {
    await liberar(supabase, reserva.ids);
  }
}

async function montarPlanilha(supabase: Cliente, userId: string, conc: Conciliacao, chaves: string[], cfg: ConfigOmie, todasLinhas: ItemConciliacao[]) {
  const todosItens = todasLinhas.map((l) => itemDeLinha(l));
  const prontas: LinhaOmie[] = Omie.montarLinhas(todosItens, cfg, Motor.ROTULO);
  const porEmp: Record<EmpresaOmie, ContaConferir[]> = { nazario: [], varela: [] };
  const semEmpresa = new Set<string>();
  todasLinhas.forEach((linha, i) => {
    const item = todosItens[i];
    const emp = Omie.empresaDe(item);
    const t = item.ts[0];
    if (!emp) return void semEmpresa.add(linha.chave);
    porEmp[emp].push({ chave: linha.chave, codigo: prontas[i].B, barra: item.d?.barra ?? null, doc: item.d ? String(item.d.doc).replace(/\D/g, "").slice(-14) : null, venc: Motor.dtxt(item.d ? item.d.venc : (t?.venc ?? null)), valor: prontas[i].F, valorBoleto: item.d?.valor ?? null });
  });
  const livres = new Set<string>();
  for (const emp of ["nazario", "varela"] as EmpresaOmie[]) {
    if (!porEmp[emp].length) continue;
    const ch = await chavesOmie(supabase, emp);
    if (!ch) throw new Error(`Sem a chave da Omie da ${EMPRESAS_OMIE[emp]} não dá para conferir duplicidade: a planilha não foi gerada.`);
    for (const k of (await conferirComOmie(ch, emp, porEmp[emp], PRAZO_CONFERIR_PLANILHA_MS)).liberadas) livres.add(k);
  }
  const linhasItens = todasLinhas.filter((l) => livres.has(l.chave));
  const foraDaPlanilha = chaves.length - linhasItens.length;
  if (!linhasItens.length) throw new Error("Nenhuma conta foi para a planilha: todas já estão no Omie, já foram enviadas, estão sendo enviadas em outra tela, foram barradas pela validação (🔴) ou não têm empresa definida.");
  const itens = linhasItens.map((l) => itemDeLinha(l));
  const linhas: LinhaOmie[] = Omie.montarLinhas(itens, cfg, Motor.ROTULO);
  const porRegra = aplicarNasLinhas(linhas, linhasItens.map(alvoDeLinha), await regrasAtivas(supabase));
  const buffer = (await Omie.gerar(JSZip, OMIE_MODELO_B64, linhas)) as Buffer;
  const hoje = hojeIso();
  const nome = `Omie_Contas_Pagar_${conc.fil_min}-${conc.fil_max}_${hoje}.xlsx`;
  const total = r2(linhasItens.reduce((s, l) => s + Number(l.valor), 0));
  const storagePath = `omie/${conc.id}/${Date.now()}-${nome}`;
  const { error: eUp } = await supabase.storage.from(BUCKET_CONCILIACAO).upload(storagePath, buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (eUp) throw new Error(`Não consegui guardar a planilha: ${eUp.message}`);
  const sha = (await import("node:crypto")).createHash("sha256").update(buffer).digest("hex");
  const { data: arq, error } = await supabase
    .from("conc_arquivos")
    .insert({
      tipo: "omie",
      nome,
      extensao: "xlsx",
      sha256: sha,
      tamanho: buffer.length,
      storage_path: storagePath,
      meta: { linhas: linhas.length, total, filiais: `${conc.fil_min}-${conc.fil_max}`, conciliacao: conc.id, categoria: cfg.categoria, conta: cfg.conta },
      filial: null,
      origem: "sistema",
      enviado_por: userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await marcarEnviados(
    supabase,
    userId,
    conc,
    linhasItens.map((linha, i) => ({ linha, item: itens[i], empresa: Omie.empresaDe(itens[i]) })),
    "planilha",
    arq.id,
  );
  const uso = usoDasRegras(porRegra);
  await gravarUso(supabase, uso);
  await registrarAuditoria(supabase, {
    userId,
    acao: "criar",
    entidade: "conc_enviados_omie",
    registroId: arq.id,
    novo: { via: "planilha", conciliacao: conc.id, contas: linhas.length, total, arquivo: nome, porRegra: [...uso.values()].reduce((s, n) => s + n, 0) },
  });
  return { arquivoId: arq.id, nome, qtd: linhas.length, total, foraDaPlanilha };
}

// ---------- API ----------

const PRAZO_LANCAMENTO_MS = 220_000;
const PRAZO_CONFERIR_LOTE_MS = 120_000;
const PRAZO_CONFERIR_PLANILHA_MS = 200_000;

/** Contas com envio registrado e não desfeito: nunca sobem de novo, nem com "mesmo assim". */
async function jaEnviadas(supabase: Cliente, chaves: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < chaves.length; i += 500) {
    const { data, error } = await supabase.from("conc_enviados_omie").select("chave").in("chave", chaves.slice(i, i + 500)).is("desfeito_em", null);
    if (error) throw new Error(`Não consegui conferir os envios: ${error.message}`);
    for (const e of data) out.add(e.chave);
  }
  return out;
}

/** Trava contra duplicidade: confere com o que está na Omie agora. Se a consulta falhar, o erro sobe e nada é enviado. */
async function conferirComOmie(ch: Chaves, emp: EmpresaOmie, contas: ContaConferir[], limiteMs: number) {
  const isoDe = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
  // folga de 7 dias para cada lado: título lançado à mão com o vencimento ajustado (dia útil, prorrogação curta)
  // também precisa aparecer na conferência (auditoria 06/11/2026, CR-03)
  const mover = (br: string, dias: number) => {
    const d = new Date(`${isoDe(br)}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  };
  const vencs = contas.map((c) => c.venc).filter((v): v is string => !!v && /^\d{2}\/\d{2}\/\d{4}$/.test(v)).sort((a, b) => isoDe(a).localeCompare(isoDe(b)));
  const titulos = vencs.length ? await todosTitulosOmie(ch, emp, mover(vencs[0], -7), mover(vencs[vencs.length - 1], 7), limiteMs) : [];
  return conferirDuplicidade(contas, titulos);
}

/** Contas que a consulta achou na Omie: ficam como enviadas, com o código de lá, sem chamar a Omie. */
export async function marcarJaNaOmie(supabase: Cliente, userId: string, conc: Conciliacao, contas: { chave: string; codigo: string }[]) {
  const linhasItens = await itensPorChave(supabase, conc.id, contas.map((c) => c.chave));
  const codigo = new Map(contas.map((c) => [c.chave, c.codigo]));
  const itens = linhasItens.map((linha) => {
    const item = itemDeLinha(linha);
    return { linha, item, empresa: Omie.empresaDe(item), codigoOmie: codigo.get(linha.chave) ?? null };
  });
  await marcarEnviados(supabase, userId, conc, itens, "api", null);
  await registrarAuditoria(supabase, { userId, acao: "criar", entidade: "conc_enviados_omie", novo: { via: "ja_na_omie", conciliacao: conc.id, marcadas: itens.length } });
  return itens.length;
}

export type ResultadoApi = {
  resultados: (ResultadoLancamento & { nome: string; valor: number })[];
  fora: { chave: string; nome: string; motivo: string }[];
  /** Barradas pela trava contra duplicidade, sem chamar a Omie para lançar. */
  bloqueadas: Bloqueio[];
  modoTeste: EmpresaOmie[];
};

export async function lancarPorApi(supabase: Cliente, userId: string, conc: Conciliacao, chaves: string[], cfg: ConfigOmie, cadastrarFornecedor: boolean): Promise<ResultadoApi> {
  if (!chaves.length) throw new Error("Nenhuma conta selecionada.");
  if (chaves.length > LIMITE_LANCAMENTO_API) throw new Error(`Cada lote aceita até ${LIMITE_LANCAMENTO_API} contas.`);
  const bloqueadas: Bloqueio[] = [];
  const enviadas = await jaEnviadas(supabase, chaves);
  for (const chave of enviadas) bloqueadas.push({ chave, tipo: "ja_na_omie", motivo: "já foi enviada ao Omie", codigoOmie: null });
  // a validação da tela (🔴) refeita no servidor: sem boleto, alerta, pendência justificada… não sobem
  const barradas = await barradasPelaValidacao(supabase, conc.id, chaves.filter((c) => !enviadas.has(c)), "api");
  for (const [chave, motivo] of barradas) bloqueadas.push({ chave, tipo: "validacao", motivo, codigoOmie: null });
  const candidatas = (await itensPorChave(supabase, conc.id, chaves)).filter((l) => !enviadas.has(l.chave) && !barradas.has(l.chave));
  // o mesmo boleto já enviado por outra chave (outra filial/conciliação, até da outra empresa) não sobe
  const jaPorBarra = await barrasJaEnviadas(supabase, candidatas.map((l) => (l.barra ? normalizarBarra(l.barra) : "")));
  for (const l of candidatas) {
    if (l.barra && jaPorBarra.has(normalizarBarra(l.barra))) bloqueadas.push({ chave: l.chave, tipo: "ja_na_omie", motivo: "o mesmo boleto já foi enviado ao Omie por outra conta (outra filial ou conciliação)", codigoOmie: null });
  }
  const semRepetir = candidatas.filter((l) => !(l.barra && jaPorBarra.has(normalizarBarra(l.barra))));
  // reserva antes de falar com o Omie: dois envios ao mesmo tempo não pegam a mesma conta
  const reserva = await reservar(supabase, semRepetir.map((l) => ({ chave: l.chave, barra: l.barra })));
  for (const chave of reserva.ocupadas) bloqueadas.push({ chave, tipo: "em_andamento", motivo: "outro envio ao Omie com esta conta está em andamento (outra tela ou outro usuário)", codigoOmie: null });
  try {
    return await lancarReservadas(supabase, userId, conc, semRepetir.filter((l) => reserva.livres.has(l.chave)), cfg, cadastrarFornecedor, bloqueadas);
  } finally {
    await liberar(supabase, reserva.ids);
  }
}

async function lancarReservadas(supabase: Cliente, userId: string, conc: Conciliacao, linhasItens: ItemConciliacao[], cfg: ConfigOmie, cadastrarFornecedor: boolean, bloqueadas: Bloqueio[]): Promise<ResultadoApi> {
  const itens = linhasItens.map((l) => itemDeLinha(l));
  const linhas = Omie.montarLinhas(itens, cfg, Motor.ROTULO);
  const porRegra = aplicarNasLinhas(linhas, linhasItens.map(alvoDeLinha), await regrasAtivas(supabase));
  const { data: cfgs } = await supabase.from("conc_config").select("chave, valor").in("chave", ["omie_cache_nazario", "omie_cache_varela", "omie_nazario", "omie_varela"]);
  const cfgMap = new Map((cfgs ?? []).map((c) => [c.chave, c.valor]));
  const cache = (emp: EmpresaOmie) => cfgMap.get(`omie_cache_${emp}`) as CacheOmie | undefined;
  const testado = (emp: EmpresaOmie) => !!(cfgMap.get(`omie_${emp}`) as { testado?: boolean } | undefined)?.testado;
  const credOmie: Record<EmpresaOmie, Chaves | null> = { nazario: await chavesOmie(supabase, "nazario"), varela: await chavesOmie(supabase, "varela") };

  const hoje = new Date();
  // só emissão do mês atual: o contador fecha o mês anterior na Omie logo no começo do mês (outubro foi fechado em
  // 12/11/2026) e a Omie recusa lançamento com emissão em período fechado; fora disso vai a data do vencimento
  const pisoEmissao = Math.round(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1) / 86_400_000);
  const porEmpresa: Record<EmpresaOmie, { linha: ItemConciliacao; item: ItemOmie; conta: ContaApi; regras: RegrasDaConta }[]> = { nazario: [], varela: [] };
  const fora: ResultadoApi["fora"] = [];
  linhasItens.forEach((linha, i) => {
    const item = itens[i];
    const l = linhas[i];
    const d = item.d;
    const t = item.ts[0];
    const nome = d ? d.deParaFornecedor || d.nome : (t?.forn ?? "");
    const emp = Omie.empresaDe(item);
    if (!emp) return void fora.push({ chave: linha.chave, nome, motivo: "não deu para saber se é Nazário ou Varela (filial desconhecida)" });
    if (!credOmie[emp]) return void fora.push({ chave: linha.chave, nome, motivo: `a ${EMPRESAS_OMIE[emp]} ainda não tem chave da Omie configurada (Administração → Integrações)` });
    const c = cache(emp);
    if (!c?.conta || !c.categoria) return void fora.push({ chave: linha.chave, nome, motivo: `falta buscar os cadastros na Omie da ${EMPRESAS_OMIE[emp]} (conta ou categoria não achada)` });
    let cnpj = "";
    if (d) {
      const dig = String(d.doc).replace(/\D/g, "");
      cnpj = d.tipo === "1" || dig.length === 11 ? dig.slice(-11) : dig.slice(-14);
    }
    porEmpresa[emp].push({
      linha,
      item,
      regras: porRegra[i],
      conta: {
        chave: linha.chave,
        codigo: l.B,
        cnpj,
        nome,
        valor: l.F,
        venc: Motor.dtxt(d ? d.venc : (t?.venc ?? null)),
        // emissão do Trier; de mês anterior cairia em período contábil fechado, que a Omie recusa
        emissao: t?.emis != null && t.emis >= pisoEmissao && t.emis <= ((d ? d.venc : t.venc) ?? t.emis) ? Motor.dtxt(t.emis) : null,
        numdoc: l.U,
        nota: l.Y,
        barra: l.AB,
        obs: l.S,
        departamento: l.AX,
        fil: Omie.filialDe(item),
        categoria: porRegra[i].categoria ? l.D : undefined,
        departamentoFixo: !!porRegra[i].departamento,
      },
    });
  });

  const modoTeste: EmpresaOmie[] = [];
  const resultados: ResultadoApi["resultados"] = [];
  // a função da Vercel vai até 300 s: para antes, para dar tempo de marcar como enviado o que já foi lançado
  const prazo = Date.now() + PRAZO_LANCAMENTO_MS;
  for (const emp of ["nazario", "varela"] as EmpresaOmie[]) {
    let lista = porEmpresa[emp];
    if (!lista.length) continue;
    // a trava: o que já está na Omie não sobe. Sem conseguir conferir, o erro sobe e nada é lançado.
    const conferencia = await conferirComOmie(credOmie[emp]!, emp, lista.map((x) => ({ chave: x.linha.chave, codigo: x.conta.codigo, barra: x.conta.barra, doc: x.conta.cnpj, venc: x.conta.venc, valor: x.conta.valor, valorBoleto: x.item.d?.valor ?? null })), PRAZO_CONFERIR_LOTE_MS);
    bloqueadas.push(...conferencia.bloqueadas);
    const livres = new Set(conferencia.liberadas);
    lista = lista.filter((x) => livres.has(x.linha.chave));
    if (!lista.length) continue;
    if (!testado(emp)) {
      modoTeste.push(emp);
      lista = lista.slice(0, 1); // 1ª conta de cada empresa é teste: a pessoa confere na Omie e libera o lote
    }
    // cada conta é registrada como enviada logo depois que o Omie aceita (se a função cair no meio, o registro não se perde)
    const agoraLote = new Date().toISOString();
    const doLote = lista;
    const res = await lancarContas(credOmie[emp]!, emp, cache(emp)!, lista.map((x) => x.conta), cadastrarFornecedor, prazo, async (r) => {
      const x = doLote.find((y) => y.linha.chave === r.chave);
      if (x) await marcarEnviados(supabase, userId, conc, [{ linha: x.linha, item: x.item, empresa: emp, codigoOmie: r.codigoOmie }], "api", null, agoraLote);
    });
    const ok = res.filter((r) => r.ok);
    await gravarUso(supabase, usoDasRegras(lista.filter((x) => ok.some((r) => r.chave === x.linha.chave)).map((x) => x.regras)));
    for (const r of res) {
      const x = lista.find((y) => y.linha.chave === r.chave)!;
      resultados.push({ ...r, nome: x.conta.nome, valor: x.conta.valor });
    }
    await registrarAuditoria(supabase, { userId, acao: "criar", entidade: "conc_enviados_omie", novo: { via: "api", empresa: emp, conciliacao: conc.id, enviadas: ok.length, erros: res.length - ok.length, teste: !testado(emp) } });
  }
  return { resultados, fora, bloqueadas, modoTeste };
}

// ---------- envios (lotes) e desfazer ----------

export type LoteEnvio = { lote: string; quando: string; por: string | null; via: string; arquivoId: string | null; arquivo: string | null; qtd: number; valor: number; filiais: number[]; empresa: string | null };

export async function listarEnvios(supabase: Cliente, limite = 200): Promise<LoteEnvio[]> {
  // o PostgREST devolve no máximo 1000 linhas por vez: pagina (até 20 mil envios mais recentes)
  type Envio = { chave: string; enviado_em: string; via: string; empresa: string | null; filial: number | null; valor: number | null; arquivo_id: string | null; enviado_por: string | null; quem: { nome: string } | null; arquivo: { nome: string } | null };
  const data: Envio[] = [];
  for (let inicio = 0; inicio < 20_000; inicio += 1000) {
    const { data: pagina, error } = await supabase
      .from("conc_enviados_omie")
      .select("chave, enviado_em, via, empresa, filial, valor, arquivo_id, enviado_por, quem:profiles!conc_enviados_omie_enviado_por_fkey(nome), arquivo:conc_arquivos!conc_enviados_omie_arquivo_id_fkey(nome)")
      .is("desfeito_em", null)
      .order("enviado_em", { ascending: false })
      .order("chave")
      .range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    data.push(...(pagina as unknown as Envio[]));
    if (pagina.length < 1000) break;
  }
  const lotes = new Map<string, LoteEnvio>();
  for (const e of data) {
    // lote da API = mesmo minuto + mesma pessoa (pelo id, não pelo nome)
    const lote = e.arquivo_id ? `arq:${e.arquivo_id}` : `api:${e.enviado_em.slice(0, 16)}|${e.enviado_por ?? "sistema"}`;
    const g = lotes.get(lote) ?? { lote, quando: e.enviado_em, por: e.quem?.nome ?? null, via: e.via, arquivoId: e.arquivo_id, arquivo: e.arquivo?.nome ?? null, qtd: 0, valor: 0, filiais: [], empresa: e.empresa };
    g.qtd += 1;
    g.valor = r2(g.valor + Number(e.valor ?? 0));
    if (e.filial != null && !g.filiais.includes(e.filial)) g.filiais.push(e.filial);
    if (e.enviado_em > g.quando) g.quando = e.enviado_em;
    lotes.set(lote, g);
  }
  return [...lotes.values()]
    .map((g) => ({ ...g, filiais: g.filiais.sort((a, b) => a - b) }))
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, limite);
}

/** As contas voltam para "Enviar ao Omie"; nada é apagado (fica registrado quem desfez e por quê). */
export async function desfazerEnvio(supabase: Cliente, userId: string, nomeUsuario: string, lote: string, motivo: string) {
  // lote "api:AAAA-MM-DDTHH:MM|<id da pessoa>" — antes o minuto era cortado no ":" e o desfazer pegava a HORA inteira,
  // de qualquer pessoa (auditoria 06/11/2026, ME-12)
  const api = /^api:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\|([0-9a-f-]{36}|sistema)$/.exec(lote);
  const arq = /^arq:([0-9a-f-]{36})$/.exec(lote);
  if (!api && !arq) throw new Error("Envio inválido. Recarregue a página e tente de novo.");
  const data: { chave: string }[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    let consulta = supabase.from("conc_enviados_omie").select("chave").is("desfeito_em", null);
    if (arq) consulta = consulta.eq("arquivo_id", arq[1]);
    else {
      const [, minuto, quem] = api!;
      consulta = consulta.is("arquivo_id", null).gte("enviado_em", `${minuto}:00Z`).lte("enviado_em", `${minuto}:59.999Z`);
      consulta = quem === "sistema" ? consulta.is("enviado_por", null) : consulta.eq("enviado_por", quem);
    }
    const { data: pagina, error } = await consulta.order("chave").range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    data.push(...pagina);
    if (pagina.length < 1000) break;
  }
  if (!data.length) throw new Error("Nenhuma conta encontrada nesse envio (já foi desfeito?).");
  const agora = new Date().toISOString();
  const chaves = data.map((e) => e.chave);
  for (let i = 0; i < chaves.length; i += 500) {
    const { error: eUp } = await supabase.from("conc_enviados_omie").update({ desfeito_em: agora, desfeito_por: userId, motivo_desfazer: motivo }).in("chave", chaves.slice(i, i + 500));
    if (eUp) throw new Error(eUp.message);
  }
  // pendências fechadas por esse envio voltam a ficar abertas
  for (let i = 0; i < chaves.length; i += 500) {
    const { data: pend, error: ePend } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(i, i + 500)).eq("status", "resolvido").in("motivo", ["Enviado ao Omie", "Lançado no Omie"]);
    if (ePend) throw new Error(`O envio foi desfeito, mas não consegui reabrir as pendências: ${ePend.message}`);
    if (!pend?.length) continue;
    const linhas = pend.map((p) => ({
      ...p,
      status: "pendente" as const,
      auto: false,
      motivo: null,
      decidido_por: null,
      decidido_em: null,
      historico: [...(((p.historico as { status: string; quando: string; por: string; motivo: string }[] | null) ?? [])), { status: "pendente", quando: agora, por: nomeUsuario, motivo: `Envio ao Omie desfeito: ${motivo}` }] as Json,
    }));
    const { error: eUpPend } = await supabase.from("conc_pendencias").upsert(linhas, { onConflict: "chave" });
    if (eUpPend) throw new Error(`O envio foi desfeito, mas não consegui reabrir as pendências: ${eUpPend.message}`);
  }
  await registrarAuditoria(supabase, { userId, acao: "editar", entidade: "conc_enviados_omie", novo: { desfeito: lote, contas: chaves.length, motivo } });
  return chaves.length;
}
