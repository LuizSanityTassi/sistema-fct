import { NextResponse } from "next/server";
import { credenciaisTrierServico } from "@/lib/integracoes/segredos";
import { createAdminClient } from "@/lib/supabase/admin";
import { coletarVendas, pedidosDoRoboVendas } from "@/lib/vendas/coleta";

// Robô diário das vendas (vercel.json → crons, de madrugada): busca no Trier os relatórios de vendas de ontem
// (todas as filiais) e os dias da última semana que ficaram sem leitura. Só a Vercel chama: ela manda
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
    const cred = await credenciaisTrierServico(admin);
    if (!cred.usuario || !cred.senha) return NextResponse.json({ pulado: "O robô do Trier não tem usuário e senha (Administração → Integrações)." }, { headers: semCache });
    const pedidos = await pedidosDoRoboVendas(admin);
    if (!pedidos.length) return NextResponse.json({ pulado: "Nada para buscar: os últimos dias já foram lidos." }, { headers: semCache });
    const r = await coletarVendas(admin, cred, pedidos, null, 255_000);
    const resumo = { pedidos: pedidos.length, ok: r.ok, vazios: r.vazios, erros: r.erros.length, faltam: r.restantes.length, ms: r.ms, primeirosErros: r.erros.slice(0, 5).map((e) => `${e.relatorio} ${e.de}: ${e.erro}`) };
    console.log("[cron vendas-trier]", JSON.stringify(resumo));
    return NextResponse.json(resumo, { headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cron vendas-trier]", erro);
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
