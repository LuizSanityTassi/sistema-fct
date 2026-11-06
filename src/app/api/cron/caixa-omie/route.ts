import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { coletarCaixaOmie } from "@/lib/financeiro/caixa-omie";
import { createAdminClient } from "@/lib/supabase/admin";

// Robô do caixa do Omie dia a dia (a cada 10 minutos, à noite e de madrugada, para não disputar a API do Omie com quem
// está usando a conciliação): quem chama é o banco (pg_cron + pg_net, migração 0129), com a mesma senha do robô de
// vendas de hoje (Vault; sistema_config 'vendas_hoje_token' guarda só o hash; o CRON_SECRET também vale).
// Responde na hora e busca depois (after). Só leitura no Omie.
export const maxDuration = 300;
const semCache = { "Cache-Control": "no-store" };

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function GET(req: Request) {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });

  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const { data: cfg } = await admin.from("sistema_config").select("valor").eq("chave", "vendas_hoje_token").maybeSingle();
  const hash = (cfg?.valor as { hash?: string } | null)?.hash;
  const segredo = process.env.CRON_SECRET;
  const confere = token.length >= 32 && ((!!hash && igual(createHash("sha256").update(token).digest("hex"), hash)) || (!!segredo && igual(token, segredo)));
  if (!confere) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });

  after(async () => {
    try {
      const r = await coletarCaixaOmie(admin, 250_000);
      console.log("[cron caixa-omie]", JSON.stringify({ pendentes: r.pendentes, feitos: r.feitos, erros: r.erros.slice(0, 6) }));
    } catch (e) {
      console.error("[cron caixa-omie]", e instanceof Error ? e.message : String(e));
    }
  });
  return NextResponse.json({ aceito: true }, { status: 202, headers: semCache });
}
