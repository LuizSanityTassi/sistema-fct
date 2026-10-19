"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { avisarAdminsPedido, infoDaTela, ROTA_PEDIDOS, ROTA_VALIDA } from "@/lib/acesso/pedidos";
import { getSessao } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoPedido = { erro?: string; ok?: string };

/** Quem caiu numa tela sem permissão pede acesso ao administrador (um pedido em aberto por tela). */
export async function pedirAcesso(_prev: EstadoPedido, fd: FormData): Promise<EstadoPedido> {
  const sessao = await getSessao();
  const rotaBruta = String(fd.get("rota") ?? "");
  if (!ROTA_VALIDA.test(rotaBruta)) return { erro: "Tela inválida." };
  const info = infoDaTela(rotaBruta);
  if (info.papeis?.includes(sessao.papel)) return { ok: "Você já tem acesso a esta tela." };
  const motivo = String(fd.get("motivo") ?? "").trim().slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acesso_solicitacoes")
    // nome, perfil e datas o próprio banco preenche (gatilho); aqui vão só para cumprir o formato
    .insert({ solicitante: sessao.id, solicitante_nome: sessao.nome, papel_atual: sessao.papel, rota: info.rota, tela: info.tela, motivo })
    .select("solicitante_nome, papel_atual, tela, rota, motivo")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: "Você já tinha pedido acesso a esta tela: o pedido continua aguardando o administrador." };
    return { erro: `Não consegui registrar o pedido: ${error.message}` };
  }

  // e-mail para os administradores depois de responder a tela (não atrasa quem pediu)
  after(async () => {
    const admin = createAdminClient();
    if (admin) await avisarAdminsPedido(admin, data);
  });
  revalidatePath("/sem-acesso");
  revalidatePath(ROTA_PEDIDOS);
  return { ok: "Pedido enviado! O administrador vai analisar, e a resposta chega por e-mail e aparece aqui." };
}
