// Assistente de IA: a conversa com a API (pergunta → consultas → resposta). Não conhece o Next nem o banco: quem chama
// entrega o cliente, as ferramentas e o histórico, e guarda o resultado.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaContentBlock, BetaContentBlockParam, BetaMessage, BetaMessageParam, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { MAX_TOKENS_RESPOSTA, MAX_VOLTAS } from "./config";

/** Uma consulta que a IA pode pedir. `rodar` valida a entrada e devolve o resultado em texto; erro vira mensagem para a IA. */
export type Ferramenta = { nome: string; descricao: string; status: string; entrada: Record<string, unknown>; rodar: (bruto: unknown) => Promise<string> };

export type EventoIa = { t: "texto"; v: string } | { t: "status"; v: string };
/** ok = resposta completa; cortada = texto incompleto (limite de tamanho); recusa = a IA não respondeu; sem_saldo = estourou o limite no meio. */
export type FimConversa = "ok" | "cortada" | "recusa" | "sem_saldo";

type Opcoes = {
  client: Anthropic;
  modelo: string;
  sistema: string;
  ferramentas: Ferramenta[];
  historico: BetaMessageParam[];
  pergunta: BetaContentBlockParam[];
  aoEvento: (e: EventoIa) => void;
  aoResponder: (m: BetaMessage) => void;
  temSaldo: () => boolean;
  sinal?: AbortSignal;
};

/**
 * Blocos que voltam no histórico. Quando a API troca de modelo no meio da resposta (bloco fallback), antes da última
 * troca só o texto pode voltar; o marcador em si não precisa.
 */
export function paraHistorico(conteudo: BetaContentBlock[]) {
  const corte = conteudo.findLastIndex((b) => b.type === "fallback");
  return conteudo.filter((b, i) => b.type !== "fallback" && (i > corte || b.type === "text"));
}

/** A troca automática de modelo em caso de recusa não existe no Haiku. */
const opcoesDeRecusa = (modelo: string) => (modelo.includes("haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const });

async function rodarChamadas(chamadas: { id: string; name: string; input: unknown }[], ferramentas: Ferramenta[], aoEvento: Opcoes["aoEvento"]) {
  return Promise.all(
    chamadas.map(async (c): Promise<BetaToolResultBlockParam> => {
      const f = ferramentas.find((x) => x.nome === c.name);
      if (!f) return { type: "tool_result", tool_use_id: c.id, is_error: true, content: `Consulta inexistente: ${c.name}` };
      aoEvento({ t: "status", v: f.status });
      try {
        return { type: "tool_result", tool_use_id: c.id, content: await f.rodar(c.input) };
      } catch (e) {
        return { type: "tool_result", tool_use_id: c.id, is_error: true, content: e instanceof Error ? e.message : "Erro na consulta." };
      }
    }),
  );
}

/** Faz uma pergunta: repete chamada à API e consultas até sair a resposta. `novas` só serve para guardar quando o fim é ok ou cortada. */
export async function conversar(op: Opcoes): Promise<{ fim: FimConversa; novas: BetaMessageParam[] }> {
  const novas: BetaMessageParam[] = [{ role: "user", content: op.pergunta }];
  const ferramentas = op.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, input_schema: f.entrada as { type: "object" }, eager_input_streaming: true }));
  let reenvios = 0;
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    if (!op.temSaldo()) return { fim: "sem_saldo", novas };
    let msg: BetaMessage;
    try {
      const stream = op.client.beta.messages.stream(
        {
          model: op.modelo,
          max_tokens: MAX_TOKENS_RESPOSTA,
          system: [{ type: "text", text: op.sistema, cache_control: { type: "ephemeral" } }],
          tools: ferramentas,
          tool_choice: volta === MAX_VOLTAS - 1 ? { type: "none" } : { type: "auto" },
          messages: [...op.historico, ...novas],
          cache_control: { type: "ephemeral" },
          output_config: { effort: "medium" },
          ...opcoesDeRecusa(op.modelo),
        },
        { signal: op.sinal },
      );
      stream.on("text", (v) => op.aoEvento({ t: "texto", v }));
      msg = await stream.finalMessage();
    } catch (e) {
      // JSON de consulta que não deu para ler: repete a chamada; erro da API (chave, limite, sobrecarga) sobe
      if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError) && reenvios < 2) {
        reenvios++;
        volta--;
        continue;
      }
      throw e;
    }
    op.aoResponder(msg);
    if (msg.stop_reason === "refusal") return { fim: "recusa", novas };
    const conteudo = paraHistorico(msg.content);
    const chamadas = conteudo.filter((b) => b.type === "tool_use");
    // consulta cortada no limite de tamanho não pode rodar nem voltar para o histórico
    if ((msg.stop_reason === "max_tokens" || msg.stop_reason === "model_context_window_exceeded") && chamadas.length) return { fim: "recusa", novas };
    if (!conteudo.length) return { fim: "recusa", novas };
    novas.push({ role: "assistant", content: conteudo });
    if (msg.stop_reason === "max_tokens" || msg.stop_reason === "model_context_window_exceeded") return { fim: "cortada", novas };
    if (msg.stop_reason !== "tool_use" || !chamadas.length) return { fim: "ok", novas };
    novas.push({ role: "user", content: await rodarChamadas(chamadas, op.ferramentas, op.aoEvento) });
  }
  // a última volta não aceita consulta, então só chega aqui se os reenvios acabarem com as voltas
  return { fim: "recusa", novas };
}
