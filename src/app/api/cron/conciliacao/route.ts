import { NextResponse } from "next/server";
import { rodarConciliacaoAutomatica } from "@/lib/conciliacao/automatica";
import { credenciaisTrierServico } from "@/lib/integracoes/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

// Conciliação automática (vercel.json → crons, de manhã e no começo da tarde, depois que os retornos do Itaú chegam):
// robô do Trier + retornos de DDA do sistema → uma conciliação por faixa de filiais. Só a Vercel chama: ela manda
// "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 300;
const semCache = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ erro: "CRON_SECRET não configurado no servidor." }, { status: 503, headers: semCache });
  if (req.headers.get("authorization") !== `Bearer ${segredo}`) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });

  try {
    const r = await rodarConciliacaoAutomatica(admin, await credenciaisTrierServico(admin), { userId: null });
    console.log("[cron conciliacao]", JSON.stringify(r));
    return NextResponse.json(r, { headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cron conciliacao]", erro);
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
