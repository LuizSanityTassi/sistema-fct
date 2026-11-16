import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { lojasAuditaveis } from "@/lib/data/auditoria-lojas";
import { ChecklistAuditoriaForm } from "./checklist-form";

export const metadata = { title: "Novo checklist de auditoria" };

export default async function NovoChecklistAuditoriaPage() {
  const sessao = await exigirAcesso("/auditoria");
  const lojas = await lojasAuditaveis();

  return (
    <>
      <PageHeader eyebrow="Auditoria de lojas · Checklist" titulo="Verificação do cumprimento das normas das farmácias" descricao="Responda cada item na visita à loja. O que você marcar fica salvo neste aparelho até finalizar." />
      {lojas.length === 0 ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            titulo="Você não tem filiais para auditar"
            descricao={
              <>
                O checklist é feito pelo administrador, pelo financeiro ou pelo coordenador (nas lojas da regional dele).{" "}
                <Link href="/auditoria" className="underline">
                  Voltar
                </Link>
                .
              </>
            }
          />
        </section>
      ) : (
        <ChecklistAuditoriaForm lojas={lojas} auditor={sessao.nome} usuarioId={sessao.id} agora={new Date().toISOString()} />
      )}
    </>
  );
}
