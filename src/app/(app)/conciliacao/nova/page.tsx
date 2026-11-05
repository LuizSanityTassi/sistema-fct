import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { FAIXAS_PADRAO } from "@/lib/conciliacao/rotulos";
import { arquivosParaConciliar, obterConfig } from "@/lib/data/conciliacao";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { conciliar } from "../actions";
import { NovaConciliacaoForm, type ArquivoOpcao, type Faixa } from "./nova-form";

export const metadata = { title: "Nova conciliação" };
// com todos os arquivos do banco e o relatório geral do Trier, leva uns minutos para ler e gravar
export const maxDuration = 300;

function opcao(a: { id: string; nome: string; tipo: string; filial: number | null; meta: unknown; enviado_em: string }): ArquivoOpcao {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  const partes: string[] = [];
  if (m.qtd != null) partes.push(`${m.qtd} ${a.tipo === "trier" ? "títulos" : "boletos"}`);
  if (m.total != null) partes.push(formatarMoeda(Number(m.total)));
  if (m.vencIni) partes.push(`venc. ${formatarData(String(m.vencIni))}–${formatarData(String(m.vencFim))}`);
  if (m.geracao) partes.push(`gerado ${formatarData(String(m.geracao))}`);
  if (Array.isArray(m.filiais) && m.filiais.length > 1) partes.push(`filiais ${(m.filiais as number[]).join(", ")}`);
  partes.push(`enviado ${formatarData(a.enviado_em)}`);
  return { id: a.id, nome: a.nome, tipo: a.tipo, filial: a.filial, resumo: partes.join(" · "), enviadoEm: a.enviado_em };
}

export default async function NovaConciliacaoPage() {
  const sessao = await exigirAcesso("/conciliacao");
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao");
  const [arquivos, faixas] = await Promise.all([arquivosParaConciliar(), obterConfig<Faixa[]>("faixas", FAIXAS_PADRAO)]);

  return (
    <>
      <PageHeader eyebrow="DDA x Trier" titulo="Nova conciliação" descricao="Escolha os arquivos do banco e do Trier e a faixa de filiais. O resultado fica guardado com as pendências." />
      <NovaConciliacaoForm action={conciliar} dda={arquivos.dda.map(opcao)} trier={arquivos.trier.map(opcao)} faixas={faixas} />
    </>
  );
}
