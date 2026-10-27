// Check-list Coordenador Regional (Coordenação → Checklist da loja): itens avaliados de 0 a 5 estrelas.
// O texto do item vai gravado junto com a nota, então mudar esta lista não muda os checklists já feitos.
import type { Tom } from "@/lib/tons";

export const ITENS_CHECKLIST = [
  { chave: "fachada", item: "Fachada limpa, iluminada e padronizada" },
  { chave: "layout", item: "Layout organizado (corredores livres, fácil circulação)" },
  { chave: "precificacao", item: "Produtos precificados e promoções com preço em destaque" },
  { chave: "ruptura", item: "Ruptura de produtos (faltas nas prateleiras)" },
  { chave: "atendimento", item: "Postura e abordagem da equipe no ato do atendimento" },
  { chave: "uniforme", item: "Uso correto de uniforme e crachá" },
  { chave: "estoque", item: "Controle, organização e limpeza do estoque" },
  { chave: "escalas", item: "Escalas de trabalho e controle de ponto organizados" },
  { chave: "ticket_medio", item: "Indicador de tíquete médio" },
  { chave: "itens_sacola", item: "Indicador de itens por sacola" },
  { chave: "rentabilidade", item: "Indicador de rentabilidade" },
  { chave: "crm", item: "Indicador de CRM" },
  { chave: "fortvigor", item: "Desempenho na campanha Fortvigor" },
] as const;

export const OBJETIVO_CHECKLIST =
  "Avaliar a execução operacional, a performance e a qualidade da liderança do gerente, garantindo aderência às diretrizes da empresa e consistência nos resultados.";
export const DIRETRIZES_CHECKLIST = ["Basear-se em fatos, não em percepções isoladas.", "Registrar evidências sempre que possível.", "Direcionar ações claras ao gerente ao final da visita."];
export const DECLARACAO_GERENTE = "Declaro estar ciente dos itens acima citados e estou de acordo.";

export type NotaItem = { chave: string; item: string; nota: number };

export const SITUACOES_CHECKLIST = {
  aguardando: "Aguardando o gerente",
  confirmado: "Confirmado pelo gerente",
  contestado: "Gerente não concordou",
  cancelado: "Cancelado",
} as const;
export type SituacaoChecklist = keyof typeof SITUACOES_CHECKLIST;
export const TOM_CHECKLIST: Record<SituacaoChecklist, Tom> = { aguardando: "atencao", confirmado: "sucesso", contestado: "perigo", cancelado: "neutro" };

/** Lê as notas gravadas (jsonb) sem confiar no formato. */
export function lerNotas(v: unknown): NotaItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ chave: String(x.chave ?? ""), item: String(x.item ?? ""), nota: Number(x.nota) }))
    .filter((x) => x.item && Number.isFinite(x.nota));
}

/** Uma linha por item, sem linhas vazias (direcionamentos e acordos). */
export const linhasDeTexto = (texto: string, max = 30) =>
  texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, max);
