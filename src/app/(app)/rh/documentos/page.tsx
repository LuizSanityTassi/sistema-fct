import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Documentos" };

export default async function DocumentosPage() {
  await exigirAcesso("/rh/documentos");

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Documentos"
        descricao="Documentos dos funcionários guardados em armazenamento privado, com acesso por link temporário."
      />
      <EmConstrucao
        fase="Etapa 6"
        itens={[
          "Upload por categoria (contrato, RG, CPF, comprovantes…)",
          "Download por URL assinada com validade curta",
          "Controle de validade e alerta de vencimento",
          "Registro de quem enviou e quando",
        ]}
      />
    </>
  );
}
