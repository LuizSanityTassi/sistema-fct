import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { listarDePara } from "@/lib/data/conciliacao-gi";
import { salvarDePara } from "../../../actions";
import { DeParaForm } from "../../depara-form";

export const metadata = { title: "Editar de-para · GI" };

export default async function EditarDeParaPage({ params }: PageProps<"/conciliacao-gi/de-para/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/conciliacao-gi/de-para"), params]);
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao-gi/de-para");
  const d = (await listarDePara()).find((x) => x.id === id);
  if (!d) notFound();
  return (
    <>
      <PageHeader eyebrow="Conciliação GI" titulo={`Editar “${d.dda}”`} />
      <DeParaForm action={salvarDePara.bind(null, d.id)} valores={{ dda: d.dda, fornecedores: d.fornecedores, alerta: d.alerta, ativo: d.ativo }} modo="edicao" />
    </>
  );
}
