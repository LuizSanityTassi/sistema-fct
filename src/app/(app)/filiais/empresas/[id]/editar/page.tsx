import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { obterOrganizacao } from "@/lib/data/filiais";
import { salvarOrganizacao } from "../../../actions";
import { OrganizacaoForm } from "../../organizacao-form";

export const metadata = { title: "Editar grupo" };

export default async function EditarOrganizacaoPage({ params }: PageProps<"/filiais/empresas/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/filiais"), params]);
  if (sessao.papel !== "admin") redirect("/filiais?erro=sem_permissao");

  const organizacao = await obterOrganizacao(id);
  if (!organizacao) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Filiais"
        titulo={`Editar grupo ${organizacao.nome_fantasia ?? ""}`.trim()}
        descricao="Dados da empresa principal do grupo. As unidades continuam vinculadas."
      />
      <OrganizacaoForm
        action={salvarOrganizacao.bind(null, organizacao.id)}
        valores={{
          razao_social: organizacao.razao_social,
          nome_fantasia: organizacao.nome_fantasia,
          cnpj: organizacao.cnpj,
        }}
      />
    </>
  );
}
