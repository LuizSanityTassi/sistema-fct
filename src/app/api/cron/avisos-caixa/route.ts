import { NextResponse } from "next/server";
import { cronAutorizado } from "@/lib/seguranca/cron";
import { avisosLigados, enviarAvisos } from "@/lib/caixa/avisos";
import { createAdminClient } from "@/lib/supabase/admin";

// Rotina da manhã (vercel.json → crons, segunda a sábado ~7h30 de Brasília): avisa por e-mail cada gestor que tem
// quebra de caixa esperando justificativa. Só a Vercel chama: ela manda "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 120;
const semCache = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return NextResponse.json({ erro: "CRON_SECRET não configurado no servidor." }, { status: 503, headers: semCache });
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });
  if (!(await avisosLigados(admin))) return NextResponse.json({ pulado: "Avisos desligados na tela de Avisos por e-mail." }, { headers: semCache });

  try {
    const r = await enviarAvisos(admin, "automatico");
    return NextResponse.json(r, { headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cron avisos-caixa]", erro);
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
