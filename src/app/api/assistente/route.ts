import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import { conversar, type EventoIa, type FimConversa } from "@/lib/ia/agente";
import { LIMITE_DIA_PESSOA_USD, LIMITE_MES_TOTAL_USD, MAX_CARACTERES_PERGUNTA, MAX_PERGUNTAS_CONVERSA, modeloDaIa, usoDaResposta, type UsoDaResposta } from "@/lib/ia/config";
import { ferramentasDe, SISTEMA } from "@/lib/ia/ferramentas";
import { podeAcessar } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

// Uma pergunta ao assistente: responde em NDJSON (uma linha por evento: texto, status, fim ou erro). A chave da API fica
// só aqui no servidor; a conversa fica no banco, assim o navegador não consegue mexer no histórico.
export const maxDuration = 120;

const PEDIDO = z.object({ texto: z.string().trim().min(1).max(MAX_CARACTERES_PERGUNTA), conversa: z.uuid().nullish() });
const erro = (mensagem: string, status: number) => NextResponse.json({ erro: mensagem }, { status });

const MENSAGEM_FIM: Partial<Record<FimConversa, string>> = {
  recusa: "Não consegui responder a essa pergunta. Tente perguntar de outro jeito.",
  sem_saldo: "O limite de gasto foi atingido no meio da resposta. Tente de novo amanhã ou fale com o administrador.",
};

function mensagemDeErro(e: unknown) {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError || (e instanceof Anthropic.BadRequestError && /workspace/i.test(e.message))) return "A chave da IA não foi aceita. Avise o administrador.";
  if (e instanceof Anthropic.RateLimitError) return "Muitas perguntas ao mesmo tempo. Tente de novo em instantes.";
  if (e instanceof Anthropic.BadRequestError && /credit/i.test(e.message)) return "O crédito da IA acabou. Avise o administrador.";
  if (e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) return "A IA está indisponível agora. Tente de novo em instantes.";
  return "Não consegui responder agora. Tente de novo.";
}

const temTexto = (conteudo: string) => (JSON.parse(conteudo) as { type: string }[]).some((b) => b.type === "text");

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, "/assistente", sessao.telasExtras, sessao.bloqueios)) return erro("Você não tem acesso ao assistente.", 403);
  if (!process.env.ANTHROPIC_API_KEY) return erro("A IA ainda não foi ligada: falta cadastrar a chave da API.", 503);
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return erro(`Escreva uma pergunta de até ${MAX_CARACTERES_PERGUNTA} caracteres.`, 400);
  const { texto, conversa } = pedido.data;

  const supabase = await createClient();
  const { data: gastos, error: erroGastos } = await supabase.rpc("ia_gastos").single();
  if (erroGastos) return erro("Não consegui conferir o limite de gasto. Tente de novo.", 500);
  const gastoHoje = Number(gastos.hoje_usuario);
  const gastoMes = Number(gastos.mes_total);
  if (gastoMes >= LIMITE_MES_TOTAL_USD) return erro("O limite de gasto do mês com a IA foi atingido. Fale com o administrador.", 429);
  if (gastoHoje >= LIMITE_DIA_PESSOA_USD) return erro("Você atingiu o limite de uso da IA por hoje. Amanhã libera de novo.", 429);

  let historico: BetaMessageParam[] = [];
  let ordem = 0;
  if (conversa) {
    const { data: linhas, error } = await supabase.from("ia_mensagens").select("papel, conteudo, ordem").eq("conversa_id", conversa).order("ordem");
    if (error) return erro("Não consegui abrir a conversa. Tente de novo.", 500);
    if (!linhas.length) return erro("Conversa não encontrada. Comece uma nova.", 404);
    if (linhas.filter((l) => l.papel === "user" && temTexto(l.conteudo)).length >= MAX_PERGUNTAS_CONVERSA) return erro("Esta conversa ficou longa. Clique em Nova conversa para continuar.", 400);
    historico = linhas.map((l) => ({ role: l.papel as "user" | "assistant", content: JSON.parse(l.conteudo) }));
    ordem = linhas[linhas.length - 1].ordem + 1;
  }

  const hoje = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "full" }).format(new Date());
  const codificador = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(controle) {
      const enviar = (e: EventoIa | { t: "fim"; conversa: string | null; gastoHoje: number; aviso?: string } | { t: "erro"; v: string }) => controle.enqueue(codificador.encode(`${JSON.stringify(e)}\n`));
      const usos: UsoDaResposta[] = [];
      const gastoAgora = () => usos.reduce((t, u) => t + u.custo, 0);
      let conversaId = conversa ?? null;
      try {
        const { fim, novas } = await conversar({
          client: new Anthropic(),
          modelo: modeloDaIa(),
          sistema: SISTEMA,
          ferramentas: ferramentasDe(sessao),
          historico,
          pergunta: [
            { type: "text", text: `(Hoje é ${hoje}, horário de Brasília.)` },
            { type: "text", text: texto },
          ],
          aoEvento: enviar,
          aoResponder: (m) => usos.push(usoDaResposta(m)),
          temSaldo: () => gastoHoje + gastoAgora() < LIMITE_DIA_PESSOA_USD && gastoMes + gastoAgora() < LIMITE_MES_TOTAL_USD,
          sinal: req.signal,
        });
        if (fim === "ok" || fim === "cortada") {
          if (!conversaId) {
            const { data, error } = await supabase.from("ia_conversas").insert({ titulo: texto.slice(0, 80) }).select("id").single();
            if (error) throw new Error(error.message);
            conversaId = data.id;
          } else {
            await supabase.from("ia_conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", conversaId);
          }
          const { error } = await supabase.from("ia_mensagens").insert(novas.map((m, i) => ({ conversa_id: conversaId!, ordem: ordem + i, papel: m.role, conteudo: JSON.stringify(m.content) })));
          if (error) throw new Error(error.message);
          enviar({ t: "fim", conversa: conversaId, gastoHoje: gastoHoje + gastoAgora(), aviso: fim === "cortada" ? "A resposta ficou grande e foi cortada. Peça uma parte de cada vez." : undefined });
        } else {
          enviar({ t: "erro", v: MENSAGEM_FIM[fim] ?? "Não consegui responder agora." });
        }
      } catch (e) {
        if (!(e instanceof Anthropic.APIUserAbortError)) {
          console.error("[assistente]", e instanceof Error ? e.message : e);
          enviar({ t: "erro", v: mensagemDeErro(e) });
        }
      } finally {
        // o gasto conta mesmo quando a resposta não chega ao fim
        if (usos.length) {
          const { error } = await supabase.from("ia_uso").insert(usos.map((u) => ({ conversa_id: conversaId, modelo: u.modelo, entrada: u.entrada, cache_leitura: u.cacheLeitura, cache_escrita: u.cacheEscrita, saida: u.saida, custo_usd: u.custo })));
          if (error) console.error("[assistente] uso:", error.message);
        }
        try {
          controle.close();
        } catch {
          // a pessoa fechou a tela
        }
      }
    },
  });
  return new Response(corpo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
