// Conciliação automática (só servidor): o robô gera o relatório do Trier, junta com os retornos de DDA que já estão
// no sistema (mandados pelo agente ou enviados à mão) e concilia cada faixa de filiais da configuração.
// Chamada pelo cron da Vercel (service_role, sem usuário) e pelo botão "Rodar agora" em Conciliação → Robôs.
// Uma rodada por dia já basta; as outras do dia só rodam se chegou arquivo novo do banco depois da última.
import type { SupabaseClient } from "@supabase/supabase-js";
import { montarMapaFiliais } from "@/lib/data/conciliacao";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database, Json } from "@/lib/supabase/types";
import { FAIXAS_PADRAO } from "./rotulos";
import { executarConciliacao, guardarArquivo } from "./servico";
import { buscarRelatorioTrier, CONFIG_TRIER_PADRAO, statusTrier, TrierErro, type ConfigTrier, type PassoTrier0010 } from "./trier-robo";

type Cliente = SupabaseClient<Database>;
type Faixa = { nome: string; min: number; max: number };

export const CHAVE_AUTOMATICA = "automatica";
/** Retornos de DDA lidos por rodada (o motor fica com o último estado de cada boleto). */
const MAX_DDA = 400;
/** Sem tempo para mais uma faixa depois disto (a função da Vercel vai até 300 s). */
const PRAZO_FAIXAS_MS = 240_000;

export type ResultadoFaixa = { faixa: string; id?: string; pctBateu?: number; novas?: number; resolvidas?: number; erro?: string; semDados?: string };
export type ResultadoAutomatica = {
  quando: string;
  manual: boolean;
  pulado?: string;
  erro?: string;
  trier?: { id?: string; nome: string; periodo: string; repetido?: boolean };
  dda: number;
  faixas: ResultadoFaixa[];
  ms: number;
};

const diaBrasil = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const horaBrasil = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function lerConfig<T>(c: Cliente, chave: string, padrao: T): Promise<T> {
  const { data } = await c.from("conc_config").select("valor").eq("chave", chave).maybeSingle();
  return (data?.valor as T | undefined) ?? padrao;
}

export const ultimaAutomatica = (c: Cliente) => lerConfig<ResultadoAutomatica | null>(c, CHAVE_AUTOMATICA, null);

async function guardarResultado(c: Cliente, r: ResultadoAutomatica, userId: string | null) {
  const { error } = await c.from("conc_config").upsert({ chave: CHAVE_AUTOMATICA, valor: r as unknown as Json, atualizado_em: r.quando, atualizado_por: userId }, { onConflict: "chave" });
  if (error) console.error("[conciliacao automatica] resultado:", error.message);
}

/** Guarda as etapas de cada busca do relatório de contas a pagar (Rel_0010) em integracao_diagnosticos, para ver por que não veio. */
export async function guardarRastroTrier(c: Cliente, r: { ok: boolean; erro?: string; periodo?: string; rastro?: PassoTrier0010[] }) {
  const ultima = r.rastro?.[r.rastro.length - 1];
  const { error } = await c.from("integracao_diagnosticos").insert({
    sistema: "trier",
    resumo: { relatorio: "Rel_0010", ok: r.ok, erro: r.erro ?? null, periodo: r.periodo ?? null, etapa: ultima?.etapa ?? null, ms: ultima?.ms ?? null },
    dados: { rastro: (r.rastro ?? []) as unknown as Json },
  });
  if (error) console.error("[trier rel_0010] rastro:", error.message);
}

export async function rodarConciliacaoAutomatica(c: Cliente, cred: CredenciaisTrier, opcoes: { userId: string | null; forcar?: boolean }): Promise<ResultadoAutomatica> {
  const inicio = Date.now();
  const agora = new Date();
  const r: ResultadoAutomatica = { quando: agora.toISOString(), manual: !!opcoes.userId, dda: 0, faixas: [], ms: 0 };
  const fim = async (extra: Partial<ResultadoAutomatica>, guardar = true) => {
    Object.assign(r, extra, { ms: Date.now() - inicio });
    if (guardar) await guardarResultado(c, r, opcoes.userId);
    return r;
  };

  if (!statusTrier(cred).configurado) return fim({ pulado: "O robô do Trier não tem usuário e senha (Administração → Integrações)." });
  const cfgTrier = await lerConfig<ConfigTrier>(c, "trier", CONFIG_TRIER_PADRAO);
  const desde = diaBrasil(new Date(agora.getTime() - cfgTrier.diasAntes * 86_400_000));

  // retornos do banco que ainda têm boleto vencendo dentro do período do relatório do Trier
  const { data: arquivos, error } = await c
    .from("conc_arquivos")
    .select("id, enviado_em, meta")
    .is("arquivado_em", null)
    .in("tipo", ["dda_ret", "dda_planilha"])
    .order("enviado_em", { ascending: false })
    .limit(MAX_DDA);
  if (error) return fim({ erro: error.message });
  const dda = arquivos.filter((a) => {
    const vf = (a.meta as { vencFim?: string | null } | null)?.vencFim;
    return !vf || vf >= desde;
  });
  r.dda = dda.length;
  if (!dda.length) return fim({ pulado: "Nenhum retorno de DDA do banco no sistema: instale o agente no servidor que recebe os .RET do Itaú ou envie em Conciliação → Arquivos." });

  if (!opcoes.forcar) {
    const ultima = await ultimaAutomatica(c);
    const rodouHoje = ultima && !ultima.pulado && !ultima.erro && ultima.faixas.some((f) => f.id) && diaBrasil(new Date(ultima.quando)) === diaBrasil(agora);
    if (rodouHoje && !dda.some((a) => a.enviado_em > ultima.quando)) {
      // nada novo: não sobrescreve o resultado da última rodada
      return fim({ pulado: `Nada novo do banco desde a rodada de ${horaBrasil(new Date(ultima.quando))}.` }, false);
    }
  }

  const filiais = await montarMapaFiliais(c);
  let trierId = "";
  // relatório do Trier buscado há pouco (à mão ou na rodada anterior) serve: poupa minutos de Trier
  const { data: recente } = await c
    .from("conc_arquivos")
    .select("id, nome, meta")
    .eq("tipo", "trier")
    .eq("origem", "robo_trier")
    .is("arquivado_em", null)
    .gte("enviado_em", new Date(agora.getTime() - 2 * 3_600_000).toISOString())
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recente) {
    trierId = recente.id;
    r.trier = { id: recente.id, nome: recente.nome, periodo: (recente.meta as { robo?: { periodo?: string } } | null)?.robo?.periodo ?? "", repetido: true };
  } else {
    try {
      // até ~2,5 min de Trier: o resto do tempo da função fica para conciliar as faixas
      const rel = await buscarRelatorioTrier(cred, cfgTrier, 150_000);
      await guardarRastroTrier(c, { ok: true, periodo: rel.periodo, rastro: rel.rastro });
      const file = new File([new Uint8Array(rel.conteudo).buffer as ArrayBuffer], rel.nome, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const g = await guardarArquivo(c, opcoes.userId, file, "trier", "robo_trier", { filiais, meta: { robo: { periodo: rel.periodo, ...cfgTrier, automatica: true } } });
      if (!g.ok || !g.id) return fim({ erro: `O relatório veio do Trier, mas não deu para guardar: ${g.mensagem}` });
      trierId = g.id;
      r.trier = { id: g.id, nome: g.nome, periodo: rel.periodo, repetido: g.repetido };
    } catch (e) {
      if (e instanceof TrierErro) await guardarRastroTrier(c, { ok: false, erro: e.message, rastro: e.rastro });
      return fim({ erro: `Trier: ${mensagem(e)}` });
    }
  }

  const faixas = await lerConfig<Faixa[]>(c, "faixas", FAIXAS_PADRAO);
  const ddaIds = dda.map((a) => a.id);
  for (const f of faixas) {
    const nome = `${f.nome} (${f.min}–${f.max})`;
    if (Date.now() - inicio > PRAZO_FAIXAS_MS) {
      r.faixas.push({ faixa: nome, erro: "sem tempo nesta rodada; fica para a próxima" });
      continue;
    }
    try {
      const feita = await executarConciliacao(c, opcoes.userId, { ddaIds, trierIds: [trierId], filMin: f.min, filMax: f.max, titulo: `Automática · ${f.nome} · ${horaBrasil(agora)}` }, { filiais });
      r.faixas.push({ faixa: nome, id: feita.id, pctBateu: feita.pctBateu, novas: feita.pendencias.novas, resolvidas: feita.pendencias.resolvidasAuto });
    } catch (e) {
      const m = mensagem(e);
      // faixa sem boleto do banco ou sem título no Trier não é erro: só não tem o que conciliar ainda
      r.faixas.push(/^Nenhum (boleto do banco|título do Trier)/.test(m) ? { faixa: nome, semDados: m } : { faixa: nome, erro: m });
    }
  }
  return fim({});
}
