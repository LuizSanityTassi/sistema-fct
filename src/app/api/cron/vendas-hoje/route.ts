import { createHash, timingSafeEqual } from "node:crypto";
import { after, NextResponse } from "next/server";
import { credenciaisTrierServico } from "@/lib/integracoes/segredos";
import { createAdminClient } from "@/lib/supabase/admin";
import { coletarVendas, pedidosDeHoje } from "@/lib/vendas/coleta";

// Robô das vendas de HOJE (a cada 10 minutos, das 7h às 23h50): quem chama é o banco (pg_cron + pg_net, migração 0105),
// porque o cron da Vercel no plano Hobby roda só uma vez por dia. Senha: "Authorization: Bearer <token>", em que o
// token fica no Vault do Supabase e sistema_config 'vendas_hoje_token' guarda só o hash (o CRON_SECRET também vale).
// Responde na hora e busca depois (after), para o pg_net não ficar esperando.
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

  const cred = await credenciaisTrierServico(admin);
  if (!cred.usuario || !cred.senha) return NextResponse.json({ pulado: "O robô do Trier não tem usuário e senha (Administração → Integrações)." }, { headers: semCache });

  after(async () => {
    try {
      const agora = new Date();
      const pedidos = await pedidosDeHoje(admin, agora);
      // leituras parciais de dias que já passaram: os números ficaram nas tabelas e a madrugada busca o dia inteiro
      await admin.from("vendas_coletas").delete().eq("parcial", true).lt("ate", pedidos[0].ate);
      const r = await coletarVendas(admin, cred, pedidos, null, 240_000, true);
      console.log("[cron vendas-hoje]", JSON.stringify({ pedidos: pedidos.map((p) => p.relatorio), ok: r.ok, vazios: r.vazios, erros: r.erros.map((e) => `${e.relatorio}: ${e.erro}`), faltam: r.restantes.length, ms: r.ms }));
    } catch (e) {
      console.error("[cron vendas-hoje]", e instanceof Error ? e.message : String(e));
    }
  });
  return NextResponse.json({ aceito: true }, { status: 202, headers: semCache });
}
