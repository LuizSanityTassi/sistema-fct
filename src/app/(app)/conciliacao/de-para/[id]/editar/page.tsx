import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { listarDePara } from "@/lib/data/conciliacao";
import { salvarDePara } from "../../../actions";
import { DeParaForm } from "../../depara-form";

export const metadata = { title: "Editar de-para" };

export default async function EditarDeParaPage({ params }: PageProps<"/conciliacao/de-para/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/conciliacao/de-para"), params]);
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao/de-para");
  const d = (await listarDePara()).find((x) => x.id === id);
  if (!d) notFound();
  return (
    <>
      <PageHeader eyebrow="DDA x Trier" titulo={`Editar “${d.dda}”`} />
      <DeParaForm action={salvarDePara.bind(null, d.id)} valores={{ dda: d.dda, fornecedores: d.fornecedores, alerta: d.alerta, ativo: d.ativo }} modo="edicao" />
    </>
  );
}
