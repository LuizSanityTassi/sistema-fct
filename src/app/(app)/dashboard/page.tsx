import Link from "next/link";
import { ArrowRight, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { getSessao } from "@/lib/auth/session";
import { navParaPapel } from "@/lib/nav";
import { PAPEL_LABEL } from "@/lib/roles";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const [sessao, params] = await Promise.all([getSessao(), searchParams]);
  const erro = typeof params.erro === "string" ? params.erro : undefined;
  const primeiroNome = sessao.nome.split(" ")[0];
  // Só os módulos (grupos com título); o próprio Dashboard fica de fora.
  const grupos = navParaPapel(sessao.papel).filter((g) => g.titulo);

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        titulo={`Olá, ${primeiroNome}`}
        descricao={`Você está conectado como ${PAPEL_LABEL[sessao.papel]}. Abaixo estão os módulos liberados para o seu perfil.`}
      />

      {erro === "sem_permissao" && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Acesso não permitido.</strong> Seu perfil não tem permissão para a página solicitada. Se
            precisar desse acesso, fale com o administrador do sistema.
          </p>
        </div>
      )}

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="mb-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {grupo.titulo}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {grupo.itens.map((item) => {
              const Icone = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-xl border bg-card p-4 transition-colors outline-none hover:border-fct-navy/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex size-9 items-center justify-center rounded-md bg-fct-navy/6 text-fct-navy">
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <ArrowRight
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fct-navy"
                      aria-hidden
                    />
                  </div>
                  <p className="mt-3 font-medium">{item.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.descricao}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
