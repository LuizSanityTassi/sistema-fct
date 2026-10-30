import Link from "next/link";
import { ArrowRight, Banknote, Building2, LifeBuoy, MonitorCog, Scale, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { AREAS_PERGUNTA, perguntasDoPapel, type AreaPergunta } from "@/lib/perguntas/catalogo";

export const metadata = { title: "Perguntas prontas" };

const ICONE_AREA: Record<AreaPergunta, LucideIcon> = {
  Caixa: Banknote,
  Conciliação: Scale,
  Financeiro: Building2,
  Pessoas: Users,
  Chamados: LifeBuoy,
  Tecnologia: MonitorCog,
};

export default async function PerguntasPage() {
  const sessao = await exigirAcesso("/perguntas");
  const perguntas = perguntasDoPapel(sessao.papel, sessao.bloqueios);
  const areas = AREAS_PERGUNTA.filter((a) => perguntas.some((p) => p.area === a));

  return (
    <>
      <PageHeader
        eyebrow="Início"
        titulo="Perguntas prontas"
        descricao="As consultas que o dia a dia mais pede, respondidas na hora com os dados do sistema. Cada resposta tem filtro de mês e de unidade (quando faz sentido) e pode ser baixada para o Excel. Também dá para achar pelo Ctrl+K."
      />
      {perguntas.length === 0 ? (
        <p className="vazio rounded-xl border bg-card">Nenhuma pergunta pronta para o seu perfil ainda.</p>
      ) : (
        <div className="space-y-6">
          {areas.map((area) => {
            const Icone = ICONE_AREA[area];
            return (
              <section key={area} aria-labelledby={`area-${area}`}>
                <h2 id={`area-${area}`} className="mb-3 flex items-center gap-2 rotulo">
                  <Icone className="size-3.5" aria-hidden />
                  {area}
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {perguntas
                    .filter((p) => p.area === area)
                    .map((p) => (
                      <Link
                        key={p.id}
                        href={`/perguntas/${p.id}`}
                        className="group flex flex-col rounded-xl border bg-card p-4 transition-all outline-none hover:-translate-y-px hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="font-medium">{p.pergunta}</span>
                          <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fct-tinta" aria-hidden />
                        </span>
                        <span className="mt-1 text-sm text-muted-foreground">{p.descricao}</span>
                      </Link>
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
