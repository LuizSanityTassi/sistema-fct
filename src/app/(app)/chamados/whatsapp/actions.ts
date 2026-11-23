"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import type { CategoriaChamado } from "@/lib/chamados/rotulos";
import { gerarTokenAgente, hashToken } from "@/lib/conciliacao/agentes";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { SETOR_WPP } from "@/lib/whatsapp/chamados";

const ROTA = "/chamados/whatsapp";
export type EstadoWpp = { erro?: string; ok?: string; chave?: string };

const CATEGORIAS = Object.keys(SETOR_WPP) as CategoriaChamado[];

/** Gera (ou troca) a chave do agente WhatsApp. Aparece uma vez; o banco guarda só o SHA-256. Só admin. */
export async function gerarChaveAgenteWpp(): Promise<EstadoWpp> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só administradores." };
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a chave de serviço do Supabase no servidor (SUPABASE_SERVICE_ROLE_KEY)." };
  const chave = gerarTokenAgente();
  const { error } = await admin
    .from("wpp_agente")
    .upsert({ id: 1, token_hash: hashToken(chave), criado_por: sessao.id, criado_em: new Date().toISOString(), conectado: false });
  if (error) return { erro: error.message };
  const supabase = await createClient();
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "wpp_agente", registroId: null, novo: { chave: "gerada" } });
  revalidatePath(ROTA);
  return { ok: "Chave gerada. Cole no arquivo config.json do agente (campo \"chave\"). Ela aparece só agora; a chave antiga parou de valer.", chave };
}

/** Liga cada setor a um grupo do WhatsApp (ou desliga). Só admin. */
export async function salvarDestinosWpp(_prev: EstadoWpp, fd: FormData): Promise<EstadoWpp> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só administradores." };
  const supabase = await createClient();
  const { data: grupos } = await supabase.from("wpp_grupos").select("jid, nome");
  const nomes = new Map((grupos ?? []).map((g) => [g.jid, g.nome]));
  const linhas = CATEGORIAS.map((c) => {
    const jid = String(fd.get(`grupo_${c}`) ?? "");
    return {
      categoria: c,
      grupo_jid: jid && nomes.has(jid) ? jid : null,
      grupo_nome: jid ? (nomes.get(jid) ?? null) : null,
      ativo: fd.get(`ativo_${c}`) === "on",
      atualizado_em: new Date().toISOString(),
      atualizado_por: sessao.id,
    };
  });
  const { error } = await supabase.from("wpp_destinos").upsert(linhas);
  if (error) return { erro: error.message };
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "wpp_destinos",
    registroId: null,
    novo: Object.fromEntries(linhas.map((l) => [l.categoria, l.grupo_nome && l.ativo ? l.grupo_nome : "desligado"])),
  });
  revalidatePath(ROTA);
  return { ok: "Grupos salvos. Os próximos chamados de cada setor vão para o grupo escolhido." };
}

/** Manda uma mensagem de teste para o grupo do setor (entra na fila; o agente manda na próxima rodada). */
export async function testarGrupoWpp(fd: FormData): Promise<void> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return;
  const categoria = String(fd.get("categoria") ?? "") as CategoriaChamado;
  if (!CATEGORIAS.includes(categoria)) return;
  const supabase = await createClient();
  const { data: d } = await supabase.from("wpp_destinos").select("grupo_jid").eq("categoria", categoria).maybeSingle();
  if (!d?.grupo_jid) return;
  await supabase.from("wpp_fila").insert({
    categoria,
    grupo_jid: d.grupo_jid,
    mensagem: `✅ *Teste do Portal FCT*\nOs chamados de *${SETOR_WPP[categoria]}* vão chegar neste grupo.`,
  });
  revalidatePath(ROTA);
}
