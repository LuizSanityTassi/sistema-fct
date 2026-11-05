import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import type { ContaBancaria } from "@/lib/financeiro/carteira";
import { formatarDataHora } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { salvarConta } from "../actions";
import { ContaForm } from "../conta-form";

export const metadata = { title: "Editar conta" };

export default async function EditarContaPage({ params }: PageProps<"/financeiro/carteira/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/financeiro/carteira"), params]);
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") semAcesso("/financeiro/carteira");
  if (!ehUuid(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("fin_contas_bancarias").select("id, apelido, banco, agencia, conta, tipo, grupo, ativa, aceita_sangria, observacao, atualizado_em, omie_varela, omie_nazario").eq("id", id).maybeSingle();
  if (!data) notFound();
  const conta = data as ContaBancaria;
  return (
    <>
      <PageHeader eyebrow="Financeiro · Carteira" titulo={conta.apelido} descricao={`Última alteração em ${formatarDataHora(conta.atualizado_em)}`} />
      <ContaForm action={salvarConta.bind(null, conta.id)} conta={conta} />
    </>
  );
}
