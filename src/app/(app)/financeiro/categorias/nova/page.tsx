import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarCategorias, opcoesClassificacao } from "@/lib/data/financeiro";
import { podeEditarCategorias } from "@/lib/financeiro/permissoes";
import { salvarCategoria } from "../actions";
import { CategoriaForm } from "../categoria-form";

export const metadata = { title: "Nova categoria" };

export default async function NovaCategoriaPage() {
  const sessao = await exigirAcesso("/financeiro/categorias");
  if (!podeEditarCategorias(sessao.papel)) redirect("/financeiro/categorias");
  const categorias = await listarCategorias();

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo="Nova categoria" descricao="Grupo e nome identificam a categoria; a classificação diz onde ela entra na DRE e na visão financeira." />
      <CategoriaForm action={salvarCategoria.bind(null, null)} opcoes={opcoesClassificacao(categorias)} modo="nova" />
    </>
  );
}
