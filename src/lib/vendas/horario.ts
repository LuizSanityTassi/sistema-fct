// Venda por horário (Trier Rel_0212, pedido do Luiz 25/11/2026, para a IA responder "quanto a F011 vendeu das 7h às 8h").
// A tela do Trier exige a filial: o robô de hoje (a cada 10 minutos) busca uma filial por vez, com o tempo que sobra da
// rodada, e guarda o Excel de cada filial e dia em vendas_hora_coletas (o mais novo substitui). O dia de hoje volta a ser
// buscado em cada filial a cada ~25 minutos; o dia de ontem, uma vez completo. Cada Excel é lido na hora para
// vendas_hora_dia (uma linha por filial, dia e hora com venda; a leitura nova troca as linhas daquele dia).
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasHorarioTrier, type PedidoHorarioTrier } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";
import { LeituraErro, lerVendasPorHorario } from "./leitores";
import { mapaFiliaisTrier, matrizDe } from "./leitura";

type Cliente = SupabaseClient<Database>;

const diaBrasil = (agora: Date, diasAtras: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora.getTime() - diasAtras * 86_400_000));
/** De quanto em quanto tempo cada filial tem o dia de hoje buscado de novo (e erro tentado de novo). */
const INTERVALO_MS = 25 * 60_000;

/** Filiais deste Trier que venderam na última semana (as que o painel de vendas já conhece). */
async function filiaisComVenda(admin: Cliente, agora: Date) {
  const { data, error } = await admin.from("vendas_filial_dia").select("branch_id").gte("data", diaBrasil(agora, 8)).lte("data", diaBrasil(agora, 1)).limit(1000);
  if (error) throw new Error(error.message);
  const comVenda = new Set((data ?? []).map((d) => d.branch_id));
  const mapa = await mapaFiliaisTrier(admin);
  return { mapa, filiais: [...mapa].filter(([, id]) => comVenda.has(id)).map(([n]) => n).sort((a, b) => a - b) };
}

/** Primeiro dia do mês passado: daí em diante o robô completa o histórico, sem pressa, depois de hoje e ontem. */
const inicioHistorico = (hoje: string) => {
  const [a, m] = hoje.split("-").map(Number);
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
};
const diaAntes = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** O que buscar nesta rodada: ontem completo (uma vez), hoje de cada filial (o mais antigo primeiro) e, com o tempo que
 * sobrar, os dias que faltam desde o começo do mês passado (do mais novo para o mais antigo). */
export async function pedidosHorario(admin: Cliente, agora = new Date()): Promise<PedidoHorarioTrier[]> {
  const hoje = diaBrasil(agora, 0);
  const ontem = diaBrasil(agora, 1);
  const inicio = inicioHistorico(hoje);
  const { filiais } = await filiaisComVenda(admin, agora);
  const data: { data: string; filial: number; parcial: boolean; status: string; coletado_em: string }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data: lote, error } = await admin.from("vendas_hora_coletas").select("data, filial, parcial, status, coletado_em").gte("data", inicio).order("data").order("filial").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    data.push(...(lote ?? []));
    if ((lote?.length ?? 0) < 1000) break;
  }
  const feito = new Map(data.map((c) => [`${c.data}|${c.filial}`, c]));
  const velho = (c: { coletado_em: string }) => Date.parse(c.coletado_em) < agora.getTime() - INTERVALO_MS;
  const ontemPend = filiais
    .filter((f) => {
      const c = feito.get(`${ontem}|${f}`);
      return !c || c.parcial || (c.status === "erro" && velho(c));
    })
    .map((filial) => ({ filial, dia: ontem }));
  const hojePend = filiais
    .filter((f) => {
      const c = feito.get(`${hoje}|${f}`);
      return !c || velho(c);
    })
    .sort((a, b) => Date.parse(feito.get(`${hoje}|${a}`)?.coletado_em ?? "1970-01-01") - Date.parse(feito.get(`${hoje}|${b}`)?.coletado_em ?? "1970-01-01"))
    .map((filial) => ({ filial, dia: hoje }));
  const historico: PedidoHorarioTrier[] = [];
  for (let dia = diaAntes(ontem); dia >= inicio; dia = diaAntes(dia)) {
    for (const filial of filiais) {
      const c = feito.get(`${dia}|${filial}`);
      if (!c || c.parcial || (c.status === "erro" && velho(c))) historico.push({ filial, dia });
    }
  }
  return [...ontemPend, ...hojePend, ...historico];
}

/**
 * Lê o Excel de uma filial e dia e troca as linhas daquele dia em vendas_hora_dia ("vazio" = dia sem venda: apaga).
 * Confere filial e dia do cabeçalho com o pedido. Devolve quantas horas gravou.
 */
async function gravarHoras(admin: Cliente, c: { data: string; filial: number; branch_id: string | null; status: string; arquivo_b64: string | null }) {
  if (!c.branch_id) throw new LeituraErro(`F${c.filial} não está cadastrada nas filiais do sistema.`);
  let linhas: Database["public"]["Tables"]["vendas_hora_dia"]["Insert"][] = [];
  if (c.status === "ok") {
    if (!c.arquivo_b64) throw new LeituraErro("o Excel desta busca não foi guardado");
    const r = lerVendasPorHorario(matrizDe(c.arquivo_b64));
    if (r.filial !== null && r.filial !== c.filial) throw new LeituraErro(`o Excel é da F${r.filial}, não da F${c.filial}`);
    if (r.dia !== null && r.dia !== c.data) throw new LeituraErro(`o Excel é de ${r.dia}, não de ${c.data}`);
    linhas = r.horas.map((h) => ({ branch_id: c.branch_id!, data: c.data, hora: h.hora, vendas: h.vendas, produtos: h.produtos, valor: h.valor }));
  }
  const apagou = await admin.from("vendas_hora_dia").delete().eq("branch_id", c.branch_id).eq("data", c.data);
  if (apagou.error) throw new Error(apagou.error.message);
  if (linhas.length) {
    const { error } = await admin.from("vendas_hora_dia").insert(linhas);
    if (error) throw new Error(error.message);
  }
  return linhas.length;
}

/** Lê e anota na coleta (lido_em e linhas, ou o erro). Não para a rodada por erro de uma filial. */
async function lerAnotando(admin: Cliente, c: Parameters<typeof gravarHoras>[1]) {
  try {
    const linhas = await gravarHoras(admin, c);
    await admin.from("vendas_hora_coletas").update({ lido_em: new Date().toISOString(), linhas, erro: null }).eq("data", c.data).eq("filial", c.filial);
    return null;
  } catch (e) {
    const erro = `leitura: ${e instanceof Error ? e.message : String(e)}`;
    await admin.from("vendas_hora_coletas").update({ lido_em: null, linhas: null, erro }).eq("data", c.data).eq("filial", c.filial);
    return erro;
  }
}

/** Coletas já guardadas e ainda não lidas (leitor novo ou erro de leitura): lê de novo o Excel guardado. */
export async function lerHorarioGuardados(admin: Cliente, limite = 120) {
  const { data, error } = await admin.from("vendas_hora_coletas").select("data, filial, branch_id, status").in("status", ["ok", "vazio"]).is("lido_em", null).order("erro", { nullsFirst: true }).order("data").limit(limite);
  if (error) throw new Error(error.message);
  let lidas = 0;
  const erros: string[] = [];
  for (const c of data ?? []) {
    let arquivo_b64: string | null = null;
    if (c.status === "ok") {
      const { data: arq } = await admin.from("vendas_hora_coletas").select("arquivo_b64").eq("data", c.data).eq("filial", c.filial).single();
      arquivo_b64 = arq?.arquivo_b64 ?? null;
    }
    const erro = await lerAnotando(admin, { ...c, arquivo_b64 });
    if (erro) erros.push(`F${c.filial} ${c.data}: ${erro}`);
    else lidas += 1;
  }
  return { lidas, erros };
}

/** Busca no Trier, guarda o Excel de cada filial e dia (substitui o anterior) e lê na hora. */
export async function coletarHorario(admin: Cliente, cred: CredenciaisTrier, pedidos: PedidoHorarioTrier[], prazoMs: number, agora = new Date()) {
  const hoje = diaBrasil(agora, 0);
  const mapa = await mapaFiliaisTrier(admin);
  let ok = 0;
  let vazios = 0;
  const erros: string[] = [];
  const r = await buscarVendasHorarioTrier(
    cred,
    pedidos,
    async (resp) => {
      const status = resp.xlsx ? "ok" : resp.semMovimento ? "vazio" : "erro";
      if (status === "ok") ok += 1;
      else if (status === "vazio") vazios += 1;
      else erros.push(`F${resp.filial} ${resp.dia}: ${resp.erro}`);
      const coleta = {
        data: resp.dia,
        filial: resp.filial,
        branch_id: mapa.get(resp.filial) ?? null,
        status,
        arquivo_b64: resp.xlsx?.toString("base64") ?? null,
      };
      const { error } = await admin.from("vendas_hora_coletas").upsert(
        {
          ...coleta,
          parcial: resp.dia >= hoje,
          erro: resp.erro ?? null,
          tamanho: resp.xlsx?.length ?? null,
          ms: resp.ms,
          coletado_em: new Date().toISOString(),
          lido_em: null,
          linhas: null,
        },
        { onConflict: "data,filial" },
      );
      if (error) erros.push(`F${resp.filial} ${resp.dia}: não gravou (${error.message})`);
      else if (status !== "erro") {
        const erro = await lerAnotando(admin, coleta);
        if (erro) erros.push(`F${resp.filial} ${resp.dia}: ${erro}`);
      }
    },
    prazoMs,
  );
  return { ok, vazios, erros, faltam: r.restantes.length, ms: r.ms };
}
