// Envio de e-mail do sistema (SÓ SERVIDOR): caixa nao-responda@farmaciafct.com.br por SMTP. A senha fica no Vault
// (Administração → Integrações) e é lida pela função que só a service_role executa. Sem senha cadastrada,
// os envios "de cortesia" (pedidos de acesso) são pulados em silêncio; os avisos de quebra avisam na tela.
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEGREDOS } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://portal.farmaciafct.com.br").replace(/\/$/, "");
export const SMTP_PADRAO = { host: "mail.farmaciafct.com.br", porta: 465, usuario: "nao-responda@farmaciafct.com.br" };

export type ConfigSmtp = { host: string; porta: number; usuario: string; senha: string; configurado: boolean };

export async function configSmtp(admin: Admin): Promise<ConfigSmtp> {
  const nomes = [SEGREDOS.smtp_host, SEGREDOS.smtp_porta, SEGREDOS.smtp_usuario, SEGREDOS.smtp_senha];
  const { data, error } = await admin.rpc("integracao_ler_segredos_servico", { p_nomes: nomes });
  if (error) throw new Error(`Não consegui ler a configuração do e-mail: ${error.message}`);
  const s = new Map((data ?? []).map((r) => [r.nome, r.valor]));
  const porta = Number(s.get(SEGREDOS.smtp_porta)) || SMTP_PADRAO.porta;
  const senha = s.get(SEGREDOS.smtp_senha) ?? "";
  return { host: s.get(SEGREDOS.smtp_host) || SMTP_PADRAO.host, porta, usuario: s.get(SEGREDOS.smtp_usuario) || SMTP_PADRAO.usuario, senha, configurado: !!senha };
}

export function transporteSmtp(c: ConfigSmtp) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    auth: { user: c.usuario, pass: c.senha },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Confere se o servidor de e-mail aceita o usuário e a senha (sem mandar nada). */
export async function testarSmtp(c: ConfigSmtp) {
  await transporteSmtp(c).verify();
}

export const remetente = (c: ConfigSmtp) => ({ name: "Sistema FCT", address: c.usuario });

// ---------- mensagem simples, no visual do sistema ----------

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type MensagemSimples = {
  titulo: string;
  paragrafos: string[];
  /** caixa cinza com pares rótulo → valor (ex.: Tela, Motivo) */
  detalhes?: [string, string][];
  botao?: { texto: string; href: string };
  rodape?: string;
};

export function montarMensagem(m: MensagemSimples) {
  const detalhes = m.detalhes?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;background:#f4f1ee;border-radius:10px">${m.detalhes
        .map(([r, v]) => `<tr><td style="padding:8px 14px;font-size:12px;color:#6e6265;width:110px;vertical-align:top">${esc(r)}</td><td style="padding:8px 14px 8px 0;font-size:14px;color:#161213">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
        .join("")}</table>`
    : "";
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.titulo)}</title></head>
<body style="margin:0;padding:0;background:#f4f1ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:0 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #e4dbd6;overflow:hidden">
<tr><td style="background:#c10510;padding:18px 28px"><span style="display:inline-block;background:#f5c518;color:#161213;font-weight:900;font-size:13px;padding:7px 9px;border-radius:7px">FCT</span><span style="color:#ffffff;font-size:16px;font-weight:bold;margin-left:10px;vertical-align:middle">Sistema FCT</span></td></tr>
<tr><td style="height:4px;background:#161213;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 8px">
<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#161213">${esc(m.titulo)}</h1>
${m.paragrafos.map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#3d3436">${esc(p)}</p>`).join("")}
${detalhes}
${m.botao ? `<p style="margin:4px 0 8px"><a href="${esc(m.botao.href)}" style="display:inline-block;background:#161213;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:9px">${esc(m.botao.texto)}</a></p>` : ""}
${m.rodape ? `<p style="margin:14px 0 0;font-size:12px;line-height:1.6;color:#6e6265">${esc(m.rodape)}</p>` : ""}
</td></tr>
<tr><td style="padding:16px 28px;background:#f4f1ee;font-size:11px;color:#6e6265">Farmácias FCT · uso interno · e-mail automático, não precisa responder.</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [m.titulo, "", ...m.paragrafos.flatMap((p) => [p, ""]), ...(m.detalhes ?? []).map(([r, v]) => `${r}: ${v}`), ...(m.botao ? ["", `${m.botao.texto}: ${m.botao.href}`] : []), ...(m.rodape ? ["", m.rodape] : []), "", "Farmácias FCT · uso interno · e-mail automático, não precisa responder."].join("\n");
  return { html, texto };
}

/**
 * Manda uma mensagem simples para uma lista de pessoas (uma por vez). Sem senha de e-mail cadastrada, não manda
 * nada e devolve "sem_smtp". Erros de envio ficam no log e não derrubam quem chamou.
 */
export async function enviarMensagem(admin: Admin, para: { nome: string; email: string }[], assunto: string, m: MensagemSimples): Promise<"ok" | "sem_smtp" | "falhou"> {
  if (!para.length) return "ok";
  try {
    const smtp = await configSmtp(admin);
    if (!smtp.configurado) return "sem_smtp";
    const { html, texto } = montarMensagem(m);
    const correio = transporteSmtp(smtp);
    try {
      for (const p of para) await correio.sendMail({ from: remetente(smtp), to: { name: p.nome, address: p.email }, subject: assunto, text: texto, html });
    } finally {
      correio.close();
    }
    return "ok";
  } catch (e) {
    console.error("[email]", assunto, e instanceof Error ? e.message : e);
    return "falhou";
  }
}
