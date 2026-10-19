import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { salvarConta } from "../actions";
import { ContaForm } from "../conta-form";

export const metadata = { title: "Nova conta" };

export default async function NovaContaPage() {
  const sessao = await exigirAcesso("/financeiro/carteira");
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") semAcesso("/financeiro/carteira");
  return (
    <>
      <PageHeader eyebrow="Financeiro · Carteira" titulo="Nova conta" descricao="Banco, aplicação, caixa ou cofre da empresa." />
      <ContaForm action={salvarConta.bind(null, null)} />
    </>
  );
}
