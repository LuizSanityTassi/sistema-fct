import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessao } from "@/lib/auth/session";
import type { ConfigOmie } from "@/lib/conciliacao/omie";
import { CONFIG_OMIE_PADRAO, lancarPorApi } from "@/lib/conciliacao/omie-envio";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { LIMITE_LANCAMENTO_API } from "@/lib/conciliacao/rotulos";
import { obterConciliacao, obterConfig } from "@/lib/data/conciliacao";
import { createClient } from "@/lib/supabase/server";

// Um lote do envio ao Omie. A tela divide a seleção e chama esta rota por empresa, em paralelo; por ação do servidor
// as chamadas iriam uma de cada vez. O lançamento é por código de integração: repetir um lote não duplica título.
export const maxDuration = 300;

const PEDIDO = z.object({
  conciliacao: z.uuid(),
  chaves: z.array(z.string().min(1).max(80)).min(1).max(LIMITE_LANCAMENTO_API),
  cadastrar: z.boolean(),
});

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return NextResponse.json({ erro: "Só Administrador e Financeiro enviam ao Omie." }, { status: 403 });
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const { conciliacao, chaves, cadastrar } = pedido.data;
  const conc = await obterConciliacao(conciliacao);
  if (!conc) return NextResponse.json({ erro: "Conciliação não encontrada." }, { status: 404 });
  const cfg = await obterConfig<ConfigOmie>("omie", CONFIG_OMIE_PADRAO);
  try {
    const r = await lancarPorApi(await createClient(), sessao.id, conc, chaves, cfg, cadastrar);
    return NextResponse.json({
      lancadas: r.resultados.filter((x) => x.ok).length,
      adiadas: r.resultados.filter((x) => x.adiada).map((x) => x.chave),
      parada: r.resultados.find((x) => x.parada)?.erro ?? null,
      bloqueadas: r.bloqueadas.length,
      barradas: r.bloqueadas.map((b) => ({ chave: b.chave, motivo: b.motivo })),
      erros: [
        ...r.resultados.filter((x) => !x.ok && !x.adiada).map((x) => ({ nome: x.nome, valor: x.valor, erro: x.erro ?? "recusado" })),
        ...r.fora.map((x) => ({ nome: x.nome, valor: 0, erro: x.motivo })),
      ],
      modoTeste: r.modoTeste,
    });
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Não foi possível lançar na Omie." }, { status: 500 });
  }
}
