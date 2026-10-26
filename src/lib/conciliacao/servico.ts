// Serviço da conciliação (só servidor): guarda arquivos no Storage, roda o motor e grava conciliação,
// itens, pendências e aprendizado. Usa o client com a sessão do usuário: o RLS decide quem pode.
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarAuditoria } from "@/lib/auditoria";
import { mapaFiliais } from "@/lib/data/conciliacao";
import type { Database, Json } from "@/lib/supabase/types";
import type { Inserir, Linha } from "@/lib/tipos";
import { detectarTipo, filialDoNome, lerDDA, lerTrier } from "./leitores";
import { Motor, type ArquivoDDA, type ResultadoConciliacao, type ResultadoTrier, type TituloTrier } from "./motor";
import { Omie, type GruposOmie, type ItemOmie } from "./omie";
import { aplicarDecisao, alvoDeItem, contarUso, decidirPendencia, gravarUso, motivoDaRegra, primeiraRegra, regrasAtivas, type AlvoRegra, type StatusRegra, type Uso } from "./regras";
import { PROBLEMAS, type GrupoItem, type TipoArquivoConc } from "./rotulos";

export const BUCKET_CONCILIACAO = "conciliacao";
export const MAX_ARQUIVO = 40 * 1024 * 1024;
const EXTENSOES = new Set(["ret", "txt", "pdf", "xlsx", "xls"]);
const LOTE = 500;

type Cliente = SupabaseClient<Database>;
type Filiais = Awaited<ReturnType<typeof mapaFiliais>>;

const isoDia = (n: number | null | undefined) => (n == null ? null : new Date(n * 86_400_000).toISOString().slice(0, 10));
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const soma = (l: number[]) => l.reduce((s, v) => s + v, 0);
const minMax = (l: number[]) => (l.length ? { ini: isoDia(Motor.minDe(l)), fim: isoDia(Motor.maxDe(l)) } : { ini: null, fim: null });
const dataBr = (iso: unknown) => (typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : String(iso ?? ""));

// ---------- arquivos ----------

function metaDDA(a: ArquivoDDA): Record<string, Json> {
  const vencs = a.titulos.map((t) => t.venc).filter((v): v is number => v != null);
  const { ini, fim } = minMax(vencs);
  return {
    empresa: a.empresaNome,
    cnpj: a.empresaCnpj,
    geracao: isoDia(a.geracao),
    vencIni: ini,
    vencFim: fim,
    qtd: a.titulos.length,
    total: r2(soma(a.titulos.map((t) => t.valor))),
    ignoradas: a.ignoradas ?? 0,
    lotes: a.lotes.map((l) => l.cnpj.slice(-14)),
    planilha: !!a.planilha,
  };
}

function metaTrier(tr: ResultadoTrier): Record<string, Json> {
  const vencs = tr.titulos.map((t) => t.venc).filter((v): v is number => v != null);
  const { ini, fim } = minMax(vencs);
  return {
    qtd: tr.titulos.length,
    total: r2(soma(tr.titulos.map((t) => t.valor))),
    totalGeral: tr.totalGeral,
    filiais: [...new Set(tr.titulos.map((t) => t.fil))].sort((a, b) => a - b),
    fornecedores: new Set(tr.titulos.map((t) => t.fcod)).size,
    vencIni: ini,
    vencFim: fim,
    ignoradas: tr.ignoradas.length,
  };
}

export type ResultadoUpload = { nome: string; ok: boolean; mensagem: string; id?: string; tipo?: TipoArquivoConc; repetido?: boolean };

/** Lê, valida, guarda no Storage e registra um arquivo. Arquivo igual (mesmo SHA-256) não duplica. */
export async function guardarArquivo(
  supabase: Cliente,
  userId: string | null,
  file: File,
  tipoPedido: TipoArquivoConc | "auto",
  origem: "upload" | "agente" | "robo_trier" = "upload",
  /** Para quem chama sem sessão de usuário (agente): mapa de filiais já carregado e dados extras para o meta. */
  opcoes: { filiais?: Filiais; meta?: Record<string, Json> } = {},
): Promise<ResultadoUpload> {
  const nome = file.name.replace(/ \(\d+\)(?=\.)/, "").slice(0, 150);
  try {
    if (file.size === 0) throw new Error("arquivo vazio");
    if (file.size > MAX_ARQUIVO) throw new Error("maior que 40 MB");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (nome.split(".").pop() ?? "").toLowerCase();
    if (!EXTENSOES.has(ext)) throw new Error("tipo não permitido (aceito: .RET, .pdf, .xlsx, .xls)");
    const tipo = tipoPedido === "auto" ? detectarTipo(nome, buf) : tipoPedido;
    const filiais = opcoes.filiais ?? (await mapaFiliais());

    let meta: Record<string, Json> = { ...(opcoes.meta ?? {}) };
    let filial: number | null = null;
    let descricao = "";
    if (tipo === "dda_ret" || tipo === "dda_planilha") {
      const a = lerDDA(nome, buf);
      meta = { ...meta, ...metaDDA(a) };
      if (a.planilha) filial = filialDoNome(nome, filiais.codigos);
      else {
        // .RET de UMA filial (CNPJ do lote ≠ matriz /0001) fica ligado a ela; o da matriz traz várias
        const lote = (a.lotes[0]?.cnpj ?? a.empresaCnpj).replace(/\D/g, "").slice(-14);
        const f = filiais.porCnpj.get(lote);
        filial = f !== undefined && lote.slice(8, 12) !== "0001" ? f : null;
      }
      descricao = `${meta.qtd} boleto(s), ${moeda(Number(meta.total))}${meta.vencIni ? `, vencimentos ${dataBr(meta.vencIni)} a ${dataBr(meta.vencFim)}` : ""}${a.ignoradas ? ` · ${a.ignoradas} linha(s) danificada(s) ignorada(s)` : ""}`;
    } else if (tipo === "trier") {
      const tr = await lerTrier(nome, buf);
      meta = { ...meta, ...metaTrier(tr) };
      const fils = meta.filiais as number[];
      filial = fils.length === 1 ? fils[0] : null;
      descricao = `${meta.qtd} título(s), ${moeda(Number(meta.total))}, filial(is) ${fils.join(", ")}${meta.vencIni ? `, vencimentos ${dataBr(meta.vencIni)} a ${dataBr(meta.vencFim)}` : ""}`;
    }

    const sha = createHash("sha256").update(buf).digest("hex");
    const { data: existente } = await supabase.from("conc_arquivos").select("id, vezes, arquivado_em").eq("sha256", sha).eq("tipo", tipo).maybeSingle();
    if (existente) {
      await supabase.from("conc_arquivos").update({ vezes: existente.vezes + 1 }).eq("id", existente.id);
      return { nome, ok: true, repetido: true, id: existente.id, tipo, mensagem: existente.arquivado_em ? "já estava salvo (arquivado)" : "já estava salvo — nada a fazer" };
    }

    const storagePath = `arquivos/${sha}.${ext}`;
    const { error: eUp } = await supabase.storage.from(BUCKET_CONCILIACAO).upload(storagePath, buf, { contentType: file.type || "application/octet-stream", upsert: true });
    if (eUp) throw new Error(`não consegui guardar no Storage (${eUp.message})`);
    const { data: criado, error } = await supabase
      .from("conc_arquivos")
      .insert({ tipo, nome, extensao: ext, sha256: sha, tamanho: buf.length, storage_path: storagePath, meta, filial, origem, enviado_por: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (userId) {
      await registrarAuditoria(supabase, { userId, acao: "importar", entidade: "conc_arquivos", registroId: criado.id, novo: { nome, tipo, filial, origem, qtd: meta.qtd ?? null, total: meta.total ?? null } });
    }
    return { nome, ok: true, id: criado.id, tipo, mensagem: descricao || "salvo" };
  } catch (e) {
    return { nome, ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- conciliação ----------

/** filiais: só os títulos do Trier dessas filiais (as que têm retorno do banco); sem a lista, a faixa toda. */
export type PedidoConciliacao = { ddaIds: string[]; trierIds: string[]; filMin: number; filMax: number; titulo?: string; filiais?: number[] };

const GRUPO: Record<keyof GruposOmie, GrupoItem> = { exatos: "exato", aproximados: "aproximado", soTrier: "so_trier", soDDA: "so_dda" };
const PROBLEMAS_ITEM = new Set<string>(PROBLEMAS);

function linhaItem(it: ItemOmie, grupo: GrupoItem, filiais: Filiais): Omit<Inserir<"conc_itens">, "conciliacao_id"> {
  const d = it.d;
  const t0 = it.ts[0];
  const fil = Omie.filialDe(it);
  const valorTrier = it.ts.length ? r2(soma(it.ts.map((t) => t.valor))) : null;
  const valor = d ? d.valor : (t0?.valor ?? 0);
  const taxa = t0?.m?.taxa ? t0.m.taxa / 100 : null;
  return {
    chave: Omie.chave(it),
    grupo,
    categoria: it.resultado,
    filial: fil,
    branch_id: fil != null ? (filiais.porFilial.get(fil)?.id ?? null) : null,
    fornecedor: t0?.forn ?? null,
    beneficiario: d?.nome ?? null,
    cnpj: d ? Motor.cnpjFmt(d.doc) : null,
    documento: it.ts.length ? it.ts.map((t) => t.doc).join(", ") : null,
    numdoc: d?.numdoc ?? null,
    barra: d?.barra ?? null,
    valor: r2(valor),
    valor_trier: valorTrier,
    diferenca: d && valorTrier != null && !["AGRUPADO", "COMBINACAO"].includes(it.resultado) ? r2(d.valor - valorTrier) : null,
    vencimento: isoDia(d ? d.venc : t0?.venc),
    taxa,
    desconto: d?.desconto ? { valor: d.desconto.valor, ate: isoDia(d.desconto.ate), percentual: d.desconto.percentual, noVencimento: d.desconto.noVencimento } : null,
    alerta: d?.alerta || null,
    fornecedor_real: d?.deParaFornecedor || null,
    dados: {
      trier: it.ts.map((t) => ({ doc: t.doc, fil: t.fil, forn: t.forn, emis: isoDia(t.emis), venc: isoDia(t.venc), valor: t.valor, pagar: t.pagar })),
      dda: d
        ? { arquivo: d.arquivo, mov: d.mov, emis: isoDia(d.emis), pagador: d.pagadorCnpj || d.pagador || null, tipoBoleto: d.tipoBoleto ?? null, fil: d.fil ?? null, filForte: !!d.filForte, raiz: d.raiz }
        : null,
      filTrier: t0?.fil ?? null,
    },
  };
}

function resumoPorFilial(linhas: Omit<Inserir<"conc_itens">, "conciliacao_id">[]) {
  const mapa = new Map<string, Record<string, number>>();
  for (const l of linhas) {
    const k = l.filial == null ? "—" : String(l.filial);
    const r = mapa.get(k) ?? { boletos: 0, titulos: 0, exatos: 0, conferir: 0, soTrier: 0, soDDA: 0, valorExatos: 0, valorConferir: 0, valorSoTrier: 0, valorSoDDA: 0 };
    const dados = l.dados as { trier?: unknown[] } | null;
    if (l.barra) r.boletos += 1;
    r.titulos += dados?.trier?.length ?? 0;
    const v = Number(l.valor);
    if (l.grupo === "exato") { r.exatos += 1; r.valorExatos += v; }
    else if (l.grupo === "aproximado") { r.conferir += 1; r.valorConferir += v; }
    else if (l.grupo === "so_trier") { r.soTrier += 1; r.valorSoTrier += v; }
    else { r.soDDA += 1; r.valorSoDDA += v; }
    mapa.set(k, r);
  }
  return [...mapa.entries()]
    .map(([filial, r]) => ({ filial, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r2(v)])) }))
    .sort((a, b) => (a.filial === "—" ? 1 : b.filial === "—" ? -1 : Number(a.filial) - Number(b.filial)));
}

export type ConciliacaoFeita = { id: string; avisos: string[]; pctBateu: number; pendencias: Awaited<ReturnType<typeof registrarPendencias>> };

/** userId null = rodada automática (cron, service_role): sem auditoria em nome de alguém; filiais vem já carregado. */
export async function executarConciliacao(supabase: Cliente, userId: string | null, pedido: PedidoConciliacao, opcoes: { filiais?: Filiais } = {}): Promise<ConciliacaoFeita> {
  const inicio = Date.now();
  const avisos: string[] = [];
  const ids = [...new Set([...pedido.ddaIds, ...pedido.trierIds])];
  if (!pedido.ddaIds.length) throw new Error("Escolha pelo menos um arquivo do banco (DDA).");
  if (!pedido.trierIds.length) throw new Error("Escolha pelo menos um relatório do Trier.");
  if (!(pedido.filMin >= 1 && pedido.filMax >= pedido.filMin)) throw new Error("Faixa de filiais inválida.");

  const { data: arquivos, error } = await supabase.from("conc_arquivos").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  if (arquivos.length !== ids.length) throw new Error("Algum arquivo escolhido não foi encontrado.");
  const filiais = opcoes.filiais ?? (await mapaFiliais());

  const ddas: ArquivoDDA[] = [];
  const titulos: TituloTrier[] = [];
  const filiaisTrier = new Map<number, string>();
  for (const a of arquivos) {
    const { data: blob, error: eDown } = await supabase.storage.from(BUCKET_CONCILIACAO).download(a.storage_path);
    if (eDown || !blob) throw new Error(`Não consegui ler "${a.nome}" do Storage.`);
    const buf = Buffer.from(await blob.arrayBuffer());
    if (a.tipo === "trier") {
      const tr = await lerTrier(a.nome, buf);
      for (const f of new Set(tr.titulos.map((t) => t.fil))) {
        const outro = filiaisTrier.get(f);
        if (outro && outro !== a.nome) avisos.push(`A filial ${f} aparece em "${outro}" e em "${a.nome}": os títulos foram somados. Confira se não é o mesmo relatório duas vezes.`);
        filiaisTrier.set(f, a.nome);
      }
      titulos.push(...tr.titulos);
    } else if (a.tipo === "dda_ret" || a.tipo === "dda_planilha") {
      const d = lerDDA(a.nome, buf);
      if (d.planilha) {
        d.filial = a.filial ?? filialDoNome(a.nome, filiais.codigos);
        for (const t of d.titulos) t.filialArquivo = d.filial;
        if (d.filial == null) avisos.push(`"${a.nome}": não deu para saber a filial pelo nome do arquivo; os boletos valem para qualquer filial da faixa.`);
      }
      if (d.ignoradas) avisos.push(`"${a.nome}": ${d.ignoradas} linha(s) danificada(s) ignorada(s) (arquivo baixado pela metade?).`);
      ddas.push(d);
    }
  }

  if (pedido.filiais?.length) {
    const so = new Set(pedido.filiais);
    const antes = titulos.length;
    titulos.splice(0, titulos.length, ...titulos.filter((t) => so.has(t.fil)));
    if (titulos.length < antes) avisos.push(`Só os títulos do Trier das filiais ${[...so].sort((a, b) => a - b).join(", ")} (as que têm retorno do banco).`);
  }

  const [{ data: depara }, { data: aprendido }] = await Promise.all([
    supabase.from("conc_depara").select("dda, fornecedores, alerta").eq("ativo", true),
    supabase.from("conc_aprendizado").select("fornecedor, raiz, taxas, bloqueado, confirmado, vezes"),
  ]);
  const filialDeCnpj = (c: string) => {
    const d = c.replace(/\D/g, "").slice(-14);
    return filiais.porCnpj.get(d) ?? Omie.departamento(null, d)?.fil ?? null;
  };
  // boleto de filial fora da faixa (outra empresa no mesmo arquivo, ou arquivo de outra empresa) não entra:
  // viraria "só no banco" aqui e brigaria com a conciliação da faixa certa
  let foraDaFaixa = 0;
  let boletos = 0;
  for (const d of ddas) {
    d.titulos = d.titulos.filter((t) => {
      const doc = String(t.pagadorCnpj || t.pagador || "").replace(/\D/g, "");
      const fil = t.filialArquivo ?? (doc.length >= 14 ? filialDeCnpj(doc) : null);
      const fica = fil == null || (fil >= pedido.filMin && fil <= pedido.filMax);
      if (!fica) foraDaFaixa += 1;
      return fica;
    });
    boletos += d.titulos.length;
  }
  if (!boletos) throw new Error(`Nenhum boleto do banco é das filiais ${pedido.filMin} a ${pedido.filMax}${foraDaFaixa ? ` (${foraDaFaixa} boleto(s) dos arquivos são de outras filiais)` : ""}.`);
  if (foraDaFaixa) avisos.push(`${foraDaFaixa} boleto(s) do banco são de filiais fora da faixa ${pedido.filMin}–${pedido.filMax} e ficaram de fora.`);

  const res = Motor.conciliar(titulos, ddas, {
    filMin: pedido.filMin,
    filMax: pedido.filMax,
    dePara: (depara ?? []).map((e) => ({ dda: e.dda, fornecedor: e.fornecedores, alerta: e.alerta })),
    filialDeCnpj,
    aprendido: (aprendido ?? []).map((x) => ({ forn: x.fornecedor, raiz: x.raiz.trim(), taxas: x.taxas, bloqueado: x.bloqueado })),
  });

  const grupos = Omie.grupos(res);
  const linhas = (Object.keys(GRUPO) as (keyof GruposOmie)[]).flatMap((k) => grupos[k].map((it) => linhaItem(it, GRUPO[k], filiais)));
  const anomalias = await analisarAnomalias(supabase, linhas, depara ?? [], aprendido ?? []);
  const B = Motor.BATEU;
  const resumo: Record<string, Json> = {
    anomalias: anomalias.qtd,
    anomaliasGraves: anomalias.graves,
    anomaliasLista: anomalias.lista as unknown as Json,
    qtdTrier: res.qtdTrier,
    totalTrier: r2(res.totalTrier),
    qtdDDA: res.qtdDDA,
    totalDDA: r2(res.totalDDA),
    bateu: B.reduce((s, k) => s + (res.resumo[k]?.qtd ?? 0), 0),
    valorBateu: r2(B.reduce((s, k) => s + (res.resumo[k]?.valor ?? 0), 0)),
    conferir: grupos.aproximados.length,
    soTrier: res.resumo.SO_TRIER.qtd,
    valorSoTrier: r2(res.resumo.SO_TRIER.valor),
    semArquivo: res.resumo.SEM_ARQUIVO.qtd,
    valorSemArquivo: r2(res.resumo.SEM_ARQUIVO.valor),
    soDDA: res.soDDA.length,
    valorSoDDA: r2(res.totalSoDDA),
    descontos: {
      noVencimento: { qtd: res.descontos.noVencimento.qtd, valor: r2(res.descontos.noVencimento.valor) },
      soAntecipado: { qtd: res.descontos.soAntecipado.qtd, valor: r2(res.descontos.soAntecipado.valor) },
      semData: { qtd: res.descontos.semData.qtd, valor: r2(res.descontos.semData.valor) },
    },
    porCategoria: Object.fromEntries(Object.entries(res.resumo).map(([k, v]) => [k, { qtd: v.qtd, valor: r2(v.valor) }])),
    porFilial: resumoPorFilial(linhas),
    taxas: res.taxas.map((t) => ({ fornecedor: t.fornecedor, taxas: t.taxas })),
    arquivos: arquivos.map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo })),
    cobertura: { ini: isoDia(res.cobIni), fim: isoDia(res.cobFim), bancoVencIni: isoDia(res.bancoVencIni), bancoVencFim: isoDia(res.bancoVencFim) },
    avisos,
  };

  const { data: conc, error: eConc } = await supabase
    .from("conc_conciliacoes")
    .insert({
      titulo: pedido.titulo?.trim() || null,
      criado_por: userId,
      fil_min: pedido.filMin,
      fil_max: pedido.filMax,
      arquivos: ids,
      resumo,
      qtd_trier: res.qtdTrier,
      qtd_dda: res.qtdDDA,
      total_trier: r2(res.totalTrier),
      total_dda: r2(res.totalDDA),
      total_so_dda: r2(res.totalSoDDA),
      pct_bateu: r4(res.pctBateu),
      pct_valor_bateu: r4(res.pctValorBateu),
      venc_ini: isoDia(res.vencIni),
      venc_fim: isoDia(res.vencFim),
      duracao_ms: Date.now() - inicio,
    })
    .select("id")
    .single();
  if (eConc) throw new Error(`Não consegui gravar a conciliação: ${eConc.message}`);

  let pend: Awaited<ReturnType<typeof registrarPendencias>>;
  try {
    for (let i = 0; i < linhas.length; i += LOTE) {
      const { error: eItens } = await supabase.from("conc_itens").insert(linhas.slice(i, i + LOTE).map((l) => ({ ...l, conciliacao_id: conc.id })));
      if (eItens) throw new Error(`Não consegui gravar os itens: ${eItens.message}`);
    }
    pend = await registrarPendencias(supabase, conc.id, grupos, filiais);
    await registrarAprendizado(supabase, res);
    await supabase.from("conc_conciliacoes").update({ resumo: { ...resumo, pendencias: pend }, duracao_ms: Date.now() - inicio }).eq("id", conc.id);
  } catch (e) {
    await supabase.from("conc_conciliacoes").delete().eq("id", conc.id); // nada pela metade
    throw e;
  }
  if (userId) {
    await registrarAuditoria(supabase, {
      userId,
      acao: "criar",
      entidade: "conc_conciliacoes",
      registroId: conc.id,
      novo: { faixa: `${pedido.filMin}-${pedido.filMax}`, arquivos: ids.length, titulos: res.qtdTrier, boletos: res.qtdDDA, pctBateu: r4(res.pctBateu), pendencias: pend },
    });
  }
  return { id: conc.id, avisos, pctBateu: r4(res.pctBateu), pendencias: pend };
}

// ---------- anomalias (comparando cada boleto com o histórico do fornecedor) ----------
// Mesmas regras da ferramenta anterior: valor muito/EXTREMAMENTE acima do normal, banco ou CNPJ diferente do habitual,
// fornecedor novo, fornecedor do Trier que costuma usar outro CNPJ, boleto >10% diferente do título.

type LinhaItem = Omit<Inserir<"conc_itens">, "conciliacao_id">;
type HistoricoFornecedor = { n: number; cnpjs: string[]; bancos: string[]; valores: [string, number][] };
export type ResumoAnomalia = { chave: string; beneficiario: string | null; filial: number | null; valor: number; vencimento: string | null; avisos: string[] };
const raizDe = (cnpj: string) => cnpj.replace(/\D/g, "").padStart(14, "0").slice(0, 8);
/** Anomalia que bloqueia o envio ao Omie (as outras só avisam). */
export const anomaliaGrave = (a: string) => /EXTREMAMENTE|banco diferente/.test(a);

async function analisarAnomalias(
  supabase: Cliente,
  linhas: LinhaItem[],
  dePara: { dda: string }[],
  aprendido: { fornecedor: string; raiz: string; bloqueado: boolean; confirmado: boolean; vezes: number }[],
) {
  const comBoleto = linhas.filter((l) => l.barra && l.cnpj && l.cnpj.replace(/\D/g, "").length === 14);
  const raizes = [...new Set(comBoleto.map((l) => raizDe(l.cnpj!)))];
  const hist = new Map<string, HistoricoFornecedor>();
  for (let i = 0; i < raizes.length; i += 500) {
    const { data, error } = await supabase.rpc("conc_fornecedor_historico", { p_raizes: raizes.slice(i, i + 500) });
    if (error) throw new Error(`Não consegui ler o histórico dos fornecedores: ${error.message}`);
    for (const h of data ?? []) hist.set(h.raiz, { n: Number(h.n), cnpjs: h.cnpjs ?? [], bancos: h.bancos ?? [], valores: ((h.valores as [string, number][] | null) ?? []).map(([k, v]) => [k, Number(v)]) });
  }
  const temHistorico = hist.size > 0;
  const apPorForn = new Map<string, Set<string>>();
  for (const x of aprendido) {
    if (x.bloqueado || !(x.confirmado || x.vezes >= 5)) continue;
    const k = Motor.norm(x.fornecedor);
    if (!apPorForn.has(k)) apPorForn.set(k, new Set());
    apPorForn.get(k)!.add(x.raiz.trim());
  }
  const lista: ResumoAnomalia[] = [];
  for (const l of comBoleto) {
    const av: string[] = [];
    const raiz = raizDe(l.cnpj!);
    const h = hist.get(raiz);
    const valor = Number(l.valor);
    // o próprio boleto (já visto numa rodada anterior) não conta contra si mesmo
    const vals = h ? h.valores.filter(([k]) => k !== l.chave).map(([, v]) => v).sort((a, b) => a - b) : [];
    if (temHistorico && !h) av.push("Fornecedor novo: este CNPJ nunca apareceu antes");
    let foraPadrao = false;
    // só avisa com histórico suficiente e diferença grande (evita alarme falso em fornecedor que varia muito)
    if (vals.length >= 15) {
      const med = vals[Math.floor(vals.length / 2)];
      const p90 = vals[Math.floor(0.9 * (vals.length - 1))];
      const mx = vals[vals.length - 1];
      if (valor >= 2000 && valor > Math.max(4 * p90, 8 * med, 1.5 * mx)) {
        foraPadrao = true;
        av.push(`${valor > 10 * p90 ? "Valor EXTREMAMENTE acima" : "Valor muito acima"} do histórico deste fornecedor (normal até ${moeda(p90)}, maior já visto ${moeda(mx)})`);
      }
    }
    const banco = l.barra!.slice(0, 3);
    if (h && h.bancos.length && vals.length >= 5 && !h.bancos.includes(banco)) av.push(`Boleto emitido por banco diferente do habitual (antes: ${h.bancos.join(", ")}; agora: ${banco})`);
    const cnpjNum = l.cnpj!.replace(/\D/g, "");
    if (h && h.cnpjs.length && vals.length >= 5 && !h.cnpjs.includes(cnpjNum)) av.push(`CNPJ do beneficiário novo para este fornecedor (${l.cnpj})`);
    if (l.fornecedor) {
      const viaDePara = dePara.some((e) => e.dda && Motor.norm(l.beneficiario ?? "").startsWith(Motor.norm(e.dda)));
      const rs = apPorForn.get(Motor.norm(l.fornecedor));
      if (!viaDePara && rs && rs.size && !rs.has(raiz)) av.push(`O fornecedor do Trier “${l.fornecedor}” costuma usar outro CNPJ`);
      const vt = l.valor_trier == null ? null : Number(l.valor_trier);
      if ((l.categoria === "VALOR" || l.categoria === "DOCUMENTO") && vt && Math.abs(valor - vt) / Math.abs(vt) > 0.1) av.push(`Boleto ${Math.round((100 * (valor - vt)) / vt)}% diferente do título do Trier`);
    }
    if (av.length) {
      l.dados = { ...((l.dados ?? {}) as Record<string, Json>), anomalias: av, fora_padrao: foraPadrao };
      lista.push({ chave: l.chave, beneficiario: l.beneficiario ?? null, filial: l.filial ?? null, valor, vencimento: l.vencimento ?? null, avisos: av });
    }
  }
  lista.sort((a, b) => Number(b.avisos.some(anomaliaGrave)) - Number(a.avisos.some(anomaliaGrave)) || b.valor - a.valor);
  return { qtd: lista.length, graves: lista.filter((x) => x.avisos.some(anomaliaGrave)).length, lista: lista.slice(0, 60) };
}

// ---------- pendências ----------

type Pendencia = Linha<"conc_pendencias">;
type Historico = { status: string; quando: string; por: string; motivo: string }[];

async function registrarPendencias(supabase: Cliente, conciliacaoId: string, grupos: GruposOmie, filiais: Filiais) {
  const agora = new Date().toISOString();
  const regras = await regrasAtivas(supabase);
  const alvos = new Map<string, AlvoRegra>();
  const uso: Uso = new Map();
  const itens: Omit<Inserir<"conc_pendencias">, "status">[] = [];
  const ok: string[] = [];
  for (const k of Object.keys(GRUPO) as (keyof GruposOmie)[]) {
    for (const it of grupos[k]) {
      const prob = k === "soDDA" ? "SO_DDA" : k === "soTrier" ? (it.resultado === "SO_TRIER" ? "SO_TRIER" : null) : PROBLEMAS_ITEM.has(it.resultado) ? it.resultado : null;
      const chave = Omie.chave(it);
      if (!prob) {
        if (k !== "soTrier") ok.push(chave);
        continue;
      }
      if (!alvos.has(chave)) alvos.set(chave, alvoDeItem(it, prob));
      const d = it.d;
      const t = it.ts[0];
      const venc = d ? d.venc : t?.venc;
      const somaTrier = soma(it.ts.map((x) => x.valor));
      const det =
        prob === "VALOR" && d && t
          ? `Boleto ${moeda(d.valor)} × Trier ${moeda(somaTrier)}`
          : prob === "FILIAL" && t
            ? `Título do Trier na filial ${t.fil}`
            : prob === "DATA" && d && t
              ? `Boleto vence ${Motor.dtxt(d.venc)} × Trier ${Motor.dtxt(t.venc)}`
              : d?.deParaFornecedor
                ? `Fornecedor real: ${d.deParaFornecedor}`
                : "";
      const fil = Omie.filialDe(it);
      itens.push({
        chave,
        problema: prob,
        filial: fil,
        branch_id: fil != null ? (filiais.porFilial.get(fil)?.id ?? null) : null,
        beneficiario: d ? d.nome : (t?.forn ?? null),
        cnpj: d ? Motor.cnpjFmt(d.doc) : null,
        documento: it.ts.length ? it.ts.map((x) => x.doc).join(", ") : (d?.numdoc ?? null),
        valor: r2(d ? d.valor : (t?.valor ?? 0)),
        vencimento: isoDia(venc),
        detalhe: ((d?.alerta ? `ALERTA: ${d.alerta} · ` : "") + det) || null,
        conciliacao_id: conciliacaoId,
        visto_em: agora,
      });
    }
  }

  // o mesmo boleto pode vir de dois arquivos (matriz e filial) e o mesmo título de dois relatórios: uma pendência por chave
  const porChave = new Map<string, (typeof itens)[number]>();
  for (const it of itens) if (!porChave.has(it.chave)) porChave.set(it.chave, it);
  const itensUnicos = [...porChave.values()];
  const okUnicos = [...new Set(ok)].filter((k) => !porChave.has(k));
  const chaves = [...new Set([...itensUnicos.map((i) => i.chave), ...okUnicos])];
  const existentes = new Map<string, Pendencia>();
  for (let i = 0; i < chaves.length; i += LOTE) {
    const { data, error } = await supabase.from("conc_pendencias").select("*").in("chave", chaves.slice(i, i + LOTE));
    if (error) throw new Error(error.message);
    for (const p of data) existentes.set(p.chave, p);
  }

  let novas = 0;
  let reabertas = 0;
  let resolvidas = 0;
  let porRegra = 0;
  const gravar: Inserir<"conc_pendencias">[] = [];
  for (const it of itensUnicos) {
    const ex = existentes.get(it.chave);
    const rp = primeiraRegra(regras, alvos.get(it.chave)!, "pendencia");
    if (!ex) {
      novas += 1;
      let nova: Inserir<"conc_pendencias"> = { ...it, status: "pendente", criado_em: agora, historico: [{ status: "pendente", quando: agora, por: "sistema", motivo: "Encontrada na conciliação" }] };
      if (rp) {
        nova = aplicarDecisao(nova, { status: rp.pendencia_acao as StatusRegra, regra: rp, motivo: motivoDaRegra(rp) }, agora);
        porRegra += 1;
        contarUso(uso, rp);
      }
      gravar.push(nova);
      continue;
    }
    const hist = [...((ex.historico as Historico | null) ?? [])];
    let status = ex.status;
    let auto = ex.auto;
    if (ex.status === "resolvido" && ex.auto && !ex.regra_id) {
      status = "pendente";
      auto = false;
      hist.push({ status: "pendente", quando: agora, por: "sistema", motivo: "Voltou a aparecer na conciliação" });
      reabertas += 1;
    }
    // decisão de alguém (resolvido/justificado à mão) continua valendo; só atualizamos os dados vistos.
    // Regra só trata a que está pendente ou a que ela mesma tratou (e reabre se não vale mais).
    let linha: Inserir<"conc_pendencias"> = { ...ex, ...it, status, auto, historico: hist };
    const dec = decidirPendencia({ status, auto, regra_id: ex.regra_id }, rp);
    if (dec) {
      linha = aplicarDecisao(linha, dec, agora);
      if (dec.regra) {
        porRegra += 1;
        contarUso(uso, dec.regra);
      } else reabertas += 1;
    }
    gravar.push(linha);
  }
  for (const chave of okUnicos) {
    const ex = existentes.get(chave);
    if (!ex || (ex.status !== "pendente" && ex.status !== "em_analise")) continue;
    const hist = [...((ex.historico as Historico | null) ?? []), { status: "resolvido", quando: agora, por: "sistema", motivo: "Conciliou automaticamente" }];
    gravar.push({ ...ex, status: "resolvido", auto: true, motivo: "Conciliou automaticamente", decidido_por: null, decidido_em: agora, regra_id: null, historico: hist, visto_em: agora, conciliacao_id: conciliacaoId });
    resolvidas += 1;
  }
  for (let i = 0; i < gravar.length; i += LOTE) {
    const { error } = await supabase.from("conc_pendencias").upsert(gravar.slice(i, i + LOTE), { onConflict: "chave" });
    if (error) throw new Error(`Pendências: ${error.message}`);
  }
  await gravarUso(supabase, uso);
  return { novas, reabertas, resolvidasAuto: resolvidas, abertasNaLeva: itensUnicos.length, porRegra };
}

// ---------- aprendizado (fornecedor do Trier ↔ CNPJ do boleto) ----------

async function registrarAprendizado(supabase: Cliente, res: ResultadoConciliacao) {
  if (!res.paresAprendidos.length) return;
  const fornecedores = [...new Set(res.paresAprendidos.map((p) => p.forn))];
  const existentes = new Map<string, Linha<"conc_aprendizado">>();
  for (let i = 0; i < fornecedores.length; i += LOTE) {
    const { data } = await supabase.from("conc_aprendizado").select("*").in("fornecedor", fornecedores.slice(i, i + LOTE));
    for (const x of data ?? []) existentes.set(`${x.fornecedor}|${x.raiz.trim()}`, x);
  }
  const agora = new Date().toISOString();
  const linhas = res.paresAprendidos.map((p) => {
    const ex = existentes.get(`${p.forn}|${p.raiz}`);
    return {
      fornecedor: p.forn,
      raiz: p.raiz,
      beneficiario: p.benef,
      taxas: [...new Set([...(ex?.taxas ?? []), ...p.taxas])].sort((a, b) => a - b),
      vezes: (ex?.vezes ?? 0) + p.n,
      atualizado_em: agora,
    };
  });
  const { error } = await supabase.from("conc_aprendizado").upsert(linhas, { onConflict: "fornecedor,raiz" });
  if (error) console.error("[conciliacao] aprendizado:", error.message);
}
