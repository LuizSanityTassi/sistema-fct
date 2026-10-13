import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import {
  listarFuncionariosParaSelecao,
  listarOrganizacoes,
  listarRegionais,
  obterFilial,
} from "@/lib/data/filiais";
import { salvarFilial } from "../../actions";
import { FilialForm } from "../../filial-form";

export const metadata = { title: "Editar unidade" };

export default async function EditarFilialPage({ params }: PageProps<"/filiais/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/filiais"), params]);
  if (sessao.papel !== "admin") redirect(`/filiais/${id}`);

  const filial = await obterFilial(id);
  if (!filial) notFound();

  const [organizacoes, regionais, funcionarios] = await Promise.all([
    listarOrganizacoes(),
    listarRegionais(),
    listarFuncionariosParaSelecao(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Filiais" titulo={`Editar ${filial.codigo} — ${filial.nome}`} />
      <FilialForm
        action={salvarFilial.bind(null, filial.id)}
        organizacoes={organizacoes}
        regionais={regionais}
        funcionarios={funcionarios}
        valores={{
          organization_id: filial.organization_id,
          codigo: filial.codigo,
          nome: filial.nome,
          razao_social: filial.razao_social,
          cnpj: filial.cnpj,
          regional: filial.regional,
          cidade: filial.cidade,
          estado: filial.estado,
          endereco: filial.endereco,
          telefone: filial.telefone,
          email: filial.email,
          responsavel_employee_id: filial.responsavel_employee_id,
          responsavel_nome: filial.responsavel_nome,
        }}
        voltarPara={`/filiais/${filial.id}`}
      />
    </>
  );
}
