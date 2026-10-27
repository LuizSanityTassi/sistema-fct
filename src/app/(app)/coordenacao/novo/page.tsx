import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { opcoesChecklist } from "@/lib/data/coordenacao";
import { ChecklistForm } from "./checklist-form";

export const metadata = { title: "Novo checklist" };

export default async function NovoChecklistPage() {
  const sessao = await exigirAcesso("/coordenacao");
  const { lojas, gerentes } = await opcoesChecklist();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

  return (
    <>
      <PageHeader eyebrow="Coordenação · Checklist da loja" titulo="Check-list Coordenador Regional" descricao="Avalie a loja na visita, registre os direcionamentos e o que ficou acordado. O gerente confirma no usuário dele." />
      {lojas.length === 0 ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            titulo="Você não tem lojas para avaliar"
            descricao={
              <>
                O checklist é feito pelo coordenador de vendas, nas lojas da regional dele. Peça ao administrador para colocar a sua regional no seu usuário.{" "}
                <Link href="/coordenacao" className="underline">
                  Voltar aos checklists
                </Link>
                .
              </>
            }
          />
        </section>
      ) : (
        <ChecklistForm lojas={lojas} gerentes={gerentes} coordenador={sessao.nome} hoje={hoje} />
      )}
    </>
  );
}
