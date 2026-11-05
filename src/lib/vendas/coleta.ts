// Coleta das vendas do Trier (só servidor): pede ao robô os relatórios de vendas e grava cada Excel em vendas_coletas
// assim que chega (se a função for interrompida, o que já veio fica salvo) e já passa pelo leitor, que troca os
// números do dia nas tabelas de vendas.
// - relatórios diários (por filial, grupos, laboratórios, vendedores, tele-entrega): um pedido por dia;
// - vendedor por grupo: o mês do dia 1 até a data (base da premiação), refeito a cada dia.
// Coleta PARCIAL = o dia de hoje, buscado a cada 10 minutos pelo robô de hoje: não conta como feita (a madrugada busca o
// dia inteiro de novo) e de cada relatório fica só a última.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasTrier, RELATORIOS_VENDAS, type PedidoVendasTrier, type RelatorioVendas } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";
import { lerColetaAnotando, mapaFiliaisTrier } from "./leitura";

type Cliente = SupabaseClient<Database>;

export const RELATORIOS_COLETA = Object.keys(RELATORIOS_VENDAS) as RelatorioVendas[];
/** Relatórios de mês: vendedores por grupo (do dia 1 até a data) e a receita da DRE (só mês fechado). */
const RELATORIOS_DE_MES: RelatorioVendas[] = ["vendedores", "receita"];
export const RELATORIOS_DIARIOS = RELATORIOS_COLETA.filter((r) => !RELATORIOS_DE_MES.includes(r));
export const ehRelatorioVendas = (v: string): v is RelatorioVendas => v in RELATORIOS_VENDAS;

/** Primeiro dia do histórico (gráfico do ano contra o ano anterior). */
export const INICIO_HISTORICO = "2025-01-01";
/** Do histórico, só o que os gráficos de meses usam (venda, atendimentos, grupos/CMV). */
const RELATORIOS_HISTORICO: RelatorioVendas[] = ["filiais", "grupos"];

export type ResultadoColetaVendas = { ok: number; vazios: number; erros: { relatorio: RelatorioVendas; de: string; ate: string; erro: string }[]; restantes: PedidoVendasTrier[]; ms: number };

export async function coletarVendas(client: Cliente, cred: CredenciaisTrier, pedidos: PedidoVendasTrier[], quem: string | null, prazoMs: number, parcial = false): Promise<ResultadoColetaVendas> {
  let ok = 0;
  let vazios = 0;
  const erros: ResultadoColetaVendas["erros"] = [];
  const filiais = await mapaFiliaisTrier(client);
  const r = await buscarVendasTrier(
    cred,
    pedidos,
    async (resp) => {
      const status = resp.xlsx ? "ok" : resp.semMovimento ? "vazio" : "erro";
      const arquivo_b64 = resp.xlsx?.toString("base64") ?? null;
      const { data, error } = await client
        .from("vendas_coletas")
        .insert({ relatorio: resp.relatorio, de: resp.de, ate: resp.ate, status, erro: resp.erro ?? null, ms: resp.ms, tamanho: resp.xlsx?.length ?? null, arquivo_b64, criado_por: quem, parcial })
        .select("id")
        .single();
      let erro = error ? `não consegui gravar: ${error.message}` : resp.erro;
      if (!erro && data && arquivo_b64) erro = (await lerColetaAnotando(client, { id: data.id, relatorio: resp.relatorio, de: resp.de, ate: resp.ate, arquivo_b64 }, filiais)).erro ?? undefined;
      if (erro) {
        erros.push({ relatorio: resp.relatorio, de: resp.de, ate: resp.ate, erro });
        return;
      }
      // parcial lida: as leituras parciais anteriores do mesmo relatório e período saem (os números já são os desta)
      if (data && parcial) await client.from("vendas_coletas").delete().eq("parcial", true).eq("relatorio", resp.relatorio).eq("de", resp.de).eq("ate", resp.ate).neq("id", data.id);
      if (status === "ok") ok++;
      else vazios++;
    },
    prazoMs,
  );
  return { ok, vazios, erros, restantes: r.restantes, ms: r.ms };
}

const diaBrasil = (agora: Date, diasAtras: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora.getTime() - diasAtras * 86_400_000));
export const ontemNoBrasil = (agora = new Date()) => diaBrasil(agora, 1);

function diasEntre(de: string, ate: string) {
  const dias: string[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) dias.push(new Date(t).toISOString().slice(0, 10));
  return dias;
}
const fimDoMes = (dia: string) => {
  const [a, m] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/** Mês inteiro (dia 1 ao último dia) de cada mês do período que já fechou até `ate`: a receita da DRE é sempre do mês todo. */
function mesesFechados(de: string, ate: string) {
  return [...new Set(diasEntre(de, ate).map((d) => d.slice(0, 7)))].map((mes) => ({ de: `${mes}-01`, ate: fimDoMes(`${mes}-01`) })).filter((m) => m.ate <= ate).reverse();
}

/** Pedidos de um período: os diários dia a dia (mais recente primeiro), o de vendedores por grupo mês a mês e a receita
 * de cada mês fechado. */
export function pedidosDoPeriodo(de: string, ate: string, relatorios: RelatorioVendas[]): PedidoVendasTrier[] {
  const dias = diasEntre(de, ate).reverse();
  const diarios = dias.flatMap((dia) => relatorios.filter((r) => !RELATORIOS_DE_MES.includes(r)).map((relatorio) => ({ relatorio, de: dia, ate: dia })));
  const meses = relatorios.includes("vendedores") ? [...new Set(dias.map((d) => d.slice(0, 7)))] : [];
  const receita = relatorios.includes("receita") ? mesesFechados(de, ate).map((m) => ({ relatorio: "receita" as const, ...m })) : [];
  return [...receita, ...meses.map((mes) => ({ relatorio: "vendedores" as const, de: `${mes}-01`, ate: fimDoMes(`${mes}-01`) < ate ? fimDoMes(`${mes}-01`) : ate })), ...diarios];
}

/** O mês que acabou de fechar (no Brasil): no dia 1º de novembro, outubro inteiro. */
export function mesAnteriorFechado(agora = new Date()) {
  const [a, m] = diaBrasil(agora, 0).split("-").map(Number);
  const inicio = m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
  return { de: inicio, ate: fimDoMes(inicio) };
}

/** Tira os pedidos que já foram buscados (ok ou sem movimento) para o mesmo relatório e período. Erro de leitura se
 * resolve lendo de novo o Excel guardado, sem buscar outra vez. A leitura parcial (dia ainda correndo) não conta. */
export async function pedidosPendentes(client: Cliente, pedidos: PedidoVendasTrier[]) {
  if (!pedidos.length) return [];
  const datas = pedidos.map((p) => p.de).sort();
  const feitos = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await client.from("vendas_coletas").select("relatorio, de, ate").in("status", ["ok", "vazio"]).eq("parcial", false).gte("de", datas[0]).lte("de", datas[datas.length - 1]).range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) feitos.add(`${c.relatorio}|${c.de}|${c.ate}`);
    if ((data?.length ?? 0) < 1000) break;
  }
  return pedidos.filter((p) => !feitos.has(`${p.relatorio}|${p.de}|${p.ate}`));
}

/** Quantos dias para trás o robô diário confere (dia que ficou sem leitura por Trier fora do ar, por exemplo). */
export const DIAS_CONFERIDOS = 7;

/**
 * Pedidos do robô diário, em ordem de prioridade: a receita do mês que fechou (para a DRE: sai no dia 1º e, se falhar,
 * tenta de novo nos dias seguintes até vir), os relatórios diários dos últimos dias que ainda não têm leitura,
 * o mês dos vendedores por grupo até ontem, o resto deste mês e do mês anterior (todos os relatórios: é a base das
 * telas e das comparações) e, no tempo que sobrar, o histórico (venda e grupos) desde INICIO_HISTORICO, do mais
 * recente para o mais antigo.
 */
export async function pedidosDoRoboVendas(admin: Cliente, agora = new Date()): Promise<PedidoVendasTrier[]> {
  const ontem = ontemNoBrasil(agora);
  const corte = diaBrasil(agora, DIAS_CONFERIDOS);
  const inicioMesAnt = (() => {
    const [a, m] = ontem.split("-").map(Number);
    return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
  })();
  const receita = await pedidosPendentes(admin, [{ relatorio: "receita", ...mesAnteriorFechado(agora) }]);
  const recentes = await pedidosPendentes(admin, pedidosDoPeriodo(corte, ontem, RELATORIOS_DIARIOS));
  const mes = await pedidosPendentes(admin, [{ relatorio: "vendedores", de: `${ontem.slice(0, 7)}-01`, ate: ontem }]);
  // (o mês corrente dos vendedores já vai acima, até ontem; a receita também)
  const semReceita = RELATORIOS_COLETA.filter((r) => r !== "receita");
  const doisMeses = corte > inicioMesAnt ? await pedidosPendentes(admin, pedidosDoPeriodo(inicioMesAnt, diaBrasil(agora, DIAS_CONFERIDOS + 1), semReceita).filter((p) => !(p.relatorio === "vendedores" && p.de === `${ontem.slice(0, 7)}-01`))) : [];
  const historico = await pedidosPendentes(admin, pedidosDoPeriodo(INICIO_HISTORICO, diaBrasil(agora, DIAS_CONFERIDOS + 1), RELATORIOS_HISTORICO));
  const vistos = new Set([...receita, ...recentes, ...mes, ...doisMeses].map((p) => `${p.relatorio}|${p.de}|${p.ate}`));
  return [...receita, ...recentes, ...mes, ...doisMeses, ...historico.filter((p) => !vistos.has(`${p.relatorio}|${p.de}|${p.ate}`))];
}

/**
 * Receita do mês que fechou, para o robô de 10 em 10 minutos: só se ainda não foi guardada e se não houve tentativa na
 * última hora (um erro no Trier não vira um pedido a cada 10 minutos).
 */
export async function receitaPendente(admin: Cliente, agora = new Date()): Promise<PedidoVendasTrier[]> {
  const mes = mesAnteriorFechado(agora);
  const pend = await pedidosPendentes(admin, [{ relatorio: "receita", ...mes }]);
  if (!pend.length) return [];
  const { data, error } = await admin.from("vendas_coletas").select("id").eq("relatorio", "receita").eq("de", mes.de).eq("ate", mes.ate).gt("coletado_em", new Date(agora.getTime() - 60 * 60_000).toISOString()).limit(1);
  if (error) throw new Error(error.message);
  return data?.length ? [] : pend;
}

/** Relatórios de Excel grande (laboratórios, vendedor por grupo do mês): no robô de hoje entram uma vez por hora. */
const PESADOS_DE_HOJE: RelatorioVendas[] = ["laboratorios", "vendedores"];

/** Pedidos do robô de hoje (a cada 10 minutos): os relatórios diários do dia corrente e, se a última leitura parcial
 * deles tem mais de 55 minutos, os pesados (vendedores por grupo do dia 1 até hoje). */
export async function pedidosDeHoje(admin: Cliente, agora = new Date()): Promise<PedidoVendasTrier[]> {
  const hoje = diaBrasil(agora, 0);
  const { data, error } = await admin.from("vendas_coletas").select("relatorio").eq("parcial", true).eq("ate", hoje).in("relatorio", PESADOS_DE_HOJE).in("status", ["ok", "vazio"]).gt("coletado_em", new Date(agora.getTime() - 55 * 60_000).toISOString());
  if (error) throw new Error(error.message);
  const recentes = new Set((data ?? []).map((c) => c.relatorio));
  return [
    ...RELATORIOS_DIARIOS.filter((r) => !PESADOS_DE_HOJE.includes(r)).map((relatorio) => ({ relatorio, de: hoje, ate: hoje })),
    ...PESADOS_DE_HOJE.filter((r) => !recentes.has(r)).map((relatorio) => ({ relatorio, de: relatorio === "vendedores" ? `${hoje.slice(0, 7)}-01` : hoje, ate: hoje })),
  ];
}
