import { timingSafeEqual } from "node:crypto";

/** Compara dois textos em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres bateram). */
export function textosIguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Pedido da Vercel Cron: "Authorization: Bearer <CRON_SECRET>". Sem CRON_SECRET no servidor, ninguém passa. */
export function cronAutorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return textosIguais(req.headers.get("authorization") ?? "", `Bearer ${segredo}`);
}
