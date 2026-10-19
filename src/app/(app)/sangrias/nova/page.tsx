import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { opcoesDeCadastro } from "@/lib/data/sangrias";
import { SangriaForm } from "./sangria-form";

export const metadata = { title: "Nova sangria" };

export default async function NovaSangriaPage() {
  await exigirAcesso("/sangrias");
  const { lojas, contas } = await opcoesDeCadastro();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <PageHeader eyebrow="Operação · Sangrias" titulo="Nova sangria" descricao="Registre o dinheiro retirado do caixa e depositado no banco, com o comprovante do depósito." />
      {lojas.length === 0 ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            titulo="Seu usuário não está ligado a nenhuma filial"
            descricao={
              <>
                Peça ao administrador para colocar a sua loja no seu usuário. Enquanto isso, você pode{" "}
                <Link href="/sangrias" className="underline">
                  consultar as sangrias
                </Link>
                .
              </>
            }
          />
        </section>
      ) : (
        <SangriaForm lojas={lojas} contas={contas} hoje={hoje} />
      )}
    </>
  );
}
