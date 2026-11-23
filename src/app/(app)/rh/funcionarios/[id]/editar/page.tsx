import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarGerentesOpcoes, listarSalarios, listarUnidadesParaSelecao, obterFuncionario } from "@/lib/data/funcionarios";
import { salvarFuncionario } from "../../actions";
import { FuncionarioForm } from "../../funcionario-form";

export const metadata = { title: "Editar funcionário" };

export default async function EditarFuncionarioPage({ params }: PageProps<"/rh/funcionarios/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/rh/funcionarios"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect(`/rh/funcionarios/${id}`);

  const f = await obterFuncionario(id);
  if (!f) notFound();
  const [unidades, salarios, gerentes] = await Promise.all([listarUnidadesParaSelecao(), listarSalarios(id), listarGerentesOpcoes(f.gerente_employee_id)]);
  const vigente = salarios.find((s) => !s.vigencia_fim) ?? salarios[0];

  return (
    <>
      <PageHeader eyebrow="Pessoas" titulo={`Editar ${f.nome}`} />
      <FuncionarioForm
        action={salvarFuncionario.bind(null, f.id)}
        unidades={unidades.filter((u) => u.ativo || u.id === f.branch_id || u.id === f.ponto_branch_id)}
        gerentes={gerentes.filter((g) => g.id !== f.id)}
        valores={{
          branch_id: f.branch_id,
          ponto_branch_id: f.ponto_branch_id,
          gerente_employee_id: f.gerente_employee_id,
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
          pis: f.pis,
          nome_mae: f.nome_mae,
          nome_pai: f.nome_pai,
          endereco: f.endereco,
          endereco_numero: f.endereco_numero,
          bairro: f.bairro,
          cidade: f.cidade,
          uf: f.uf,
          cep: f.cep,
          celular: f.celular,
          escolaridade: f.escolaridade,
          estado_civil: f.estado_civil,
          rg: f.rg,
          rg_emissao: f.rg_emissao,
          rg_emissor: f.rg_emissor,
          rg_uf: f.rg_uf,
          raca_cor: f.raca_cor,
          titulo_eleitor: f.titulo_eleitor,
          titulo_zona: f.titulo_zona,
          titulo_secao: f.titulo_secao,
          cnh: f.cnh,
          cnh_emissao: f.cnh_emissao,
          cnh_vencimento: f.cnh_vencimento,
          cnh_categoria: f.cnh_categoria,
          reservista: f.reservista,
          reservista_categoria: f.reservista_categoria,
          horario_trabalho: f.horario_trabalho,
          periodo_experiencia: f.periodo_experiencia,
          adicionais: f.adicionais,
          salario: vigente ? String(vigente.salario).replace(".", ",") : null,
        }}
        podeSalario
        voltarPara={`/rh/funcionarios/${f.id}`}
      />
    </>
  );
}
