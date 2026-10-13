import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "TI" };

export default async function TiPage() {
  await exigirAcesso("/ti");

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="TI"
        descricao="Fila de chamados de TI, ativos (equipamentos) e controle de acessos."
      />
      <EmConstrucao
        fase="Fase futura"
        itens={[
          "Fila de TI a partir do módulo de chamados",
          "Inventário de equipamentos por filial",
          "Solicitações de acesso a sistemas",
          "Indicadores de atendimento",
        ]}
      />
    </>
  );
}
