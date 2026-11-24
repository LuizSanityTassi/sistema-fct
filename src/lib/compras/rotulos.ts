// Compras: situações do cruzamento pré-pedido × notas. Módulo puro (tela e servidor).
import { nomeSeguro } from "@/lib/rh/arquivos";
import type { Tom } from "@/lib/tons";

/** Dias depois do pré-pedido em que as notas ainda contam para ele (prazo de entrega). */
export const JANELA_PADRAO = 7;
export const JANELA_MAXIMA = 30;

export const SITUACOES_PEDIDO = { aguardando: "Aguardando", faltou: "Faltou", a_mais: "Veio a mais", completo: "Completo" } as const;
export type SituacaoPedido = keyof typeof SITUACOES_PEDIDO;
export const ehSituacaoPedido = (v: unknown): v is SituacaoPedido => typeof v === "string" && v in SITUACOES_PEDIDO;
export const TOM_PEDIDO: Record<SituacaoPedido, Tom> = { aguardando: "info", faltou: "perigo", a_mais: "alerta", completo: "sucesso" };
export const DESCRICAO_PEDIDO: Record<SituacaoPedido, string> = {
  aguardando: "Ainda no prazo e faltam itens",
  faltou: "Prazo vencido e faltaram itens",
  a_mais: "Chegou tudo, e algum item veio a mais",
  completo: "Chegou exatamente o pedido",
};

/** Situação de um item do pedido. */
export function situacaoItem(i: { pedido: number; recebido: number; excedente: number; prazo: string }, hoje: string) {
  if (i.excedente > 0) return { rotulo: `Veio a mais (+${i.excedente})`, tom: "alerta" as Tom };
  if (i.recebido >= i.pedido) return { rotulo: "Completo", tom: "sucesso" as Tom };
  const aberto = i.prazo >= hoje;
  if (i.recebido > 0) return { rotulo: aberto ? `Parcial (faltam ${i.pedido - i.recebido})` : `Faltou ${i.pedido - i.recebido}`, tom: (aberto ? "info" : "perigo") as Tom };
  return { rotulo: aberto ? "Aguardando" : "Não chegou", tom: (aberto ? "info" : "perigo") as Tom };
}

export const caminhoEspelho = (nome: string) => `espelhos/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;
export const caminhoDeEspelho = (caminho: string) => /^espelhos\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}-[\w.-]+$/i.test(caminho) && !caminho.includes("..");

export const TAMANHO_MAXIMO_ESPELHO = 50 * 1024 * 1024;
