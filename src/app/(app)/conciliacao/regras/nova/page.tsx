import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { opcoesOmie } from "@/lib/conciliacao/regras";
import { createClient } from "@/lib/supabase/server";
import { salvarRegra } from "../actions";
import { RegraForm } from "../regra-form";

export const metadata = { title: "Nova regra automática" };

export default async function NovaRegraPage() {
  const sessao = await exigirAcesso("/conciliacao/regras");
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao/regras");
  const opcoes = await opcoesOmie(await createClient());
  return (
    <>
      <PageHeader
        eyebrow="DDA x Trier"
        titulo="Nova regra automática"
        descricao="Quando a conta bate com as condições, o sistema aplica a categoria/departamento na Omie e trata a pendência sozinho."
      />
      <RegraForm action={salvarRegra.bind(null, null)} modo="nova" opcoes={opcoes} />
    </>
  );
}
