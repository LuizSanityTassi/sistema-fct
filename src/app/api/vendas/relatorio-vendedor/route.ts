import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { gerarRelatorioAvulsoTrier, type PassoAntesTrier } from "@/lib/conciliacao/trier-robo";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import type { Json } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

// Relatório avulso do Trier, só para o administrador: Relatórios > Vendas > Vendas por Vendedor (Rel_0028) de um
// vendedor, com ou sem filtro de laboratório (fabricante), agrupado por filial — "laboratorio" = totais por vendedor e
// laboratório; "produtos" = totais por vendedor e produtos. Vendas menos devoluções. Só leitura no Trier. O Excel e as
// linhas lidas ficam em integracao_diagnosticos (resumo.tema = "relatorio_avulso"), para montar a planilha pedida.
export const maxDuration = 300;

const PEDIDO = z.object({
  vendedor: z.object({ codigo: z.number().int().positive(), nome: z.string().min(1).max(60) }),
  laboratorios: z.array(z.object({ codigo: z.number().int().positive(), nome: z.string().min(1).max(60) })).max(20).default([]),
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(["laboratorio", "produtos"]),
});

const opcao = (cod: number) => new RegExp(`createSelectOption\\('${cod} - [^']*',\\s*'${cod}'\\)`);

export async function POST(req: Request) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return NextResponse.json({ erro: "Só o administrador gera relatório avulso do Trier." }, { status: 403 });
  const pedido = PEDIDO.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  const { vendedor, laboratorios, de, ate, tipo } = pedido.data;
  if (ate < de) return NextResponse.json({ erro: "A data final vem antes da inicial." }, { status: 400 });

  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return NextResponse.json({ erro: "O robô do Trier não está configurado." }, { status: 400 });

  const antes: PassoAntesTrier[] = [
    // a tela avisa o servidor quando muda o tipo do relatório
    { acao: "changeSelRelatorio" },
    {
      acao: "addUsuar",
      campos: { cod_usuarioEntrada: String(vendedor.codigo), cod_usuario: String(vendedor.codigo), cadusuar_usuario_nom_usuario: vendedor.nome.toUpperCase() },
      confere: opcao(vendedor.codigo),
      falha: `o Trier não confirmou o vendedor ${vendedor.codigo}`,
    },
    ...laboratorios.map((l) => ({
      acao: "addLabor",
      campos: { cod_laboratEntrada: String(l.codigo), cod_laborat: String(l.codigo), cadlabor_laborat_nom_laborat: l.nome.toUpperCase() },
      confere: opcao(l.codigo),
      falha: `o Trier não confirmou o laboratório ${l.codigo} ${l.nome}`,
    })),
  ];
  const cfg = {
    pagina: "Rel_0028.pod",
    rotulo: "Vendas por Vendedor",
    ajustes: { agrup_fil: "2", sel_relatorio: tipo === "produtos" ? "8" : "4", sel_vendas: "2", chk_vendastel: "N", consid_usuario: "true", consid_labor: "true" },
    antes,
  };

  let r;
  try {
    r = await gerarRelatorioAvulsoTrier(cred, cfg, de, ate, 270_000);
  } catch (e) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  let matriz: unknown[][] = [];
  if ("xlsx" in r && r.xlsx) {
    const wb = XLSX.read(r.xlsx, { type: "buffer" });
    matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
  }
  const resumo = { tema: "relatorio_avulso", relatorio: "Rel_0028", tipo, vendedor, laboratorios, de, ate, linhas: matriz.length, sem_movimento: "semMovimento" in r, ms: r.ms };
  const { data, error } = await supabase
    .from("integracao_diagnosticos")
    .insert({ sistema: "trier", resumo: resumo as unknown as Json, dados: { matriz, xlsx_b64: "xlsx" in r && r.xlsx ? r.xlsx.toString("base64") : null } as unknown as Json, criado_por: sessao.id })
    .select("id")
    .single();
  if (error) return NextResponse.json({ erro: `Gerei o relatório, mas não consegui guardar: ${error.message}` }, { status: 500 });
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "integracoes", novo: { relatorio_avulso_trier: { tipo, vendedor: vendedor.codigo, laboratorios: laboratorios.map((l) => l.codigo), de, ate } } });
  return NextResponse.json({ id: data.id, linhas: matriz.length, semMovimento: "semMovimento" in r });
}
