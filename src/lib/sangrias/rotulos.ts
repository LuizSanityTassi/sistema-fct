// Sangrias: situações, comprovantes e valores. Módulo puro (tela e servidor).
import { nomeSeguro } from "@/lib/rh/arquivos";
import type { Tom } from "@/lib/tons";

export const SITUACOES_SANGRIA = { pendente: "A conferir", conferida: "Conferida", cancelada: "Cancelada" } as const;
export type SituacaoSangria = keyof typeof SITUACOES_SANGRIA;
export const ehSituacaoSangria = (v: unknown): v is SituacaoSangria => typeof v === "string" && v in SITUACOES_SANGRIA;
export const TOM_SANGRIA: Record<SituacaoSangria, Tom> = { pendente: "atencao", conferida: "sucesso", cancelada: "neutro" };

/** Como a sangria está no Omie, para o selo: só a conferida vai para o Omie. */
export function situacaoNoOmie(s: { situacao: string; omie_codigo: number | null; omie_situacao: string | null }): { rotulo: string; tom: Tom } | null {
  if (s.omie_codigo != null) return { rotulo: "No Omie", tom: "sucesso" };
  if (s.situacao !== "conferida") return null;
  if (s.omie_situacao === "barrada") return { rotulo: "Barrada: já existe", tom: "perigo" };
  if (s.omie_situacao === "parecida") return { rotulo: "Parecida: decidir", tom: "alerta" };
  if (s.omie_situacao === "erro") return { rotulo: "Erro no envio", tom: "perigo" };
  return { rotulo: "A enviar", tom: "neutro" };
}

// comprovante: bucket "documentos", pasta sangrias/<id>/ (as mesmas regras de arquivo dos anexos de caixa)
export const caminhoAnexoSangria = (sangriaId: string, nome: string) => `sangrias/${sangriaId}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;
export const caminhoDaSangria = (sangriaId: string, caminho: string) => caminho.startsWith(`sangrias/${sangriaId}/`) && !caminho.includes("..") && caminho.split("/").length === 3;

/** "2.530,00", "2530,5" ou "2530.50" → 2530.5 (null se não for valor válido). */
export function lerValor(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/[R$\s]/g, "");
  // "2.530,00" (vírgula decimal) · "1.234" (ponto de milhar) · "2530.50" (ponto decimal)
  const normal = /,\d{1,2}$/.test(limpo) ? limpo.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(limpo) ? limpo.replace(/\./g, "") : limpo.replace(/,/g, "");
  const n = Number(normal);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
