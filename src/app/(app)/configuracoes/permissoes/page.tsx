import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Permissões" };

export default async function PermissoesPage() {
  await exigirAcesso("/configuracoes/permissoes");

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        titulo="Permissões"
        descricao="O que cada papel pode ver e fazer em cada módulo."
      />
      <EmConstrucao
        fase="Etapa 9"
        itens={[
          "Matriz papel × módulo (ver, criar, editar, excluir)",
          "Visualização das regras aplicadas no banco (RLS)",
          "Explicação de cada papel para o administrador",
        ]}
      />
    </>
  );
}
