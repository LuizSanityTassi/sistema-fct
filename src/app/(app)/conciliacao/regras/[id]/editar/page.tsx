import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { listarRegras, opcoesOmie } from "@/lib/conciliacao/regras";
import { createClient } from "@/lib/supabase/server";
import { salvarRegra } from "../../actions";
import { RegraForm } from "../../regra-form";

export const metadata = { title: "Editar regra automática" };

export default async function EditarRegraPage({ params }: PageProps<"/conciliacao/regras/[id]/editar">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/conciliacao/regras"), params]);
  if (!podeConciliar(sessao.papel)) redirect("/conciliacao/regras");
  const supabase = await createClient();
  const [regras, opcoes] = await Promise.all([listarRegras(supabase), opcoesOmie(supabase)]);
  const r = regras.find((x) => x.id === id);
  if (!r) notFound();
  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo={`Editar “${r.nome}”`}
        descricao="A mudança vale a partir da próxima conciliação ou envio à Omie. Para tratar as pendências abertas agora, use “Aplicar nas pendências” na lista de regras."
      />
      <RegraForm action={salvarRegra.bind(null, r.id)} valores={r} modo="edicao" opcoes={opcoes} />
    </>
  );
}
