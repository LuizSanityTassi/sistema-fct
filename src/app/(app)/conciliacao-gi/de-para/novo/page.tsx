import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { salvarDePara } from "../../actions";
import { DeParaForm } from "../depara-form";

export const metadata = { title: "Novo de-para · GI" };

export default async function NovoDeParaPage() {
  const sessao = await exigirAcesso("/conciliacao-gi/de-para");
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao-gi/de-para");
  return (
    <>
      <PageHeader eyebrow="Conciliação GI" titulo="Novo de-para" descricao="Quando o boleto vem em nome de um terceiro (fundo, securitizadora, banco), diga qual é o fornecedor real." />
      <DeParaForm action={salvarDePara.bind(null, null)} modo="novo" />
    </>
  );
}
