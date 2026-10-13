import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Folha de pagamento" };

export default async function FolhaPage() {
  await exigirAcesso("/rh/folha");

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Folha de pagamento"
        descricao="Registros de folha por competência. Acesso restrito a Administrador e RH."
      />
      <EmConstrucao
        fase="Etapa 7"
        itens={[
          "Lançamentos por funcionário e competência (mês/ano)",
          "Proventos, descontos e líquido com valores numéricos",
          "Fechamento da competência (bloqueio de edição)",
          "Totais por filial",
        ]}
      />
    </>
  );
}
