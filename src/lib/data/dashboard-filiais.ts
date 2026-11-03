// Desempenho por filial (servidor): a situação de cada loja agora, para o painel geral. Os números vêm da RLS de quem
// vê (coordenador a regional, gerente as lojas dele); uma falha aqui não derruba o painel, vira aviso na seção.
import type { Sessao } from "@/lib/auth/session";
import { periodos } from "@/lib/data/dashboard-comparativos";
import { metasDoMes, somarDias, ultimoDia, vendasPorFilial } from "@/lib/data/vendas";
import { podeAcessar } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import type { Tom } from "@/lib/tons";

export type StatusFilial = "critica" | "atencao" | "em_dia";
export const ORDEM_STATUS: StatusFilial[] = ["critica", "atencao", "em_dia"];
export const ehStatusFilial = (v: unknown): v is StatusFilial => ORDEM_STATUS.includes(v as StatusFilial);
export const ROTULO_STATUS: Record<StatusFilial, string> = { critica: "Crítica", atencao: "Atenção", em_dia: "Em dia" };
export const TOM_STATUS: Record<StatusFilial, Tom> = { critica: "perigo", atencao: "alerta", em_dia: "sucesso" };

/** Limites da situação da filial (a tela de filiais mostra esta regra por extenso). */
export const REGRA_STATUS = { quebrasValor: 1000, quebrasParadas: 20, concVencidas: 5, ritmoCritico: 70, ritmoAtencao: 95 } as const;

export type LinhaFilialOperacao = {
  id: string;
  codigo: string;
  nome: string;
  regional: string | null;
  status: StatusFilial;
  /** Os principais motivos, do mais grave para o menos grave. */
  pendencias: string[];
  quebrasTotal: number;
  quebrasAbertas: number;
  quebrasParadas: number;
  quebrasValor: number;
  concAbertas: number;
  concVencidas: number;
  /** % da última conciliação; só existe na filial onde estão os títulos do Trier (a matriz de cada empresa). */
  concPct: number | null;
  chamados: number;
  asoVencidos: number;
  /** Venda até ontem ÷ o que a meta pedia até ontem (null = filial sem meta no mês). */
  pctRitmo: number | null;
};

export type FiliaisOperacao = { linhas: LinhaFilialOperacao[]; erro: boolean; comMeta: number; dentroMeta: number };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function statusDe(l: Pick<LinhaFilialOperacao, "quebrasValor" | "quebrasParadas" | "concVencidas" | "asoVencidos" | "pctRitmo">): StatusFilial {
  const R = REGRA_STATUS;
  if (l.quebrasValor >= R.quebrasValor || l.quebrasParadas >= R.quebrasParadas || l.concVencidas >= R.concVencidas || (l.pctRitmo !== null && l.pctRitmo < R.ritmoCritico)) return "critica";
  if (l.quebrasParadas > 0 || l.concVencidas > 0 || l.asoVencidos > 0 || (l.pctRitmo !== null && l.pctRitmo < R.ritmoAtencao)) return "atencao";
  return "em_dia";
}

function pendenciasDe(l: Pick<LinhaFilialOperacao, "quebrasAbertas" | "quebrasParadas" | "concVencidas" | "concAbertas" | "asoVencidos" | "chamados" | "pctRitmo">) {
  const R = REGRA_STATUS;
  return [
    l.pctRitmo !== null && l.pctRitmo < R.ritmoAtencao ? `venda em ${Math.round(l.pctRitmo)}% do ritmo da meta` : null,
    l.concVencidas ? plural(l.concVencidas, "conciliação vencida", "conciliações vencidas") : null,
    l.quebrasParadas ? plural(l.quebrasParadas, "quebra parada há +5 dias", "quebras paradas há +5 dias") : l.quebrasAbertas ? plural(l.quebrasAbertas, "quebra em aberto", "quebras em aberto") : null,
    l.asoVencidos ? plural(l.asoVencidos, "ASO vencido", "ASOs vencidos") : null,
    l.chamados ? plural(l.chamados, "chamado aberto", "chamados abertos") : null,
    !l.concVencidas && l.concAbertas ? plural(l.concAbertas, "pendência de conciliação", "pendências de conciliação") : null,
  ].filter((x): x is string => !!x);
}

/** Venda até ontem ÷ o que a meta pedia até ontem, por filial (só de quem tem meta e só depois do dia 1). */
async function ritmoDasMetas(sessao: Sessao): Promise<Map<string, number>> {
  if (!podeAcessar(sessao.papel, "/vendas", sessao.telasExtras, sessao.bloqueios)) return new Map();
  const { hoje, inicio } = periodos();
  const metas = await metasDoMes(inicio);
  const comMeta = [...metas].filter(([chave, v]) => chave.startsWith("filial:") && v > 0);
  const dia = Number(hoje.slice(8, 10));
  if (!comMeta.length || dia === 1) return new Map();
  const vendas = new Map((await vendasPorFilial(inicio, somarDias(hoje, -1))).map((l) => [l.branchId, l.venda]));
  const fracao = (dia - 1) / ultimoDia(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)));
  return new Map(comMeta.map(([chave, v]) => [chave.slice("filial:".length), ((vendas.get(chave.slice("filial:".length)) ?? 0) / (v * fracao)) * 100]));
}

export async function carregarFiliaisOperacao(sessao: Sessao): Promise<FiliaisOperacao> {
  try {
    const supabase = await createClient();
    const [{ data, error }, ritmos] = await Promise.all([supabase.rpc("dashboard_filiais"), ritmoDasMetas(sessao)]);
    if (error) throw new Error(error.message);
    const linhas = (data ?? []).map((r): LinhaFilialOperacao => {
      const base = {
        id: r.branch_id,
        codigo: r.codigo,
        nome: r.nome,
        regional: r.regional,
        quebrasTotal: Number(r.quebras_total),
        quebrasAbertas: Number(r.quebras_abertas),
        quebrasParadas: Number(r.quebras_paradas),
        quebrasValor: Number(r.quebras_valor),
        concAbertas: Number(r.conc_abertas),
        concVencidas: Number(r.conc_vencidas),
        concPct: r.conc_pct === null ? null : Number(r.conc_pct) * 100,
        chamados: Number(r.chamados_abertos),
        asoVencidos: Number(r.aso_vencidos),
        pctRitmo: ritmos.get(r.branch_id) ?? null,
      };
      return { ...base, status: statusDe(base), pendencias: pendenciasDe(base) };
    });
    const peso = (s: StatusFilial) => ORDEM_STATUS.indexOf(s);
    linhas.sort((a, b) => peso(a.status) - peso(b.status) || b.concVencidas + b.quebrasParadas - (a.concVencidas + a.quebrasParadas) || b.quebrasValor - a.quebrasValor);
    const comMeta = linhas.filter((l) => l.pctRitmo !== null);
    return { linhas, erro: false, comMeta: comMeta.length, dentroMeta: comMeta.filter((l) => (l.pctRitmo ?? 0) >= REGRA_STATUS.ritmoAtencao).length };
  } catch (e) {
    console.error("[dashboard] filiais:", e instanceof Error ? e.message : e);
    return { linhas: [], erro: true, comMeta: 0, dentroMeta: 0 };
  }
}
