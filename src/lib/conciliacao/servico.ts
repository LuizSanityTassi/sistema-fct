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
): Promise<ResultadoUpload> {
  const nome = file.name.replace(/ \(\d+\)(?=\.)/, "").slice(0, 150);
  try {
    if (file.size === 0) throw new Error("arquivo vazio");
    if (file.size > MAX_ARQUIVO) throw new Error("maior que 40 MB");
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = (nome.split(".").pop() ?? "").toLowerCase();
    if (!EXTENSOES.has(ext)) throw new Error("tipo não permitido (aceito: .RET, .pdf, .xlsx, .xls)");
    const tipo = tipoPedido === "auto" ? detectarTipo(nome, buf) : tipoPedido;
    const filiais = await mapaFiliais();

    let meta: Record<string, Json> = {};
    let filial: number | null = null;
    let descricao = "";
    if (tipo === "dda_ret" || tipo === "dda_planilha") {
      const a = lerDDA(nome, buf);
      meta = metaDDA(a);
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
      meta = metaTrier(tr);
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

export type PedidoConciliacao = { ddaIds: string[]; trierIds: string[]; filMin: number; filMax: number; titulo?: string };

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

export async function executarConciliacao(supabase: Cliente, userId: string, pedido: PedidoConciliacao): Promise<{ id: string; avisos: string[] }> {
  const inicio = Date.now();
  const avisos: string[] = [];
  const ids = [...new Set([...pedido.ddaIds, ...pedido.trierIds])];
  if (!pedido.ddaIds.length) throw new Error("Escolha pelo menos um arquivo do banco (DDA).");
  if (!pedido.trierIds.length) throw new Error("Escolha pelo menos um relatório do Trier.");
  if (!(pedido.filMin >= 1 && pedido.filMax >= pedido.filMin)) throw new Error("Faixa de filiais inválida.");

  const { data: arquivos, error } = await supabase.from("conc_arquivos").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  if (arquivos.length !== ids.length) throw new Error("Algum arquivo escolhido não foi encontrado.");
  const filiais = await mapaFiliais();

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

  const [{ data: depara }, { data: aprendido }] = await Promise.all([
    supabase.from("conc_depara").select("dda, fornecedores, alerta").eq("ativo", true),
    supabase.from("conc_aprendizado").select("fornecedor, raiz, taxas, bloqueado"),
  ]);
  const filialDeCnpj = (c: string) => {
    const d = c.replace(/\D/g, "").slice(-14);
    return filiais.porCnpj.get(d) ?? Omie.departamento(null, d)?.fil ?? null;
  };
  const res = Motor.conciliar(titulos, ddas, {
    filMin: pedido.filMin,
    filMax: pedido.filMax,
    dePara: (depara ?? []).map((e) => ({ dda: e.dda, fornecedor: e.fornecedores, alerta: e.alerta })),
    filialDeCnpj,
    aprendido: (aprendido ?? []).map((x) => ({ forn: x.fornecedor, raiz: x.raiz.trim(), taxas: x.taxas, bloqueado: x.bloqueado })),
  });

  const grupos = Omie.grupos(res);
  const linhas = (Object.keys(GRUPO) as (keyof GruposOmie)[]).flatMap((k) => grupos[k].map((it) => linhaItem(it, GRUPO[k], filiais)));
  const B = Motor.BATEU;
  const resumo: Record<string, Json> = {
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
    cobertura: { ini: isoDia(res.cobIni), fim: isoDia(res.cobFim), bancoVencIni: isoDia(res.bancoVencIni) },
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
  await registrarAuditoria(supabase, {
    userId,
    acao: "criar",
    entidade: "conc_conciliacoes",
    registroId: conc.id,
    novo: { faixa: `${pedido.filMin}-${pedido.filMax}`, arquivos: ids.length, titulos: res.qtdTrier, boletos: res.qtdDDA, pctBateu: r4(res.pctBateu), pendencias: pend },
  });
  return { id: conc.id, avisos };
}

// ---------- pendências ----------

type Pendencia = Linha<"conc_pendencias">;
type Historico = { status: string; quando: string; por: string; motivo: string }[];

async function registrarPendencias(supabase: Cliente, conciliacaoId: string, grupos: GruposOmie, filiais: Filiais) {
  const agora = new Date().toISOString();
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
  const gravar: Inserir<"conc_pendencias">[] = [];
  for (const it of itensUnicos) {
    const ex = existentes.get(it.chave);
    if (!ex) {
      novas += 1;
      gravar.push({ ...it, status: "pendente", criado_em: agora, historico: [{ status: "pendente", quando: agora, por: "sistema", motivo: "Encontrada na conciliação" }] });
      continue;
    }
    const hist = [...((ex.historico as Historico | null) ?? [])];
    let status = ex.status;
    let auto = ex.auto;
    if (ex.status === "resolvido" && ex.auto) {
      status = "pendente";
      auto = false;
      hist.push({ status: "pendente", quando: agora, por: "sistema", motivo: "Voltou a aparecer na conciliação" });
      reabertas += 1;
    }
    // decisão de alguém (resolvido/justificado à mão) continua valendo; só atualizamos os dados vistos
    gravar.push({ ...ex, ...it, status, auto, historico: hist });
  }
  for (const chave of okUnicos) {
    const ex = existentes.get(chave);
    if (!ex || (ex.status !== "pendente" && ex.status !== "em_analise")) continue;
    const hist = [...((ex.historico as Historico | null) ?? []), { status: "resolvido", quando: agora, por: "sistema", motivo: "Conciliou automaticamente" }];
    gravar.push({ ...ex, status: "resolvido", auto: true, motivo: "Conciliou automaticamente", decidido_por: null, decidido_em: agora, historico: hist, visto_em: agora, conciliacao_id: conciliacaoId });
    resolvidas += 1;
  }
  for (let i = 0; i < gravar.length; i += LOTE) {
    const { error } = await supabase.from("conc_pendencias").upsert(gravar.slice(i, i + LOTE), { onConflict: "chave" });
    if (error) throw new Error(`Pendências: ${error.message}`);
  }
  return { novas, reabertas, resolvidasAuto: resolvidas, abertasNaLeva: itensUnicos.length };
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
