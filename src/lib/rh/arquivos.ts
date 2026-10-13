// Regras de upload de arquivos de RH (bucket privado "documentos").
export const BUCKET_DOCUMENTOS = "documentos";
export const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB (igual ao limite do bucket)
export const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ARQUIVO = ".pdf,.jpg,.jpeg,.png,.webp";

export function nomeSeguro(nome: string) {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
  return base || "arquivo";
}

/** Valida o arquivo vindo do FormData. Devolve mensagem de erro ou null. */
export function validarArquivo(arquivo: unknown, obrigatorio: boolean): { erro?: string; arquivo?: File } {
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return obrigatorio ? { erro: "Selecione um arquivo." } : {};
  }
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Arquivo acima de 20 MB." };
  if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) {
    return { erro: "Formato não aceito. Envie PDF, JPG, PNG ou WebP." };
  }
  return { arquivo };
}

export function caminhoArquivo(employeeId: string, nomeOriginal: string, subpasta?: string) {
  const partes = ["funcionarios", employeeId];
  if (subpasta) partes.push(subpasta);
  partes.push(`${crypto.randomUUID()}-${nomeSeguro(nomeOriginal)}`);
  return partes.join("/");
}
