import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarSalarios, listarUnidadesParaSelecao, obterFuncionario } from "@/lib/data/funcionarios";
import { salvarFuncionario } from "../../actions";
import { FuncionarioForm } from "../../funcionario-form";

export const metadata = { title: "Editar funcionário" };

export default async function EditarFuncionarioPage({ params }: PageProps<"/rh/funcionarios/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/rh/funcionarios"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect(`/rh/funcionarios/${id}`);

  const f = await obterFuncionario(id);
  if (!f) notFound();
  const [unidades, salarios] = await Promise.all([listarUnidadesParaSelecao(), listarSalarios(id)]);
  const vigente = salarios.find((s) => !s.vigencia_fim) ?? salarios[0];

  return (
    <>
      <PageHeader eyebrow="Recursos Humanos" titulo={`Editar ${f.nome}`} />
      <FuncionarioForm
        action={salvarFuncionario.bind(null, f.id)}
        unidades={unidades.filter((u) => u.ativo || u.id === f.branch_id)}
        valores={{
          branch_id: f.branch_id,
          nome: f.nome,
          matricula: f.matricula,
          cpf: f.cpf,
          data_nascimento: f.data_nascimento,
          email: f.email,
          telefone: f.telefone,
          cargo: f.cargo,
          tipo_contrato: f.tipo_contrato,
          categoria: f.categoria,
          horas_mes: f.horas_mes,
          num_filhos: f.num_filhos,
          num_dependentes: f.num_dependentes,
          contribui_sindicato: f.contribui_sindicato,
          optante_fgts: f.optante_fgts,
          data_admissao: f.data_admissao,
          observacoes: f.observacoes,
          salario: vigente ? String(vigente.salario).replace(".", ",") : null,
        }}
        podeSalario
        voltarPara={`/rh/funcionarios/${f.id}`}
      />
    </>
  );
}
