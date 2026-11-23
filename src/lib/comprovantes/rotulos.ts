// Comprovantes de venda (convênio e crediário): tipos, situações e caminho dos anexos. Módulo puro (tela e servidor).
import { nomeSeguro } from "@/lib/rh/arquivos";
import type { Tom } from "@/lib/tons";

export const TIPOS_VENDA = { convenio: "Convênio", crediario: "Crediário" } as const;
export type TipoVenda = keyof typeof TIPOS_VENDA;
export const ehTipoVenda = (v: unknown): v is TipoVenda => typeof v === "string" && v in TIPOS_VENDA;

export const SITUACOES_COMPROVANTE = { ativo: "Ativo", cancelado: "Cancelado" } as const;
export type SituacaoComprovante = keyof typeof SITUACOES_COMPROVANTE;
export const ehSituacaoComprovante = (v: unknown): v is SituacaoComprovante => typeof v === "string" && v in SITUACOES_COMPROVANTE;
export const TOM_COMPROVANTE: Record<SituacaoComprovante, Tom> = { ativo: "sucesso", cancelado: "neutro" };

/** Conferência do financeiro: a conferir · conferido · com problema (a loja corrige anexando o arquivo certo). */
export const CONFERENCIAS = { pendente: "A conferir", divergente: "Com problema", conferido: "Conferido" } as const;
export type Conferencia = keyof typeof CONFERENCIAS;
export const ehConferencia = (v: unknown): v is Conferencia => typeof v === "string" && v in CONFERENCIAS;
export const TOM_CONFERENCIA: Record<Conferencia, Tom> = { pendente: "atencao", divergente: "perigo", conferido: "sucesso" };

export const MAX_PARCELAS = 24;

// anexo: bucket "documentos", pasta comprovantes/<id>/ (as mesmas regras de arquivo dos anexos de caixa)
export const caminhoAnexoComprovante = (comprovanteId: string, nome: string) => `comprovantes/${comprovanteId}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;
export const caminhoDoComprovante = (comprovanteId: string, caminho: string) =>
  caminho.startsWith(`comprovantes/${comprovanteId}/`) && !caminho.includes("..") && caminho.split("/").length === 3;

/** Texto da busca (cliente, empresa ou nº da venda) sem os caracteres que mexem no filtro do banco. */
export const limparBusca = (texto: string) =>
  texto
    .replace(/[,()%_*\\"]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
