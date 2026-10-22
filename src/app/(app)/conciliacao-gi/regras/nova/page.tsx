import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { opcoesOmie } from "@/lib/conciliacao-gi/regras";
import { createClient } from "@/lib/supabase/server";
import { salvarRegra } from "../actions";
import { RegraForm } from "../regra-form";

export const metadata = { title: "Nova regra automática · GI" };

export default async function NovaRegraPage() {
  const sessao = await exigirAcesso("/conciliacao-gi/regras");
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao-gi/regras");
  const opcoes = await opcoesOmie(await createClient());
  return (
    <>
      <PageHeader
        eyebrow="Conciliação GI"
        titulo="Nova regra automática"
        descricao="Quando a conta bate com as condições, o sistema aplica a categoria/departamento na Omie e trata a pendência sozinho."
      />
      <RegraForm action={salvarRegra.bind(null, null)} modo="nova" opcoes={opcoes} />
    </>
  );
}
