import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Usuários" };

export default async function UsuariosPage() {
  await exigirAcesso("/configuracoes/usuarios");

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        titulo="Usuários"
        descricao="Quem acessa o sistema, com qual papel e em quais filiais."
      />
      <EmConstrucao
        fase="Etapa 9"
        itens={[
          "Convite por e-mail e definição do papel",
          "Filial padrão e filiais adicionais por usuário",
          "Ativação/desativação de acesso",
          "Último acesso e histórico de alterações",
        ]}
      />
    </>
  );
}
