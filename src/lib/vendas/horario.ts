// Venda por horário (Trier Rel_0212, pedido do Luiz 25/11/2026, para a IA responder "quanto a F011 vendeu das 7h às 8h").
// A tela do Trier exige a filial: o robô de hoje (a cada 10 minutos) busca uma filial por vez, com o tempo que sobra da
// rodada, e guarda o Excel de cada filial e dia em vendas_hora_coletas (o mais novo substitui). O dia de hoje volta a ser
// buscado em cada filial a cada ~25 minutos; o dia de ontem, uma vez completo. A leitura para venda por hora vem depois.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasHorarioTrier, type PedidoHorarioTrier } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";
import { mapaFiliaisTrier } from "./leitura";

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

/** O que buscar nesta rodada: ontem completo (uma vez) e hoje de cada filial, o mais antigo primeiro. */
export async function pedidosHorario(admin: Cliente, agora = new Date()): Promise<PedidoHorarioTrier[]> {
  const hoje = diaBrasil(agora, 0);
  const ontem = diaBrasil(agora, 1);
  const { filiais } = await filiaisComVenda(admin, agora);
  const { data, error } = await admin.from("vendas_hora_coletas").select("data, filial, parcial, status, coletado_em").in("data", [ontem, hoje]);
  if (error) throw new Error(error.message);
  const feito = new Map((data ?? []).map((c) => [`${c.data}|${c.filial}`, c]));
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
  return [...ontemPend, ...hojePend];
}

/** Busca no Trier e guarda o Excel de cada filial e dia (substitui o anterior). */
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
      const { error } = await admin.from("vendas_hora_coletas").upsert(
        {
          data: resp.dia,
          filial: resp.filial,
          branch_id: mapa.get(resp.filial) ?? null,
          parcial: resp.dia >= hoje,
          status,
          erro: resp.erro ?? null,
          arquivo_b64: resp.xlsx?.toString("base64") ?? null,
          tamanho: resp.xlsx?.length ?? null,
          ms: resp.ms,
          coletado_em: new Date().toISOString(),
          lido_em: null,
          linhas: null,
        },
        { onConflict: "data,filial" },
      );
      if (error) erros.push(`F${resp.filial} ${resp.dia}: não gravou (${error.message})`);
    },
    prazoMs,
  );
  return { ok, vazios, erros, faltam: r.restantes.length, ms: r.ms };
}
