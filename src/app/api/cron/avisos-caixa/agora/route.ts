import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { enviarAvisos } from "@/lib/caixa/avisos";
import { createAdminClient } from "@/lib/supabase/admin";

// Aviso de quebra fora do horário, para UMA pessoa (ex.: responsável novo do televendas). Liberado por uma senha de
// uso único: o banco guarda só o hash em sistema_config 'aviso_quebra_agora' = {hash, perfil, expira}; a senha vale
// uma vez e some. Sem a chave (ou vencida), nada é enviado.
export const maxDuration = 60;
const semCache = { "Cache-Control": "no-store" };
const CHAVE = "aviso_quebra_agora";

export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ erro: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." }, { status: 503, headers: semCache });
  const { data: cfg } = await admin.from("sistema_config").select("valor").eq("chave", CHAVE).maybeSingle();
  const v = cfg?.valor as { hash?: string; perfil?: string; expira?: string } | null;
  const hash = createHash("sha256").update(token).digest("hex");
  const confere = !!v?.hash && token.length >= 32 && v.hash.length === hash.length && timingSafeEqual(Buffer.from(v.hash), Buffer.from(hash));
  if (!confere || !v?.perfil || !v.expira || Date.parse(v.expira) < Date.now()) return NextResponse.json({ erro: "Não autorizado." }, { status: 401, headers: semCache });
  // uso único: apaga antes de enviar
  await admin.from("sistema_config").delete().eq("chave", CHAVE);
  try {
    const r = await enviarAvisos(admin, "manual", v.perfil);
    return NextResponse.json(r, { headers: semCache });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[aviso-quebra-agora]", erro);
    return NextResponse.json({ erro }, { status: 500, headers: semCache });
  }
}
