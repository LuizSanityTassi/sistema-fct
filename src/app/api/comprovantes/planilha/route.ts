import { NextResponse } from "next/server";
import { getSessao, semAcesso } from "@/lib/auth/session";
import { TIPOS_VENDA, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { lerFiltrosComprovantes, linhasDaPlanilha } from "@/lib/data/comprovantes";
import { hojeIso } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import { gerarCsv, type Linha } from "@/lib/relatorios/csv";
import { formatarCnpj } from "@/lib/validacao/cnpj";

type FilialDoComprovante = { codigo: string; nome: string; cnpj: string | null; rede: { nome_fantasia: string | null } | null } | null;

// Comprovantes de venda em CSV (Excel pt-BR): os mesmos filtros e os mesmos dados da tela (RLS).
export async function GET(req: Request) {
  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, "/comprovantes", sessao.telasExtras, sessao.bloqueios)) semAcesso("/comprovantes");

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    sp[k] = v;
  });
  const filtros = lerFiltrosComprovantes(sp);
  const { linhas, anexos } = await linhasDaPlanilha(filtros);
  const origem = url.origin;

  const dados: Linha[] = linhas.map((c) => {
    const filial = c.filial as FilialDoComprovante;
    const arquivos = anexos.get(c.id) ?? [];
    return {
      rede: filial?.rede?.nome_fantasia ?? "",
      filial: filial ? `${filial.codigo} - ${filial.nome}` : "",
      cnpj: filial?.cnpj ? formatarCnpj(filial.cnpj) : "",
      cadastrado_por: c.criada_por_nome ?? "",
      tipo: TIPOS_VENDA[c.tipo as TipoVenda] ?? c.tipo,
      empresa: c.empresa ?? "",
      cliente: c.cliente,
      valor: Number(c.valor),
      parcelas: c.parcelas,
      data_compra: c.data_compra,
      numero_venda: c.numero_venda ?? "",
      situacao: c.situacao === "cancelado" ? `Cancelado: ${c.motivo_cancelamento ?? ""}` : "Ativo",
      anexo: arquivos.map((a) => `${origem}/api/arquivos/comprovante/${a.id}`).join(" "),
    };
  });
  const total = Math.round(dados.reduce((s, l) => s + Number(l.valor), 0) * 100) / 100;

  const csv = gerarCsv([
    {
      titulo: `Comprovantes de venda · compra de ${filtros.de.split("-").reverse().join("/")} a ${filtros.ate.split("-").reverse().join("/")}`,
      colunas: [
        { chave: "rede", titulo: "Rede" },
        { chave: "filial", titulo: "Filial" },
        { chave: "cnpj", titulo: "CNPJ" },
        { chave: "cadastrado_por", titulo: "Cadastrado por" },
        { chave: "tipo", titulo: "Tipo de venda" },
        { chave: "empresa", titulo: "Nome da empresa" },
        { chave: "cliente", titulo: "Nome do cliente" },
        { chave: "valor", titulo: "Total da venda", tipo: "moeda" },
        { chave: "parcelas", titulo: "Nº de parcelas", tipo: "inteiro" },
        { chave: "data_compra", titulo: "Data da compra", tipo: "data" },
        { chave: "numero_venda", titulo: "Nº da venda" },
        { chave: "situacao", titulo: "Situação" },
        { chave: "anexo", titulo: "Anexo (link)" },
      ],
      linhas: dados,
      totais: { rede: "Total", cliente: `${dados.length} ${dados.length === 1 ? "venda" : "vendas"}`, valor: total },
    },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="comprovantes-venda-${hojeIso()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
