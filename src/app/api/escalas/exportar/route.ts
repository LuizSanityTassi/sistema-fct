import { NextResponse } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { opcoesDoLote, simulacoesPorIds } from "@/lib/data/escalas";
import { gerarExcelEscala } from "@/lib/escalas/excel";
import { podeAcessar } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Excel da escala 5x2. ?id=<opção>[&pessoa=<colaborador>] ou ?lote=<geração>&opcao=N (a mesma opção de todas as filiais).
export async function GET(req: Request) {
  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, "/escalas", sessao.telasExtras, sessao.bloqueios)) return new NextResponse("Sem acesso.", { status: 403 });
  const sp = new URL(req.url).searchParams;
  const id = sp.get("id") ?? "";
  const lote = sp.get("lote") ?? "";
  const opcao = Number(sp.get("opcao"));
  const pessoa = sp.get("pessoa") ?? "";
  let ids: string[] = [];
  if (UUID.test(id)) ids = [id];
  else if (UUID.test(lote) && Number.isInteger(opcao)) ids = (await opcoesDoLote(lote)).filter((r) => r.opcao === opcao).map((r) => r.id);
  if (!ids.length) return new NextResponse("Escolha a opção da escala.", { status: 400 });
  const sims = await simulacoesPorIds(ids);
  if (!sims.length) return new NextResponse("Escala não encontrada.", { status: 404 });
  const individual = UUID.test(pessoa) && sims.length === 1 && sims[0].equipe.some((p) => p.id === pessoa) ? pessoa : undefined;

  const s = sims[0];
  const quem = individual ? `-${s.equipe.find((p) => p.id === individual)!.nome.split(" ")[0].toLowerCase()}` : "";
  const onde = sims.length === 1 ? s.filial.codigo : `${sims.length}-filiais`;
  const situacao = sims.every((x) => x.situacao === "oficial") ? "oficial" : sims.some((x) => x.alertas.length) ? "rascunho-com-pendencias" : "rascunho";
  const nome = `escala-5x2-${onde}-${s.ano}-${String(s.mes).padStart(2, "0")}-opcao${s.opcao}${quem}-${situacao}.xlsx`.normalize("NFD").replace(/[^\w.-]/g, "");

  const supabase = await createClient();
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "exportar", entidade: "esc_simulacoes", registroId: sims.length === 1 ? s.id : lote, novo: { formato: "xlsx", filiais: sims.length, individual: !!individual } });
  return new NextResponse(new Uint8Array(gerarExcelEscala(sims, individual)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
