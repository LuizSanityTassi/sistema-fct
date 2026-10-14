import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarCategorias, listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { salvarLancamento } from "../actions";
import { LancamentoForm } from "../lancamento-form";

export const metadata = { title: "Novo lançamento" };

export default async function NovoLancamentoPage({ searchParams }: PageProps<"/financeiro/lancamentos/novo">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/lancamentos"), searchParams]);
  if (!podeLancar(sessao.papel)) redirect("/financeiro/lancamentos");
  const [unidades, categorias] = await Promise.all([listarUnidadesFinanceiro(), listarCategorias()]);
  const filial = typeof sp.filial === "string" ? sp.filial : null;
  const tipo = sp.tipo === "receber" ? "receber" : "pagar";

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Novo lançamento"
        descricao="Entrada ou saída já realizada em uma unidade. A competência é o mês da data informada."
      />
      <LancamentoForm
        action={salvarLancamento.bind(null, null)}
        unidades={unidades.filter((u) => u.ativo || u.id === filial)}
        categorias={categorias}
        valores={{ branch_id: filial, tipo }}
        voltarPara="/financeiro/lancamentos"
      />
    </>
  );
}
