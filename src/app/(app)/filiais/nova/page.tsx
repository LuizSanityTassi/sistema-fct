import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarFuncionariosParaSelecao, listarOrganizacoes, listarRegionais } from "@/lib/data/filiais";
import { salvarFilial } from "../actions";
import { FilialForm } from "../filial-form";

export const metadata = { title: "Nova unidade" };

export default async function NovaFilialPage() {
  const sessao = await exigirAcesso("/filiais");
  if (sessao.papel !== "admin") redirect("/filiais?erro=sem_permissao");

  const [organizacoes, regionais, funcionarios] = await Promise.all([
    listarOrganizacoes(),
    listarRegionais(),
    listarFuncionariosParaSelecao(),
  ]);

  return (
    <>
      <PageHeader eyebrow="Filiais" titulo="Nova unidade" descricao="Loja, empresa de apoio ou unidade administrativa de um dos grupos." />
      <FilialForm
        action={salvarFilial.bind(null, null)}
        organizacoes={organizacoes}
        regionais={regionais}
        funcionarios={funcionarios}
        valores={{ estado: "SC" }}
        voltarPara="/filiais"
      />
    </>
  );
}
