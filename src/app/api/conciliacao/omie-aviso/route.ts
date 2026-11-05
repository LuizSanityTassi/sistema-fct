import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import { avisoDoEnvio, MAX_CONTAS_NO_AVISO } from "@/lib/conciliacao/aviso-envio";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { createClient } from "@/lib/supabase/server";

// Fim de um envio ao Omie: quem enviou recebe o resumo no sino. A tela é quem conduz o envio, em lotes, e por isso é ela que avisa.
const QTD = z.number().int().min(0);
const PEDIDO = z.object({
  conciliacao: z.uuid(),
  total: z.number().int().min(1),
  lancadas: QTD,
  jaNaOmie: QTD,
  vencidas: QTD,
  qtdErros: QTD,
  erros: z.array(z.object({ nome: z.string().max(2000), valor: z.number(), erro: z.string().max(4000) })).max(MAX_CONTAS_NO_AVISO),
  qtdBarradas: QTD,
  barradas: z.array(z.object({ nome: z.string().max(2000), valor: z.number(), motivo: z.string().max(4000) })).max(MAX_CONTAS_NO_AVISO),
  falhas: z.array(z.string().max(4000)).max(5),
  parado: z.boolean(),
});

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return NextResponse.json({ erro: "Só Administrador e Financeiro enviam ao Omie." }, { status: 403 });
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const { conciliacao, ...resumo } = pedido.data;
  const supabase = await createClient();
  const { error } = await supabase.from("avisos").insert({ user_id: sessao.id, tipo: "envio_omie", ...avisoDoEnvio(resumo), href: `/conciliacao/${conciliacao}?aba=omie` });
  if (error) {
    console.error("[omie-aviso]", error.message);
    return NextResponse.json({ erro: "Não consegui gravar o aviso." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
