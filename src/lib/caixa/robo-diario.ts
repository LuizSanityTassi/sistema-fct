// Robô diário dos caixas (só servidor, chamado pelo cron da Vercel de madrugada): busca no Trier o Relatório de
// Diferenças de Caixa de cada loja e grava, sem ninguém clicar em "Buscar do Trier".
// - ontem e anteontem: lidos de novo uma vez por dia (o caixa que fecha no dia seguinte só entra completo na segunda
//   leitura; o que já foi gravado só é atualizado);
// - os 5 dias antes disso: só o que ainda não foi lido com sucesso (atrasos, Trier fora do ar).
// Várias rodadas por madrugada (vercel.json): cada uma faz o que couber em ~4 min e a próxima continua de onde parou.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PedidoCaixaTrier } from "@/lib/conciliacao/trier-robo";
import { credenciaisTrierServico } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";
import { coletarDiferencas, filiaisDoTrier, type FilialCaixa } from "./coleta";

type Cliente = SupabaseClient<Database>;

export const DIAS_RELER = 2;
export const DIAS_ATRASADOS = 7;

const diaBrasil = (agora: Date, diasAtras: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora.getTime() - diasAtras * 86_400_000));

/** Pedidos (loja × dia) desta rodada, do dia mais recente para o mais antigo. */
export async function pedidosDoRobo(admin: Cliente, filiais: FilialCaixa[], agora = new Date()): Promise<PedidoCaixaTrier[]> {
  // não volta para antes do primeiro dia já buscado (o módulo começou em 14/10/2026): sem quebra antiga surgindo do nada
  const { data: primeira } = await admin.from("caixa_coletas").select("dia").order("dia").limit(1).maybeSingle();
  const dias = Array.from({ length: DIAS_ATRASADOS }, (_, i) => diaBrasil(agora, i + 1)).filter((d, i) => i < DIAS_RELER || (!!primeira && d >= primeira.dia));
  const { data, error } = await admin.from("caixa_coletas").select("dia, branch_id, status, coletado_em").gte("dia", dias[dias.length - 1]).lte("dia", dias[0]);
  if (error) throw new Error(error.message);
  const coleta = new Map((data ?? []).map((c) => [`${c.dia}|${c.branch_id}`, c]));
  const inicioDeHoje = Date.parse(`${diaBrasil(agora, 0)}T00:00:00-03:00`);
  return dias.flatMap((dia, i) =>
    filiais
      .filter((f) => {
        const c = coleta.get(`${dia}|${f.id}`);
        if (!c || c.status !== "ok") return true;
        return i < DIAS_RELER && Date.parse(c.coletado_em) < inicioDeHoje;
      })
      .map((f) => ({ dia, filial: f.filial })),
  );
}

export type ResultadoRobo = { pulado?: string; pedidos: number; lidas: number; caixas: number; quebras: number; erros: number; faltam: number; ms: number; primeirosErros: string[] };

export async function rodarRoboDiario(admin: Cliente, prazoMs: number): Promise<ResultadoRobo> {
  const vazio = { pedidos: 0, lidas: 0, caixas: 0, quebras: 0, erros: 0, faltam: 0, ms: 0, primeirosErros: [] };
  const cred = await credenciaisTrierServico(admin);
  if (!cred.usuario || !cred.senha) return { ...vazio, pulado: "O robô do Trier não tem usuário e senha (Administração → Integrações)." };
  const filiais = await filiaisDoTrier(admin);
  const pedidos = await pedidosDoRobo(admin, filiais);
  if (!pedidos.length) return { ...vazio, pulado: "Nada para buscar: os últimos dias já foram lidos hoje." };
  const r = await coletarDiferencas(admin, cred, pedidos, filiais, prazoMs);
  return {
    pedidos: pedidos.length,
    lidas: r.lidas,
    caixas: r.caixas,
    quebras: r.quebras,
    erros: r.erros.length,
    faltam: r.restantes.length,
    ms: r.ms,
    primeirosErros: r.erros.slice(0, 5).map((e) => `${e.filial} ${e.dia}: ${e.erro}`),
  };
}
