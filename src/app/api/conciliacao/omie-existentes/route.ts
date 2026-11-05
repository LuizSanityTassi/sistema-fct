import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import { chavesOmie, listarContasPorStatus, listarTitulosDetalhados, listarTitulosOmie } from "@/lib/conciliacao/omie-api";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { createClient } from "@/lib/supabase/server";

// Uma página dos títulos a pagar que já estão na Omie, por vencimento. A tela consulta antes de lançar: o que já está lá
// não é enviado de novo (a Omie recusa alterar conta paga ou de período contábil fechado e bloqueia a API se errar muito).
export const maxDuration = 60;

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const PEDIDO = z.object({ empresa: z.enum(["nazario", "varela"]), de: z.string().regex(DIA), ate: z.string().regex(DIA), pagina: z.number().int().min(1), detalhe: z.boolean().optional(), status: z.enum(["AVENCER", "VENCEHOJE"]).optional() });
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return NextResponse.json({ erro: "Só Administrador e Financeiro enviam ao Omie." }, { status: 403 });
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const { empresa, de, ate, pagina, detalhe, status } = pedido.data;
  const ch = await chavesOmie(await createClient(), empresa);
  if (!ch) return NextResponse.json({ erro: "Esta empresa ainda não tem chave da Omie configurada." }, { status: 400 });
  try {
    if (status) return NextResponse.json(await listarContasPorStatus(ch, empresa, status, pagina));
    return NextResponse.json(await (detalhe ? listarTitulosDetalhados : listarTitulosOmie)(ch, empresa, br(de), br(ate), pagina));
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não consegui consultar a Omie." }, { status: 502 });
  }
}
