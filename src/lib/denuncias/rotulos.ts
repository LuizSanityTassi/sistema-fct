// Canal de denúncias: rótulos puros (servidor e tela).
import { TOM } from "@/lib/tons";

export const CATEGORIAS_DENUNCIA = {
  assedio_moral: "Assédio moral",
  assedio_sexual: "Assédio sexual",
  discriminacao: "Discriminação ou preconceito",
  fraude: "Fraude, furto ou desvio",
  conduta: "Conduta antiética ou conflito de interesses",
  seguranca: "Segurança e saúde no trabalho",
  normas: "Descumprimento de normas da empresa",
  outros: "Outro assunto",
} as const;
export type CategoriaDenuncia = keyof typeof CATEGORIAS_DENUNCIA;

export const STATUS_DENUNCIA = {
  recebida: "Recebida",
  em_analise: "Em análise",
  concluida: "Concluída",
  arquivada: "Arquivada",
} as const;
export type StatusDenuncia = keyof typeof STATUS_DENUNCIA;

/** O que cada situação significa para quem denunciou. */
export const EXPLICACAO_STATUS: Record<StatusDenuncia, string> = {
  recebida: "A denúncia chegou e ainda vai ser analisada pelo comitê.",
  em_analise: "O comitê está apurando o caso.",
  concluida: "A apuração terminou. Veja a mensagem do comitê abaixo.",
  arquivada: "O caso foi encerrado sem providências. Veja a mensagem do comitê abaixo.",
};

export const COR_STATUS: Record<StatusDenuncia, string> = {
  recebida: TOM.info,
  em_analise: TOM.atencao,
  concluida: TOM.sucesso,
  arquivada: TOM.neutro,
};

export const ehCategoria = (v: unknown): v is CategoriaDenuncia => typeof v === "string" && v in CATEGORIAS_DENUNCIA;
export const ehStatusDenuncia = (v: unknown): v is StatusDenuncia => typeof v === "string" && v in STATUS_DENUNCIA;
