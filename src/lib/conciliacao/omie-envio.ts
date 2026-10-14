// Envio das contas conciliadas ao Omie (só servidor): monta as contas a partir dos itens gravados,
// valida (🟢/🟡/🔴), gera a planilha oficial de importação (JSZip sobre o modelo) ou lança pela API,
// registra o que foi enviado (para não mandar duas vezes) e resolve as pendências correspondentes.
import JSZip from "jszip";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/auditoria";
import type { ItemConciliacao } from "@/lib/data/conciliacao";
import type { Database, Json } from "@/lib/supabase/types";
import type { Linha } from "@/lib/tipos";
import { Motor, type TituloDDA, type TituloTrierConciliado } from "./motor";
import { Omie, type ConfigOmie, type ItemOmie, type LinhaOmie } from "./omie";
import { chavesOmie, EMPRESAS_OMIE, lancarContas, type CacheOmie, type ContaApi, type EmpresaOmie, type ResultadoLancamento } from "./omie-api";
import { OMIE_MODELO_B64 } from "./omie-modelo";
import { BUCKET_CONCILIACAO } from "./servico";

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
};

export function contaDeLinha(l: ItemConciliacao, enviado: { enviado_em: string; via: string } | undefined, pendencia: { status: string; motivo: string | null } | undefined): ContaEnvio {
  const it = itemDeLinha(l);
  const dep = Omie.departamento(Omie.filialDe(it), it.d ? it.d.pagadorCnpj || it.d.pagador : null);
  return {
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
    semDepartamento: !dep,
    empresa: Omie.empresaDe(it, dep),
    barra: l.barra,
    raiz: it.d?.raiz ?? Motor.norm(l.fornecedor),
    enviadoEm: enviado?.enviado_em ?? null,
    enviadoVia: enviado?.via ?? null,
    pendencia: pendencia ?? null,
  };
}

/** Todas as contas de uma conciliação (uma por chave), com situação de envio e pendência, para a tela "Enviar ao Omie". */
export async function contasDaConciliacao(supabase: Cliente, conciliacaoId: string, somenteChaves?: string[]): Promise<ContaEnvio[]> {
  const linhas: ItemConciliacao[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase.from("conc_itens").select("*").eq("conciliacao_id", conciliacaoId).order("vencimento").order("id").range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    linhas.push(...data);
    if (data.length < 1000) break;
  }
  const quer = somenteChaves ? new Set(somenteChaves) : null;
  const vistos = new Set<string>();
  const unicos = linhas.filter((l) => (quer && !quer.has(l.chave)) || vistos.has(l.chave) ? false : (vistos.add(l.chave), true));
  const chaves = unicos.map((l) => l.chave);
  const enviados = new Map<string, { enviado_em: string; via: string }>();
  const pendencias = new Map<string, { status: string; motivo: string | null }>();
  for (let i = 0; i < chaves.length; i += 500) {
    const lote = chaves.slice(i, i + 500);
    const [{ data: env }, { data: pend }] = await Promise.all([
      supabase.from("conc_enviados_omie").select("chave, enviado_em, via").in("chave", lote).is("desfeito_em", null),
      supabase.from("conc_pendencias").select("chave, status, motivo").in("chave", lote),
    ]);
    for (const e of env ?? []) enviados.set(e.chave, { enviado_em: e.enviado_em, via: e.via });
    for (const p of pend ?? []) pendencias.set(p.chave, { status: p.status, motivo: p.motivo });
  }
  return unicos.map((l) => contaDeLinha(l, enviados.get(l.chave), pendencias.get(l.chave)));
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
    if (c.pendencia?.status === "justificado") add(grave, c, `pendência justificada: ${c.pendencia.motivo ?? ""}`);
    if (c.barra) porBarra.set(c.barra, [...(porBarra.get(c.barra) ?? []), c]);
    const k3 = `${c.raiz}|${Math.round(c.valor * 100)}|${c.vencimento ?? ""}`;
    porTrio.set(k3, [...(porTrio.get(k3) ?? []), c]);
    if (!c.barra) add(atencao, c, "sem boleto/CNPJ correspondente (vai pelo nome do fornecedor do Trier)");
    if (CONFERIR.has(c.categoria)) add(atencao, c, `para conferir: ${Motor.ROTULO[c.categoria] ?? c.categoria}`);
  }
  for (const l of porBarra.values()) if (l.length > 1) l.forEach((c) => add(grave, c, `mesmo código de barras ${l.length}× na seleção`));
  for (const l of porTrio.values()) if (l.length > 1) l.forEach((c) => add(atencao, c, `mesmo fornecedor, valor e vencimento ${l.length}× (possível duplicidade)`));
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
) {
  if (!itens.length) return;
  const agora = new Date().toISOString();
  const linhas = itens.map(({ linha, item, empresa, codigoOmie }) => ({
    chave: linha.chave,
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
    if (error) throw new Error(`Registro de enviados: ${error.message}`);
  }
  await resolverPendencias(supabase, userId, itens.map((i) => i.linha.chave), via === "api" ? "Lançado no Omie" : "Enviado ao Omie");
}

async function resolverPendencias(supabase: Cliente, userId: string, chaves: string[], motivo: string) {
  const agora = new Date().toISOString();
  for (let i = 0; i < chaves.length; i += 500) {
    const { data } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(i, i + 500)).in("status", ["pendente", "em_analise"]);
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

export async function gerarPlanilhaOmie(supabase: Cliente, userId: string, conc: Conciliacao, chaves: string[], cfg: ConfigOmie) {
  if (!chaves.length) throw new Error("Nenhuma conta selecionada.");
  if (chaves.length > 10_000) throw new Error("O modelo do Omie aceita até 10.000 linhas por planilha.");
  const linhasItens = await itensPorChave(supabase, conc.id, chaves);
  const itens = linhasItens.map((l) => itemDeLinha(l));
  const linhas: LinhaOmie[] = Omie.montarLinhas(itens, cfg, Motor.ROTULO);
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
  await registrarAuditoria(supabase, { userId, acao: "criar", entidade: "conc_enviados_omie", registroId: arq.id, novo: { via: "planilha", conciliacao: conc.id, contas: linhas.length, total, arquivo: nome } });
  return { arquivoId: arq.id, nome, qtd: linhas.length, total };
}

// ---------- API ----------

export type ResultadoApi = {
  resultados: (ResultadoLancamento & { nome: string; valor: number })[];
  fora: { chave: string; nome: string; motivo: string }[];
  modoTeste: EmpresaOmie[];
};

export async function lancarPorApi(supabase: Cliente, userId: string, conc: Conciliacao, chaves: string[], cfg: ConfigOmie, cadastrarFornecedor: boolean): Promise<ResultadoApi> {
  if (!chaves.length) throw new Error("Nenhuma conta selecionada.");
  const linhasItens = await itensPorChave(supabase, conc.id, chaves);
  const itens = linhasItens.map((l) => itemDeLinha(l));
  const linhas = Omie.montarLinhas(itens, cfg, Motor.ROTULO);
  const { data: cfgs } = await supabase.from("conc_config").select("chave, valor").in("chave", ["omie_cache_nazario", "omie_cache_varela", "omie_nazario", "omie_varela"]);
  const cfgMap = new Map((cfgs ?? []).map((c) => [c.chave, c.valor]));
  const cache = (emp: EmpresaOmie) => cfgMap.get(`omie_cache_${emp}`) as CacheOmie | undefined;
  const testado = (emp: EmpresaOmie) => !!(cfgMap.get(`omie_${emp}`) as { testado?: boolean } | undefined)?.testado;

  const porEmpresa: Record<EmpresaOmie, { linha: ItemConciliacao; item: ItemOmie; conta: ContaApi }[]> = { nazario: [], varela: [] };
  const fora: ResultadoApi["fora"] = [];
  linhasItens.forEach((linha, i) => {
    const item = itens[i];
    const l = linhas[i];
    const d = item.d;
    const t = item.ts[0];
    const nome = d ? d.deParaFornecedor || d.nome : (t?.forn ?? "");
    const emp = Omie.empresaDe(item);
    if (!emp) return void fora.push({ chave: linha.chave, nome, motivo: "não deu para saber se é Nazário ou Varela (filial desconhecida)" });
    if (!chavesOmie(emp)) return void fora.push({ chave: linha.chave, nome, motivo: `a ${EMPRESAS_OMIE[emp]} ainda não tem chave da Omie configurada` });
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
      conta: {
        chave: linha.chave,
        codigo: l.B,
        cnpj,
        nome,
        valor: l.F,
        venc: Motor.dtxt(d ? d.venc : (t?.venc ?? null)),
        numdoc: l.U,
        nota: l.Y,
        barra: l.AB,
        obs: l.S,
        departamento: l.AX,
        fil: Omie.filialDe(item),
      },
    });
  });

  const modoTeste: EmpresaOmie[] = [];
  const resultados: ResultadoApi["resultados"] = [];
  for (const emp of ["nazario", "varela"] as EmpresaOmie[]) {
    let lista = porEmpresa[emp];
    if (!lista.length) continue;
    if (!testado(emp)) {
      modoTeste.push(emp);
      lista = lista.slice(0, 1); // 1ª conta de cada empresa é teste: a pessoa confere na Omie e libera o lote
    }
    const res = await lancarContas(emp, cache(emp)!, lista.map((x) => x.conta), cadastrarFornecedor);
    const ok = res.filter((r) => r.ok);
    await marcarEnviados(
      supabase,
      userId,
      conc,
      lista.filter((x) => ok.some((r) => r.chave === x.linha.chave)).map((x) => ({ linha: x.linha, item: x.item, empresa: emp, codigoOmie: ok.find((r) => r.chave === x.linha.chave)?.codigoOmie })),
      "api",
      null,
    );
    for (const r of res) {
      const x = lista.find((y) => y.linha.chave === r.chave)!;
      resultados.push({ ...r, nome: x.conta.nome, valor: x.conta.valor });
    }
    await registrarAuditoria(supabase, { userId, acao: "criar", entidade: "conc_enviados_omie", novo: { via: "api", empresa: emp, conciliacao: conc.id, enviadas: ok.length, erros: res.length - ok.length, teste: !testado(emp) } });
  }
  return { resultados, fora, modoTeste };
}

// ---------- envios (lotes) e desfazer ----------

export type LoteEnvio = { lote: string; quando: string; por: string | null; via: string; arquivoId: string | null; arquivo: string | null; qtd: number; valor: number; filiais: number[]; empresa: string | null };

export async function listarEnvios(supabase: Cliente, limite = 200): Promise<LoteEnvio[]> {
  const { data, error } = await supabase
    .from("conc_enviados_omie")
    .select("chave, enviado_em, via, empresa, filial, valor, arquivo_id, quem:profiles!conc_enviados_omie_enviado_por_fkey(nome), arquivo:conc_arquivos!conc_enviados_omie_arquivo_id_fkey(nome)")
    .is("desfeito_em", null)
    .order("enviado_em", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  const lotes = new Map<string, LoteEnvio>();
  for (const e of data) {
    const lote = e.arquivo_id ? `arq:${e.arquivo_id}` : `api:${e.enviado_em.slice(0, 16)}:${e.quem?.nome ?? ""}`;
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
  let consulta = supabase.from("conc_enviados_omie").select("chave, enviado_em, arquivo_id, enviado_por").is("desfeito_em", null);
  if (lote.startsWith("arq:")) consulta = consulta.eq("arquivo_id", lote.slice(4));
  else if (lote.startsWith("api:")) {
    const [, minuto] = lote.split(":");
    const ini = `${minuto}:00`;
    const fim = `${minuto}:59.999`;
    consulta = consulta.is("arquivo_id", null).gte("enviado_em", ini).lte("enviado_em", fim);
  } else throw new Error("Envio inválido.");
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Nenhuma conta encontrada nesse envio (já foi desfeito?).");
  const agora = new Date().toISOString();
  const chaves = data.map((e) => e.chave);
  for (let i = 0; i < chaves.length; i += 500) {
    const { error: eUp } = await supabase.from("conc_enviados_omie").update({ desfeito_em: agora, desfeito_por: userId, motivo_desfazer: motivo }).in("chave", chaves.slice(i, i + 500));
    if (eUp) throw new Error(eUp.message);
  }
  // pendências fechadas por esse envio voltam a ficar abertas
  for (let i = 0; i < chaves.length; i += 500) {
    const { data: pend } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(i, i + 500)).eq("status", "resolvido").in("motivo", ["Enviado ao Omie", "Lançado no Omie"]);
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
    await supabase.from("conc_pendencias").upsert(linhas, { onConflict: "chave" });
  }
  await registrarAuditoria(supabase, { userId, acao: "editar", entidade: "conc_enviados_omie", novo: { desfeito: lote, contas: chaves.length, motivo } });
  return chaves.length;
}
