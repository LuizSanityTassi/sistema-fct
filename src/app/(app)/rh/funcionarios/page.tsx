import { EmConstrucao } from "@/components/layout/em-construcao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";

export const metadata = { title: "Funcionários" };

export default async function FuncionariosPage() {
  await exigirAcesso("/rh/funcionarios");

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Funcionários"
        descricao="Cadastro, situação e histórico dos funcionários — sempre vinculados a uma filial."
      />
      <EmConstrucao
        fase="Etapa 5"
        itens={[
          "Lista com busca, filtros por filial/status/departamento e paginação",
          "Cadastro e edição com validação no servidor",
          "Ficha do funcionário com documentos, ASO e folha",
          "Desligamento com histórico (sem apagar registros)",
        ]}
      />
    </>
  );
}
