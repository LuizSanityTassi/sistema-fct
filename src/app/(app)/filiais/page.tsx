import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Filiais" };

export default async function FiliaisPage() {
  await exigirAcesso("/filiais");

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Filiais"
        descricao="Empresas, filiais e departamentos. A filial é a base de tudo no sistema."
      />
      <EmConstrucao
        fase="Etapa 4"
        itens={[
          "Empresas (razão social, CNPJ fictício, status)",
          "Filiais com código, endereço e responsável",
          "Departamentos por filial",
          "Inativação sem exclusão de histórico",
        ]}
      />
    </>
  );
}
