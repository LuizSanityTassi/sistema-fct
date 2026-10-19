"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avisarSolicitante, ROTA_PEDIDOS } from "@/lib/acesso/pedidos";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoResposta = { erro?: string; ok?: string };

const UUID = /^[0-9a-f-]{36}$/i;

/** O administrador marca o pedido como atendido (depois de ajustar o perfil) ou recusa, com um recado opcional. */
export async function responderPedido(_prev: EstadoResposta, fd: FormData): Promise<EstadoResposta> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador responde pedidos de acesso." };
  const id = String(fd.get("id") ?? "");
  const decisao = fd.get("decisao") === "atendida" ? "atendida" : fd.get("decisao") === "recusada" ? "recusada" : null;
  if (!UUID.test(id) || !decisao) return { erro: "Pedido inválido." };
  const resposta = String(fd.get("resposta") ?? "").trim().slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acesso_solicitacoes")
    .update({ status: decisao, resposta })
    .eq("id", id)
    .eq("status", "pendente")
    .select("solicitante, solicitante_nome, papel_atual, tela, rota, motivo, status, resposta, perfil:profiles!acesso_solicitacoes_solicitante_fkey(nome, email)")
    .maybeSingle();
  if (error) return { erro: `Não consegui gravar: ${error.message}` };
  if (!data) return { erro: "Este pedido já tinha sido respondido." };

  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "acesso_solicitacoes", registroId: id, novo: { status: decisao, resposta: !!resposta } });
  const perfil = data.perfil as { nome: string | null; email: string | null } | null;
  if (perfil?.email) {
    after(async () => {
      const admin = createAdminClient();
      if (admin) await avisarSolicitante(admin, { nome: perfil.nome || data.solicitante_nome, email: perfil.email! }, { ...data, status: decisao, resposta });
    });
  }
  revalidatePath(ROTA_PEDIDOS);
  return { ok: decisao === "atendida" ? `Pedido de ${data.solicitante_nome} marcado como atendido. Ele recebe o aviso por e-mail.` : `Pedido de ${data.solicitante_nome} recusado. Ele recebe o aviso por e-mail.` };
}
