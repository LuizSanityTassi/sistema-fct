import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarCategorias, obterCategoria, opcoesClassificacao } from "@/lib/data/financeiro";
import { podeEditarCategorias } from "@/lib/financeiro/permissoes";
import { TIPO_FIN_LABEL } from "@/lib/financeiro/rotulos";
import { salvarCategoria } from "../../actions";
import { CategoriaForm } from "../../categoria-form";

export const metadata = { title: "Editar categoria" };

export default async function EditarCategoriaPage({ params }: PageProps<"/financeiro/categorias/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/financeiro/categorias"), params]);
  if (!podeEditarCategorias(sessao.papel)) redirect("/financeiro/categorias");
  const [c, categorias] = await Promise.all([obterCategoria(id), listarCategorias()]);
  if (!c) notFound();

  return (
    <>
      <PageHeader eyebrow="Financeiro" titulo={`Editar ${c.nome}`} descricao={`${TIPO_FIN_LABEL[c.tipo]} · ${c.grupo}`} />
      <CategoriaForm
        action={salvarCategoria.bind(null, c.id)}
        opcoes={opcoesClassificacao(categorias)}
        valores={{
          tipo: c.tipo,
          grupo: c.grupo,
          nome: c.nome,
          dre_familia: c.dre_familia,
          dre_grupo: c.dre_grupo,
          dre_sinal: c.dre_sinal,
          fin_familia: c.fin_familia,
          fin_grupo: c.fin_grupo,
          ativo: c.ativo,
        }}
        modo="edicao"
      />
    </>
  );
}
