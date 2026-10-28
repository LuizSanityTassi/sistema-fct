// Coleta das vendas do Trier (só servidor): pede ao robô os relatórios de vendas de um período e grava cada Excel em
// vendas_coletas assim que chega (se a função for interrompida, o que já veio fica salvo). Os números saem dali
// depois, pelo leitor de cada relatório.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarVendasTrier, RELATORIOS_VENDAS, type PedidoVendasTrier, type RelatorioVendas } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";

type Cliente = SupabaseClient<Database>;

export const RELATORIOS_COLETA = Object.keys(RELATORIOS_VENDAS) as RelatorioVendas[];
export const ehRelatorioVendas = (v: string): v is RelatorioVendas => v in RELATORIOS_VENDAS;

export type ResultadoColetaVendas = { ok: number; vazios: number; erros: { relatorio: RelatorioVendas; de: string; ate: string; erro: string }[]; restantes: PedidoVendasTrier[]; ms: number };

export async function coletarVendas(client: Cliente, cred: CredenciaisTrier, pedidos: PedidoVendasTrier[], quem: string | null, prazoMs: number): Promise<ResultadoColetaVendas> {
  let ok = 0;
  let vazios = 0;
  const erros: ResultadoColetaVendas["erros"] = [];
  const r = await buscarVendasTrier(
    cred,
    pedidos,
    async (resp) => {
      const status = resp.xlsx ? "ok" : resp.semMovimento ? "vazio" : "erro";
      const { error } = await client.from("vendas_coletas").insert({
        relatorio: resp.relatorio,
        de: resp.de,
        ate: resp.ate,
        status,
        erro: resp.erro ?? null,
        ms: resp.ms,
        tamanho: resp.xlsx?.length ?? null,
        arquivo_b64: resp.xlsx?.toString("base64") ?? null,
        criado_por: quem,
      });
      const erro = error ? `não consegui gravar: ${error.message}` : resp.erro;
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

/** Quantos dias para trás o robô diário confere (dia que ficou sem leitura por Trier fora do ar, por exemplo). */
export const DIAS_CONFERIDOS = 7;

/**
 * Pedidos do robô diário: cada relatório × dia dos últimos dias que ainda não tem leitura boa (ok ou sem movimento),
 * de ontem para trás. Não volta para antes da primeira coleta (o histórico é carregado à parte).
 */
export async function pedidosDoRoboVendas(admin: Cliente, agora = new Date()): Promise<PedidoVendasTrier[]> {
  const { data: primeira } = await admin.from("vendas_coletas").select("de").order("de").limit(1).maybeSingle();
  const dias = Array.from({ length: DIAS_CONFERIDOS }, (_, i) => diaBrasil(agora, i + 1)).filter((d, i) => i === 0 || (!!primeira && d >= primeira.de));
  const { data, error } = await admin.from("vendas_coletas").select("relatorio, de, ate").in("status", ["ok", "vazio"]).gte("de", dias[dias.length - 1]).lte("de", dias[0]);
  if (error) throw new Error(error.message);
  const feitos = new Set((data ?? []).filter((c) => c.de === c.ate).map((c) => `${c.relatorio}|${c.de}`));
  return dias.flatMap((dia) => RELATORIOS_COLETA.filter((rel) => !feitos.has(`${rel}|${dia}`)).map((relatorio) => ({ relatorio, de: dia, ate: dia })));
}
