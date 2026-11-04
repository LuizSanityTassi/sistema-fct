import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import { marcarJaNaOmie } from "@/lib/conciliacao/omie-envio";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { obterConciliacao } from "@/lib/data/conciliacao";
import { createClient } from "@/lib/supabase/server";

// Marca como enviadas as contas que a consulta achou na Omie: elas saem de "a enviar" sem mexer no título de lá.
export const maxDuration = 120;

const PEDIDO = z.object({
  conciliacao: z.uuid(),
  contas: z.array(z.object({ chave: z.string().min(1).max(80), codigo: z.string().min(1).max(30) })).min(1).max(500),
});

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return NextResponse.json({ erro: "Só Administrador e Financeiro enviam ao Omie." }, { status: 403 });
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const conc = await obterConciliacao(pedido.data.conciliacao);
  if (!conc) return NextResponse.json({ erro: "Conciliação não encontrada." }, { status: 404 });
  try {
    return NextResponse.json({ marcadas: await marcarJaNaOmie(await createClient(), sessao.id, conc, pedido.data.contas) });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não consegui marcar as contas." }, { status: 500 });
  }
}
