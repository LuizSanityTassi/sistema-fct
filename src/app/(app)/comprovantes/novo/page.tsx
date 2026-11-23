import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ComprovanteForm } from "./comprovante-form";

export const metadata = { title: "Novo comprovante" };

export default async function NovoComprovantePage() {
  await exigirAcesso("/comprovantes");
  const supabase = await createClient();
  const { data: lojas } = await supabase.rpc("lojas_para_comprovante");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="Operação · Comprovantes de venda"
        titulo="Novo comprovante"
        descricao="Registre a venda no convênio ou no crediário com a foto (ou PDF) do comprovante assinado pelo cliente."
      />
      {!lojas?.length ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            titulo="Seu usuário não está ligado a nenhuma filial"
            descricao={
              <>
                Peça ao administrador para colocar a sua loja no seu usuário. Enquanto isso, você pode{" "}
                <Link href="/comprovantes" className="underline">
                  pesquisar os comprovantes
                </Link>
                .
              </>
            }
          />
        </section>
      ) : (
        <ComprovanteForm lojas={lojas} hoje={hoje} />
      )}
    </>
  );
}
