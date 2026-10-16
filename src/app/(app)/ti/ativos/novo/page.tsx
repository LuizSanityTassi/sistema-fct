import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarFuncionariosParaSelecao } from "@/lib/data/filiais";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { salvarAtivo } from "../actions";
import { AtivoForm } from "../ativo-form";

export const metadata = { title: "Novo ativo" };

export default async function NovoAtivoPage({ searchParams }: PageProps<"/ti/ativos/novo">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ti/ativos"), searchParams]);
  if (sessao.papel !== "admin" && sessao.papel !== "ti") redirect("/ti/ativos");
  const [unidades, funcionarios] = await Promise.all([listarUnidadesParaSelecao(), listarFuncionariosParaSelecao()]);
  const filial = typeof sp.filial === "string" ? sp.filial : null;

  return (
    <>
      <PageHeader eyebrow="Tecnologia" titulo="Novo ativo" descricao="Equipamento de informática ou segurança de uma unidade." />
      <AtivoForm
        action={salvarAtivo.bind(null, null)}
        unidades={unidades.filter((u) => u.ativo || u.id === filial)}
        funcionarios={funcionarios}
        valores={{ branch_id: filial, status: "em_uso" }}
        voltarPara="/ti/ativos"
      />
    </>
  );
}
