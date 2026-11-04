// Rótulos e regras puras da conciliação (servem a server e client components).
import type { Enums } from "@/lib/tipos";

export type TipoArquivoConc = Enums["conc_tipo_arquivo"];
export type StatusPendencia = Enums["conc_status_pendencia"];
export type GrupoItem = "exato" | "aproximado" | "so_trier" | "so_dda";

export const TIPO_ARQUIVO_LABEL: Record<TipoArquivoConc, string> = {
  dda_ret: "DDA Itaú (.RET)",
  dda_planilha: "DDA — planilha do portal Itaú",
  trier: "Trier — contas a pagar",
  omie: "Planilha gerada para o Omie",
};

export const GRUPO_LABEL: Record<GrupoItem, string> = {
  exato: "Bateram",
  aproximado: "Para conferir",
  so_trier: "Só no Trier",
  so_dda: "Só no DDA (banco)",
};

/** Mesmos textos do motor (Motor.ROTULO) + o lado do banco. */
export const CATEGORIA_LABEL: Record<string, string> = {
  EXATO: "Bateu exato",
  TAXA: "Bateu (+ tarifa do boleto)",
  AGRUPADO: "Bateu (várias notas num boleto)",
  COMBINACAO: "Bateu (notas somadas num boleto)",
  VALOR_DATA: "Bateu por valor e vencimento (beneficiário diferente)",
  DESCONTO: "Bateu (Trier já com o desconto do boleto)",
  LIQUIDO: "Bateu pelo valor líquido do Trier (com devolução/desconto)",
  DOCUMENTO: "Bateu pelo nº do documento (conferir valor)",
  FILIAL: "Bateu, mas o boleto é de outra filial (conferir)",
  DATA: "Vencimento diferente",
  VALOR: "Valor diferente",
  SO_TRIER: "Só no Trier",
  SEM_ARQUIVO: "Só no Trier (fora do período coberto pelos arquivos do banco)",
  SO_DDA: "Só no DDA (sem título no Trier)",
};

/** Categorias que viram pendência (as outras ou bateram, ou ficam fora por falta de arquivo). */
export const PROBLEMAS = ["SO_TRIER", "SO_DDA", "VALOR", "DOCUMENTO", "FILIAL", "VALOR_DATA", "DATA"] as const;
export type Problema = (typeof PROBLEMAS)[number];
export const PROBLEMA_LABEL: Record<Problema, string> = {
  SO_TRIER: "Só no Trier",
  SO_DDA: "Só no DDA",
  VALOR: "Valor diferente",
  DOCUMENTO: "Pelo nº do documento (conferir)",
  FILIAL: "Boleto de outra filial",
  VALOR_DATA: "Beneficiário diferente (valor e vencimento iguais)",
  DATA: "Vencimento diferente",
};
export function ehProblema(v: unknown): v is Problema {
  return typeof v === "string" && (PROBLEMAS as readonly string[]).includes(v);
}

export const STATUS_PENDENCIA_LABEL: Record<StatusPendencia, string> = {
  pendente: "Pendente",
  em_analise: "Em análise",
  resolvido: "Resolvido",
  justificado: "Ignorado / justificado",
};
export const STATUS_PENDENCIA = ["pendente", "em_analise", "resolvido", "justificado"] as const;
export function ehStatusPendencia(v: unknown): v is StatusPendencia {
  return typeof v === "string" && (STATUS_PENDENCIA as readonly string[]).includes(v);
}
export const pendenciaAberta = (status: StatusPendencia) => status === "pendente" || status === "em_analise";

export type Prioridade = 1 | 2 | 3;
export const PRIORIDADE_LABEL: Record<Prioridade, string> = { 3: "Alta", 2: "Média", 1: "Baixa" };

/** Alta = vencida/vence hoje ou ≥ R$ 5 mil; Média = vence em até 3 dias ou divergência de valor/filial/documento; Baixa = o resto. */
export function prioridadePendencia(p: { vencimento: string | null; valor: number | string; problema: string }, hoje = new Date()): Prioridade {
  const venc = p.vencimento ? Date.parse(`${p.vencimento}T00:00:00Z`) : null;
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const dias = venc === null ? 99 : Math.round((venc - hojeUtc) / 86_400_000);
  if (dias <= 0 || Number(p.valor) >= 5000) return 3;
  if (dias <= 3 || p.problema === "VALOR" || p.problema === "FILIAL" || p.problema === "DOCUMENTO") return 2;
  return 1;
}

/** A Omie aceita cerca de 1 conta por segundo: mais que isto não cabe nos 300 s da função. Seleção maior vai em lotes pela tela. */
export const LIMITE_LANCAMENTO_API = 200;

/** Faixas de filiais como a diretoria chama (Trier usa códigos numéricos). */
export const FAIXAS_PADRAO = [
  { nome: "Nazário", min: 301, max: 504 },
  { nome: "Varela", min: 1, max: 112 },
  { nome: "Itajaí", min: 201, max: 205 },
];

/** "F301" → 301; "ADM" → null. */
export function codigoNumerico(codigo: string) {
  const m = /^F?0*(\d{1,3})$/i.exec(codigo.trim());
  return m ? Number(m[1]) : null;
}
