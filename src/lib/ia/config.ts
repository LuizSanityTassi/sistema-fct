// Assistente de IA: modelo, preços e limites de gasto. Trocar de modelo é só mudar a variável IA_MODELO na Vercel.
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

type Preco = { entrada: number; saida: number; cacheLeitura: number };

/** Dólares por milhão de tokens. A escrita no cache custa 1,25 vez a entrada. */
const PRECOS: Record<string, Preco> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.2 },
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5, cacheLeitura: 0.01 },
};
/** Modelo que não está na tabela (quando a API usa outro no lugar do pedido): conta pelo preço de Opus anterior, o mais caro em que ela costuma cair. */
const PRECO_OUTRO: Preco = { entrada: 5, saida: 25, cacheLeitura: 0.5 };

const MODELO_PADRAO = "claude-opus-5-5";
export const modeloDaIa = () => {
  const pedido = process.env.IA_MODELO?.trim();
  return pedido && Object.hasOwn(PRECOS, pedido) ? pedido : MODELO_PADRAO;
};

export const LIMITE_DIA_PESSOA_USD = 2;
export const LIMITE_MES_TOTAL_USD = 30;
/** Cada pergunta reenvia a conversa toda, então conversa longa custa mais a cada pergunta. */
export const MAX_PERGUNTAS_CONVERSA = 15;
export const MAX_CARACTERES_PERGUNTA = 2000;
/** Idas e voltas à API numa pergunta; a última é obrigada a responder com o que já tem. */
export const MAX_VOLTAS = 6;
export const MAX_TOKENS_RESPOSTA = 8000;

export type UsoDaResposta = { modelo: string; entrada: number; cacheLeitura: number; cacheEscrita: number; saida: number; custo: number };

/** Tokens e custo estimado de uma resposta. Quando a API tenta mais de um modelo, cada tentativa vem em usage.iterations. */
export function usoDaResposta(msg: Pick<BetaMessage, "model" | "usage">): UsoDaResposta {
  const iteracoes = (msg.usage.iterations ?? []).filter((i) => i.type === "message" || i.type === "fallback_message");
  const partes = iteracoes.length ? iteracoes.map((i) => ({ ...i, model: i.model ?? msg.model })) : [{ ...msg.usage, model: msg.model }];
  const uso: UsoDaResposta = { modelo: msg.model, entrada: 0, cacheLeitura: 0, cacheEscrita: 0, saida: 0, custo: 0 };
  for (const p of partes) {
    const preco = PRECOS[p.model] ?? PRECO_OUTRO;
    const cacheLeitura = p.cache_read_input_tokens ?? 0;
    const cacheEscrita = p.cache_creation_input_tokens ?? 0;
    uso.entrada += p.input_tokens;
    uso.cacheLeitura += cacheLeitura;
    uso.cacheEscrita += cacheEscrita;
    uso.saida += p.output_tokens;
    uso.custo += (p.input_tokens * preco.entrada + cacheLeitura * preco.cacheLeitura + cacheEscrita * preco.entrada * 1.25 + p.output_tokens * preco.saida) / 1_000_000;
  }
  return uso;
}
