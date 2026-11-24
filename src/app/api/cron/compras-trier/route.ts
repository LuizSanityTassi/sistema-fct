import { NextResponse } from "next/server";
import { importarEspelhoPdf } from "@/lib/compras/importar-espelho";
import { buscarEspelhoNotasTrier } from "@/lib/conciliacao/trier-robo";
import { credenciaisTrierServico } from "@/lib/integracoes/segredos";
import { cronAutorizado } from "@/lib/seguranca/cron";
import { createAdminClient } from "@/lib/supabase/admin";

// Robô das notas de entrada (vercel.json → crons): gera no Trier o "Espelho Nota Fiscal Entrada" (Rel_0005) de todas
// as filiais e importa em Compras. Às 7h busca ontem e hoje (pega as notas lançadas depois da última passada); às 15h,
// só hoje. Reimportar nunca duplica (a nota é atualizada). Só a Vercel chama: "Authorization: Bearer <CRON_SECRET>".
export const maxDuration = 300;
const semCache = { "Cache-Control": "no-store" };
const diaBrasil = (atrasDias = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - atrasDias * 86_400_000));

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ erro: "CRON_SECRET não configurado no servidor." }, { status: 503, headers: semCache });
  if (!cronAutorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });

  const hoje = diaBrasil();
  // de manhã (antes das 12h de Brasília) inclui ontem; à tarde, só hoje
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date()));
  const de = hora < 12 ? diaBrasil(1) : hoje;
  try {
    const cred = await credenciaisTrierServico(admin);
    if (!cred.usuario || !cred.senha) return NextResponse.json({ pulado: "O robô do Trier não tem usuário e senha (Administração → Integrações)." }, { headers: semCache });
    const gerado = await buscarEspelhoNotasTrier(cred, de, hoje, 210_000);
    if ("semMovimento" in gerado) return NextResponse.json({ de, ate: hoje, semMovimento: true }, { headers: semCache });
    const nome = `Trier espelho notas ${de.split("-").reverse().join("-")} a ${hoje.split("-").reverse().join("-")}.pdf`;
    const r = await importarEspelhoPdf(admin, new Uint8Array(gerado.pdf), nome, "Robô do Trier", "robo");
    const resumo = { de, ate: hoje, trierMs: gerado.ms, erro: r.erro, ok: r.ok, avisos: r.avisos.length };
    console.log("[cron compras-trier]", JSON.stringify(resumo));
    return NextResponse.json(resumo, { status: r.erro ? 500 : 200, headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[cron compras-trier]", erro);
    // a falha fica registrada para o Compras ver em Importar
    await admin.from("cmp_importacoes").insert({ tipo: "notas", arquivo: `Robô do Trier ${de} a ${hoje}`, criado_por_nome: "Robô do Trier", resumo: { origem: "robo", erro: erro.slice(0, 500) } });
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
