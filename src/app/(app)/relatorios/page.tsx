import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Relatórios" };

export default async function RelatoriosPage() {
  await exigirAcesso("/relatorios");

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Relatórios"
        descricao="Consolidados por filial e período, prontos para exportar."
      />
      <EmConstrucao
        fase="Fase futura"
        itens={[
          "Quadro de funcionários por filial",
          "ASO e documentos vencidos/a vencer",
          "Chamados por categoria e tempo de resposta",
          "Exportação em planilha",
        ]}
      />
    </>
  );
}
