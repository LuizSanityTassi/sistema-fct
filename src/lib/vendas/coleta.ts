// Coleta das vendas do Trier (só servidor): pede ao robô os relatórios de vendas e grava cada Excel em vendas_coletas
// assim que chega (se a função for interrompida, o que já veio fica salvo) e já passa pelo leitor, que troca os
// números do dia nas tabelas de vendas.
// - relatórios diários (por filial, grupos, laboratórios, vendedores, tele-entrega): um pedido por dia;
// - vendedor por grupo: o mês do dia 1 até a data (base da premiação), refeito a cada dia.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasTrier, RELATORIOS_VENDAS, type PedidoVendasTrier, type RelatorioVendas } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";
import { lerColetaAnotando, mapaFiliaisTrier } from "./leitura";

type Cliente = SupabaseClient<Database>;

export const RELATORIOS_COLETA = Object.keys(RELATORIOS_VENDAS) as RelatorioVendas[];
export const RELATORIOS_DIARIOS = RELATORIOS_COLETA.filter((r) => r !== "vendedores");
export const ehRelatorioVendas = (v: string): v is RelatorioVendas => v in RELATORIOS_VENDAS;

/** Primeiro dia do histórico (gráfico do ano contra o ano anterior). */
export const INICIO_HISTORICO = "2025-01-01";
/** Do histórico, só o que os gráficos de meses usam (venda, atendimentos, grupos/CMV). */
const RELATORIOS_HISTORICO: RelatorioVendas[] = ["filiais", "grupos"];

export type ResultadoColetaVendas = { ok: number; vazios: number; erros: { relatorio: RelatorioVendas; de: string; ate: string; erro: string }[]; restantes: PedidoVendasTrier[]; ms: number };

export async function coletarVendas(client: Cliente, cred: CredenciaisTrier, pedidos: PedidoVendasTrier[], quem: string | null, prazoMs: number): Promise<ResultadoColetaVendas> {
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
        .insert({ relatorio: resp.relatorio, de: resp.de, ate: resp.ate, status, erro: resp.erro ?? null, ms: resp.ms, tamanho: resp.xlsx?.length ?? null, arquivo_b64, criado_por: quem })
        .select("id")
        .single();
      let erro = error ? `não consegui gravar: ${error.message}` : resp.erro;
      if (!erro && data && arquivo_b64) erro = (await lerColetaAnotando(client, { id: data.id, relatorio: resp.relatorio, de: resp.de, ate: resp.ate, arquivo_b64 }, filiais)).erro ?? undefined;
      if (erro) erros.push({ relatorio: resp.relatorio, de: resp.de, ate: resp.ate, erro });
      else if (status === "ok") ok++;
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

/** Pedidos de um período: os diários dia a dia (mais recente primeiro) e o de vendedores por grupo mês a mês. */
export function pedidosDoPeriodo(de: string, ate: string, relatorios: RelatorioVendas[]): PedidoVendasTrier[] {
  const dias = diasEntre(de, ate).reverse();
  const diarios = dias.flatMap((dia) => relatorios.filter((r) => r !== "vendedores").map((relatorio) => ({ relatorio, de: dia, ate: dia })));
  const meses = relatorios.includes("vendedores") ? [...new Set(dias.map((d) => d.slice(0, 7)))] : [];
  return [...meses.map((mes) => ({ relatorio: "vendedores" as const, de: `${mes}-01`, ate: fimDoMes(`${mes}-01`) < ate ? fimDoMes(`${mes}-01`) : ate })), ...diarios];
}

/** Tira os pedidos que já foram buscados (ok ou sem movimento) para o mesmo relatório e período. Erro de leitura se
 * resolve lendo de novo o Excel guardado, sem buscar outra vez. */
export async function pedidosPendentes(client: Cliente, pedidos: PedidoVendasTrier[]) {
  if (!pedidos.length) return [];
  const datas = pedidos.map((p) => p.de).sort();
  const feitos = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await client.from("vendas_coletas").select("relatorio, de, ate").in("status", ["ok", "vazio"]).gte("de", datas[0]).lte("de", datas[datas.length - 1]).range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) feitos.add(`${c.relatorio}|${c.de}|${c.ate}`);
    if ((data?.length ?? 0) < 1000) break;
  }
  return pedidos.filter((p) => !feitos.has(`${p.relatorio}|${p.de}|${p.ate}`));
}

/** Quantos dias para trás o robô diário confere (dia que ficou sem leitura por Trier fora do ar, por exemplo). */
export const DIAS_CONFERIDOS = 7;

/**
 * Pedidos do robô diário, em ordem de prioridade: os relatórios diários dos últimos dias que ainda não têm leitura,
 * o mês dos vendedores por grupo até ontem e, no tempo que sobrar, o histórico (venda e grupos) desde
 * INICIO_HISTORICO, do mais recente para o mais antigo.
 */
export async function pedidosDoRoboVendas(admin: Cliente, agora = new Date()): Promise<PedidoVendasTrier[]> {
  const ontem = ontemNoBrasil(agora);
  const recentes = await pedidosPendentes(admin, pedidosDoPeriodo(diaBrasil(agora, DIAS_CONFERIDOS), ontem, RELATORIOS_COLETA).filter((p) => p.relatorio !== "vendedores"));
  const mes = await pedidosPendentes(admin, [{ relatorio: "vendedores", de: `${ontem.slice(0, 7)}-01`, ate: ontem }]);
  const historico = await pedidosPendentes(admin, pedidosDoPeriodo(INICIO_HISTORICO, diaBrasil(agora, DIAS_CONFERIDOS + 1), RELATORIOS_HISTORICO));
  return [...recentes, ...mes, ...historico];
}
