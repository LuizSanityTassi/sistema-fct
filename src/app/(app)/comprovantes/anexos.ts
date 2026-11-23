"use client";

import { BUCKET_ANEXOS_CAIXA, type AnexoEnviado } from "@/lib/caixa/anexos";
import { caminhoAnexoComprovante } from "@/lib/comprovantes/rotulos";
import { createClient } from "@/lib/supabase/client";

/** Mensagens do Storage em português. */
function motivoDoErro(msg: string) {
  if (/row-level security|unauthorized|not allowed|permission/i.test(msg)) return "você não pode anexar neste comprovante (cancelado ou de outra loja). Se a sessão expirou, entre de novo.";
  if (/maximum allowed size|too large|payload/i.test(msg)) return "arquivo maior que 20 MB.";
  if (/mime type|invalid.*type/i.test(msg)) return "tipo de arquivo não aceito (use foto ou PDF).";
  if (/fetch|network/i.test(msg)) return "falha de conexão. Tente de novo.";
  return msg;
}

/** Envia os arquivos direto do navegador para o Storage (comprovantes/<id>/); devolve a lista para registrar. */
export async function enviarAnexos(comprovanteId: string, arquivos: File[]): Promise<{ enviados: AnexoEnviado[]; erro?: string }> {
  const supabase = createClient();
  const enviados: AnexoEnviado[] = [];
  for (const arquivo of arquivos) {
    const caminho = caminhoAnexoComprovante(comprovanteId, arquivo.name);
    const { error } = await supabase.storage.from(BUCKET_ANEXOS_CAIXA).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
    if (error) {
      if (enviados.length) await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(enviados.map((a) => a.caminho));
      return { enviados: [], erro: `Não consegui enviar “${arquivo.name}”: ${motivoDoErro(error.message)}` };
    }
    enviados.push({ caminho, nome: arquivo.name, mime: arquivo.type, tamanho: arquivo.size });
  }
  return { enviados };
}
