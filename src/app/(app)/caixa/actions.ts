"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA, caminhoDaQuebra, MAX_ANEXOS_POR_ENVIO, TAMANHO_MAXIMO_ANEXO, TIPOS_ANEXO, type AnexoEnviado } from "@/lib/caixa/anexos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoJustificativa = { erro?: string; ok?: string };

/** Lista de anexos que o navegador já enviou ao Storage (vem como JSON no formulário). */
function lerAnexos(quebraId: string, bruto: FormDataEntryValue | null): AnexoEnviado[] | string {
  if (typeof bruto !== "string" || !bruto) return [];
  let lista: unknown;
  try {
    lista = JSON.parse(bruto);
  } catch {
    return "Anexos inválidos.";
  }
  if (!Array.isArray(lista)) return "Anexos inválidos.";
  if (lista.length > MAX_ANEXOS_POR_ENVIO) return `No máximo ${MAX_ANEXOS_POR_ENVIO} arquivos por vez.`;
  const out: AnexoEnviado[] = [];
  for (const a of lista as Partial<AnexoEnviado>[]) {
    if (typeof a?.caminho !== "string" || !caminhoDaQuebra(quebraId, a.caminho)) return "Anexo fora da pasta desta quebra.";
    if (typeof a.nome !== "string" || !a.nome.trim()) return "Anexo sem nome.";
    if (typeof a.mime !== "string" || !(TIPOS_ANEXO as readonly string[]).includes(a.mime)) return "Tipo de anexo não aceito.";
    const tamanho = Number(a.tamanho);
    if (!Number.isFinite(tamanho) || tamanho <= 0 || tamanho > TAMANHO_MAXIMO_ANEXO) return "Anexo com tamanho inválido.";
    out.push({ caminho: a.caminho, nome: a.nome.trim().slice(0, 160), mime: a.mime, tamanho });
  }
  return out;
}

/** Justificativa (e anexos) de quem responde pelo caixa. O banco confere se a pessoa pode (caixa_justificar e RLS dos anexos). */
export async function justificarQuebra(id: string, _prev: EstadoJustificativa, fd: FormData): Promise<EstadoJustificativa> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Caixa inválido." };
  const textoBruto = fd.get("justificativa");
  const justificativa = typeof textoBruto === "string" ? textoBruto.trim() : "";
  if (justificativa.length < 10) return { erro: "Conte o que aconteceu (pelo menos 10 letras)." };
  const anexos = lerAnexos(id, fd.get("anexos"));
  if (typeof anexos === "string") return { erro: anexos };
  const supabase = await createClient();
  const { error } = await supabase.rpc("caixa_justificar", { p_id: id, p_texto: justificativa.slice(0, 2000) });
  if (error) return { erro: error.message };
  if (anexos.length) {
    const { error: eAnexo } = await supabase
      .from("caixa_anexos")
      .insert(anexos.map((a) => ({ diferenca_id: id, nome: a.nome, storage_path: a.caminho, mime: a.mime, tamanho: a.tamanho, enviado_por: sessao.id, enviado_por_nome: sessao.nome })));
    if (eAnexo) {
      await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(anexos.map((a) => a.caminho));
      return { erro: `A justificativa foi salva, mas os anexos não: ${eAnexo.message}` };
    }
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_diferencas", registroId: id, novo: { justificou: true, anexos: anexos.length } });
  revalidatePath("/caixa");
  revalidatePath("/financeiro/diferenca-caixa");
  revalidatePath(`/financeiro/diferenca-caixa/${id}`);
  return { ok: anexos.length ? `Justificativa enviada ao financeiro com ${anexos.length === 1 ? "1 anexo" : `${anexos.length} anexos`}.` : "Justificativa enviada ao financeiro." };
}

/** Remove um anexo (quem enviou, ou o financeiro) enquanto a quebra não foi decidida. */
export async function removerAnexoCaixa(fd: FormData) {
  const sessao = await getSessao();
  const id = fd.get("id");
  if (typeof id !== "string" || !UUID.test(id)) return;
  const supabase = await createClient();
  const { data: anexo } = await supabase.from("caixa_anexos").select("id, diferenca_id, nome, storage_path").eq("id", id).maybeSingle();
  if (!anexo) return;
  const { data: apagados } = await supabase.from("caixa_anexos").delete().eq("id", id).select("id");
  if (!apagados?.length) return; // sem permissão (o RLS não deixou)
  await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove([anexo.storage_path]);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "caixa_anexos", registroId: id, anterior: { quebra: anexo.diferenca_id, nome: anexo.nome } });
  revalidatePath("/caixa");
  revalidatePath(`/financeiro/diferenca-caixa/${anexo.diferenca_id}`);
}
