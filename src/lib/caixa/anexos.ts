// Anexos da justificativa de quebra de caixa. Módulo puro (tela e servidor). O arquivo vai direto do navegador para
// o Storage (bucket privado "documentos", pasta caixa/<id da quebra>/), porque a Vercel limita 4,5 MB por requisição
// ao servidor; o servidor só registra a linha em caixa_anexos. O RLS do banco e do Storage decide quem pode.
import { nomeSeguro } from "@/lib/rh/arquivos";

export const BUCKET_ANEXOS_CAIXA = "documentos";
export const TAMANHO_MAXIMO_ANEXO = 20 * 1024 * 1024; // igual ao limite do bucket
export const MAX_ANEXOS_POR_ENVIO = 5;
export const TIPOS_ANEXO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ANEXO = ".pdf,.jpg,.jpeg,.png,.webp,image/*";

export type AnexoEnviado = { caminho: string; nome: string; mime: string; tamanho: number };

/** Erro do arquivo escolhido, ou null se pode enviar. */
export function erroDoAnexo(arquivo: { name: string; size: number; type: string }) {
  if (!arquivo.size) return `“${arquivo.name}” está vazio.`;
  if (arquivo.size > TAMANHO_MAXIMO_ANEXO) return `“${arquivo.name}” passa de 20 MB.`;
  if (!(TIPOS_ANEXO as readonly string[]).includes(arquivo.type)) return `“${arquivo.name}”: envie foto (JPG, PNG, WebP) ou PDF.`;
  return null;
}

export const caminhoAnexoCaixa = (quebraId: string, nome: string) => `caixa/${quebraId}/${crypto.randomUUID()}-${nomeSeguro(nome)}`;

/** O caminho é da pasta desta quebra e não tenta sair dela. */
export const caminhoDaQuebra = (quebraId: string, caminho: string) => caminho.startsWith(`caixa/${quebraId}/`) && !caminho.includes("..") && caminho.split("/").length === 3;

export function tamanhoLegivel(bytes: number | null | undefined) {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
