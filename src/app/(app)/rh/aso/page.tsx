import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "ASO" };

export default async function AsoPage() {
  await exigirAcesso("/rh/aso");

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="ASO"
        descricao="Atestados de Saúde Ocupacional: admissional, periódico, retorno, mudança de função e demissional."
      />
      <EmConstrucao
        fase="Etapa 6"
        itens={[
          "Registro de exames por funcionário e tipo",
          "Vencimentos com alerta (30/15/0 dias)",
          "Anexo do laudo em armazenamento privado",
          "Visão por filial para o RH",
        ]}
      />
    </>
  );
}
