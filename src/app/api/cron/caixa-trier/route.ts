import { NextResponse } from "next/server";
import { rodarRoboDiario } from "@/lib/caixa/robo-diario";
import { createAdminClient } from "@/lib/supabase/admin";

// Robô diário dos caixas (vercel.json → crons, 4 rodadas de madrugada, antes do aviso de quebras das 7h30): busca
// no Trier os caixas de ontem e anteontem e os dias que ficaram faltando. Só a Vercel chama: ela manda
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
    const r = await rodarRoboDiario(admin, 255_000);
    console.log("[cron caixa-trier]", JSON.stringify(r));
    return NextResponse.json(r, { headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cron caixa-trier]", erro);
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
