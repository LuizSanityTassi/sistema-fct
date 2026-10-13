import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarFuncionariosParaSelecao } from "@/lib/data/filiais";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { obterAtivo } from "@/lib/data/ti";
import { salvarAtivo } from "../../actions";
import { AtivoForm } from "../../ativo-form";

export const metadata = { title: "Editar ativo" };

export default async function EditarAtivoPage({ params }: PageProps<"/ti/ativos/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/ti/ativos"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "ti") redirect(`/ti/ativos/${id}`);
  const a = await obterAtivo(id);
  if (!a) notFound();
  const [unidades, funcionarios] = await Promise.all([listarUnidadesParaSelecao(), listarFuncionariosParaSelecao()]);

  return (
    <>
      <PageHeader eyebrow="TI" titulo={`Editar ${a.descricao}`} />
      <AtivoForm
        action={salvarAtivo.bind(null, a.id)}
        unidades={unidades.filter((u) => u.ativo || u.id === a.branch_id)}
        funcionarios={funcionarios}
        valores={{
          branch_id: a.branch_id,
          tipo: a.tipo,
          descricao: a.descricao,
          patrimonio: a.patrimonio,
          numero_serie: a.numero_serie,
          status: a.status,
          responsavel_employee_id: a.responsavel_employee_id,
          data_aquisicao: a.data_aquisicao,
          valor: a.valor,
          fornecedor: a.fornecedor,
          observacoes: a.observacoes,
        }}
        voltarPara={`/ti/ativos/${a.id}`}
      />
    </>
  );
}
