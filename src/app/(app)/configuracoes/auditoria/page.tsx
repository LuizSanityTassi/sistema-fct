import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Auditoria" };

export default async function AuditoriaPage() {
  await exigirAcesso("/configuracoes/auditoria");

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        titulo="Auditoria"
        descricao="Quem alterou o quê, quando — com valor anterior e novo."
      />
      <EmConstrucao
        fase="Etapa 9"
        itens={[
          "Registro automático de criações, edições e exclusões",
          "Filtros por usuário, tabela, filial e período",
          "Comparação do antes e depois de cada alteração",
          "Sem dados sensíveis (senhas/tokens) nos registros",
        ]}
      />
    </>
  );
}
