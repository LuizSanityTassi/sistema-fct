// Agente de arquivos (só servidor): o PC com o Itaú Mailbox manda os .RET para /api/conciliacao/agente com uma chave.
// A chave aparece UMA vez para quem a gera; o banco guarda só o SHA-256 (conc_agentes.token_hash).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PREFIXO_TOKEN = "ag_";
const FORMATO = /^ag_[0-9a-f]{48}$/;

export const gerarTokenAgente = () => `${PREFIXO_TOKEN}${randomBytes(24).toString("hex")}`;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const tokenValido = (t: string) => FORMATO.test(t);

/** Lê a chave do cabeçalho `X-Agente` (ou `Authorization: Bearer`). */
export function tokenDoPedido(req: Request) {
  const bruto = req.headers.get("x-agente") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const t = bruto.trim();
  return tokenValido(t) ? t : null;
}

/** Compara hashes sem vazar tempo. */
export function mesmoHash(a: string, b: string) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
