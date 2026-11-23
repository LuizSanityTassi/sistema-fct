import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarGerentesOpcoes, listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { salvarFuncionario } from "../actions";
import { FuncionarioForm } from "../funcionario-form";

export const metadata = { title: "Novo funcionário" };

export default async function NovoFuncionarioPage({ searchParams }: PageProps<"/rh/funcionarios/novo">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/rh/funcionarios"), searchParams]);
  if (sessao.papel !== "admin" && sessao.papel !== "rh") redirect("/rh/funcionarios?erro=sem_permissao");

  const [unidades, gerentes] = await Promise.all([listarUnidadesParaSelecao(), listarGerentesOpcoes()]);
  const filialInicial = typeof sp.filial === "string" ? sp.filial : null;

  return (
    <>
      <PageHeader eyebrow="Pessoas" titulo="Novo funcionário" descricao="Admissão de um funcionário em uma unidade." />
      <FuncionarioForm
        action={salvarFuncionario.bind(null, null)}
        unidades={unidades.filter((u) => u.ativo || u.id === filialInicial)}
        gerentes={gerentes}
        valores={{ branch_id: filialInicial, categoria: "Mensalista", tipo_contrato: "clt", horas_mes: 220 }}
        podeSalario
        voltarPara="/rh/funcionarios"
      />
    </>
  );
}
