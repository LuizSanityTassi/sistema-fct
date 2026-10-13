import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Chamados" };

export default async function ChamadosPage() {
  await exigirAcesso("/chamados");

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Chamados"
        descricao="Abertura e acompanhamento de chamados de TI, manutenção, RH, financeiro e outros."
      />
      <EmConstrucao
        fase="Etapa 8"
        itens={[
          "Abertura com categoria, prioridade e filial",
          "Fila com filtros por status, responsável e período",
          "Linha do tempo: comentários, mudanças de status e anexos",
          "Atribuição de responsável e encerramento",
        ]}
      />
    </>
  );
}
