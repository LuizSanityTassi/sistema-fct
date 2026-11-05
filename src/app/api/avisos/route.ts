import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Marca como lidos os avisos do sino. O banco só deixa mexer nos da própria pessoa.
const PEDIDO = z.object({ ids: z.array(z.uuid()).min(1).max(50) });

export async function POST(req: Request) {
  await getSessao();
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const supabase = await createClient();
  const { error } = await supabase.from("avisos").update({ lida_em: new Date().toISOString() }).in("id", pedido.data.ids).is("lida_em", null);
  if (error) {
    console.error("[avisos]", error.message);
    return NextResponse.json({ erro: "Não consegui marcar como lido." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
