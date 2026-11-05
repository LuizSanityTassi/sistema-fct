import JSZip from "jszip";
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao, semAcesso } from "@/lib/auth/session";
import { carregarCompetencia } from "@/lib/data/lancamentos-folha";
import { podeAcessar } from "@/lib/nav";
import { competenciaValida } from "@/lib/rh/competencia";
import { gerarPlanilhas } from "@/lib/rh/exportar-lancamentos";
import { createClient } from "@/lib/supabase/server";

// Planilha(s) da contabilidade (Domínio) de uma competência:
//   ?competencia=AAAA-MM&filial=<id>    → o .xls daquele CNPJ ("32 SETEMBRO.xls")
//   ?competencia=AAAA-MM&empresa=<raiz> → .zip com um .xls por CNPJ da empresa (sem empresa: todas, uma pasta por empresa)
function anexo(nome: string) {
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export async function GET(req: Request) {
  const sessao = await getSessao();
  // a planilha da contabilidade é do RH: o gerente só consulta os lançamentos na tela
  if (sessao.papel === "gerente" || !podeAcessar(sessao.papel, "/rh/lancamentos", sessao.telasExtras, sessao.bloqueios)) semAcesso("/rh/lancamentos");

  const url = new URL(req.url);
  const competencia = url.searchParams.get("competencia");
  if (!competenciaValida(competencia)) return new NextResponse("Competência inválida", { status: 400 });
  const filial = url.searchParams.get("filial") ?? "";
  const empresa = url.searchParams.get("empresa") ?? "";
  const voltar = (erro: string) =>
    redirect(`/rh/lancamentos?${new URLSearchParams({ competencia, ...(empresa ? { empresa } : {}), ...(filial ? { filial } : {}), erro })}`);

  const supabase = await createClient();
  const dados = await carregarCompetencia(supabase, competencia);
  const planilhas = gerarPlanilhas(dados, filial ? { branchId: filial } : empresa ? { raiz: empresa } : {});
  const prontas = planilhas.filter((p) => p.buffer);

  if (filial) {
    const p = planilhas[0];
    if (!p) return voltar("Nenhum funcionário desta filial no mês.");
    if (!p.buffer) return voltar(`Não foi possível gerar ${p.arquivo}: ${p.erro}.`);
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "exportar",
      entidade: "folha_lancamentos",
      novo: { competencia, arquivos: [p.arquivo], filial: p.filial.codigo, funcionarios: p.funcionarios },
    });
    return new NextResponse(new Uint8Array(p.buffer!), {
      headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": anexo(p.arquivo), "Cache-Control": "no-store" },
    });
  }

  if (prontas.length === 0) {
    return voltar(planilhas.length ? `Nenhuma planilha pôde ser gerada: ${planilhas.map((p) => `${p.filial.codigo} (${p.erro})`).join(", ")}.` : "Nenhum funcionário no mês.");
  }
  const zip = new JSZip();
  const umaEmpresa = new Set(prontas.map((p) => p.filial.empresa)).size === 1;
  for (const p of prontas) zip.file(umaEmpresa ? p.arquivo : `${p.filial.empresa}/${p.arquivo}`, p.buffer!);
  const problemas = planilhas.filter((p) => p.erro || p.foraDaPlanilha || p.codigoProvisorio);
  if (problemas.length) {
    const linhas = problemas.map((p) =>
      [`${p.filial.codigo} ${p.filial.nome} (${p.filial.cnpj ?? "sem CNPJ"})`, p.erro ? `NÃO GERADA: ${p.erro}` : null, p.codigoProvisorio ? "código da empresa provisório (número da filial no CNPJ): confirmar com a contabilidade" : null, p.foraDaPlanilha ? `${p.foraDaPlanilha} valor(es) em evento sem código da Domínio ficaram fora` : null]
        .filter(Boolean)
        .join(" — "),
    );
    zip.file("LEIA-ME.txt", `Competência ${competencia}\r\n\r\n${linhas.join("\r\n")}\r\n`);
  }
  const buffer = await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
  const nomeEmpresa = umaEmpresa ? ` ${prontas[0].filial.empresa}` : "";
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "exportar",
    entidade: "folha_lancamentos",
    novo: { competencia, arquivos: prontas.map((p) => p.arquivo), nao_geradas: planilhas.filter((p) => p.erro).map((p) => p.filial.codigo) },
  });
  return new NextResponse(buffer, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": anexo(`Folha ${competencia}${nomeEmpresa}.zip`), "Cache-Control": "no-store" },
  });
}
