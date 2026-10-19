// Pedidos de acesso a telas (SÓ SERVIDOR): qual tela a pessoa tentou abrir, quem já tem acesso a ela e os e-mails
// para o administrador (pedido novo) e para quem pediu (resposta). O acesso continua sendo pelo PERFIL do
// usuário: atender um pedido = o administrador ajusta o perfil/filiais em Administração → Usuários.
import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensagem, SITE } from "@/lib/email";
import { itemDaRota } from "@/lib/nav";
import { PAPEL_LABEL, type AppRole } from "@/lib/roles";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export const ROTA_VALIDA = /^\/[a-z0-9/_-]{0,120}$/;
export const ROTA_PEDIDOS = "/configuracoes/acessos";

// telas que não estão no menu mas têm regra própria
const FORA_DO_MENU: Record<string, { tela: string; papeis: AppRole[] }> = {
  "/etiquetas/ti": { tela: "Etiquetas de patrimônio", papeis: ["admin", "ti"] },
};

export type InfoTela = { rota: string; tela: string; papeis: AppRole[] | null };

/** Nome da tela e perfis que a abrem (null = não sabemos; todos os perfis = tela livre). */
export function infoDaTela(rota: string): InfoTela {
  const extra = Object.entries(FORA_DO_MENU).find(([r]) => rota === r || rota.startsWith(`${r}/`));
  if (extra) return { rota: extra[0], tela: extra[1].tela, papeis: extra[1].papeis };
  const item = itemDaRota(rota);
  if (!item) return { rota, tela: "esta tela", papeis: null };
  return { rota: item.href, tela: item.label, papeis: item.papeis ?? null };
}

export const perfisQueAbrem = (papeis: AppRole[] | null) => (papeis ? papeis.map((p) => PAPEL_LABEL[p]).join(", ") : null);

type PedidoEmail = { solicitante_nome: string; papel_atual: string; tela: string; rota: string; motivo: string | null };
const rotuloPapel = (p: string) => PAPEL_LABEL[p as AppRole] ?? p;

/** Avisa os administradores ativos de um pedido novo (sem e-mail configurado, não manda nada). */
export async function avisarAdminsPedido(admin: Admin, p: PedidoEmail) {
  const { data: admins } = await admin.from("profiles").select("nome, email").or("papel.eq.admin,admin_sistema.eq.true").eq("ativo", true);
  const para = (admins ?? []).filter((a) => a.email).map((a) => ({ nome: a.nome || a.email!, email: a.email! }));
  return enviarMensagem(admin, para, `Pedido de acesso: ${p.solicitante_nome} → ${p.tela}`, {
    titulo: "Novo pedido de acesso",
    paragrafos: [`${p.solicitante_nome} (${rotuloPapel(p.papel_atual)}) tentou abrir uma tela que o perfil dele não libera e pediu acesso.`],
    detalhes: [["Tela", p.tela], ["Perfil hoje", rotuloPapel(p.papel_atual)], ...(p.motivo ? ([["Motivo", p.motivo]] as [string, string][]) : [])],
    botao: { texto: "Ver pedidos de acesso", href: `${SITE}${ROTA_PEDIDOS}` },
    rodape: "Para liberar, ajuste o perfil ou as filiais da pessoa em Administração → Usuários e marque o pedido como atendido.",
  });
}

/** Conta para quem pediu como ficou o pedido. */
export async function avisarSolicitante(admin: Admin, para: { nome: string; email: string }, p: PedidoEmail & { status: "atendida" | "recusada"; resposta: string | null }) {
  const atendida = p.status === "atendida";
  return enviarMensagem(admin, [para], atendida ? `Acesso liberado: ${p.tela}` : `Pedido de acesso a ${p.tela} não aprovado`, {
    titulo: atendida ? "Seu acesso foi liberado" : "Seu pedido de acesso não foi aprovado",
    paragrafos: [
      atendida
        ? `O administrador atendeu o seu pedido de acesso a ${p.tela}. Se a tela ainda não abrir, saia do sistema e entre de novo.`
        : `O administrador analisou o seu pedido de acesso a ${p.tela} e não aprovou desta vez.`,
    ],
    detalhes: p.resposta ? [["Recado", p.resposta]] : undefined,
    botao: atendida ? { texto: `Abrir ${p.tela}`, href: `${SITE}${p.rota}` } : { texto: "Ir para o Sistema FCT", href: `${SITE}/dashboard` },
  });
}
