import { createHmac, timingSafeEqual } from "node:crypto";

// Troca de senha só por quem chegou pelo link do e-mail (recuperação/convite), não por uma sessão já aberta
// (ex.: o computador da loja com o login de alguém). O /auth/confirm grava um cookie assinado de 15 minutos,
// preso ao usuário; o updatePassword exige esse cookie.
export const COOKIE_TROCA_SENHA = "fct_troca_senha";
export const VALIDADE_TROCA_SENHA_S = 15 * 60;

function chave() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET;
  if (!k) throw new Error("Servidor sem chave para assinar a troca de senha.");
  return k;
}

const assinar = (texto: string) => createHmac("sha256", chave()).update(`troca-senha:${texto}`).digest("hex");

export function gerarCookieTrocaSenha(userId: string): string {
  const expira = Math.floor(Date.now() / 1000) + VALIDADE_TROCA_SENHA_S;
  const base = `${userId}.${expira}`;
  return `${base}.${assinar(base)}`;
}

export function cookieTrocaSenhaValido(valor: string | undefined, userId: string): boolean {
  if (!valor) return false;
  const partes = valor.split(".");
  if (partes.length !== 3) return false;
  const [uid, expira, assinatura] = partes;
  if (uid !== userId || !/^\d+$/.test(expira) || Number(expira) < Date.now() / 1000) return false;
  const esperado = assinar(`${uid}.${expira}`);
  return esperado.length === assinatura.length && timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura));
}

/** Para onde ir depois do link: só caminho interno (nada de outro site, //host ou .host). */
export function destinoInterno(v: string | null | undefined, padrao = "/portal"): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^\/(?![/\\])[^\s]*$/.test(s) ? s : padrao;
}
