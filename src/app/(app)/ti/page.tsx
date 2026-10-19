import Link from "next/link";
import { KeyRound, Laptop, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { filaTi, resumoAtivos, resumoFilaTi } from "@/lib/data/ti";
import { descreverPeriodo, formatarMoeda, pluralizar } from "@/lib/formatos";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";
import { BadgePrioridade, BadgeStatusChamado } from "../chamados/badges-chamado";

export const metadata = { title: "TI" };

function Kpi({ rotulo, valor, nota, href, tom }: { rotulo: string; valor: string | number; nota?: string | null; href: string; tom?: string }) {
  return (
    <Link href={href} className="block rounded-xl border bg-card px-4 py-3 transition-colors hover:border-primary/40">
      <p className="rotulo">{rotulo}</p>
      <p className={`mt-1 numero ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </Link>
  );
}

export default async function TiPage() {
  await exigirAcesso("/ti");
  const [fila, chamados, ativos] = await Promise.all([resumoFilaTi(), filaTi(10), resumoAtivos()]);

  return (
    <>
      <PageHeader
        eyebrow="Tecnologia"
        titulo="TI"
        descricao="Fila de chamados de TI, solicitações de acesso e inventário de equipamentos por unidade."
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/ti/acessos/novo" />}>
              <KeyRound data-icon="inline-start" />
              Solicitar acesso
            </Button>
            <Button nativeButton={false} render={<Link href="/ti/ativos/novo" />}>
              <Plus data-icon="inline-start" />
              Novo ativo
            </Button>
          </>
        }
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Chamados de TI em aberto" valor={fila.abertos} nota={`${fila.semResponsavel} sem responsável`} href="/chamados?categoria=ti" />
        <Kpi rotulo="Urgentes" valor={fila.urgentes} href="/chamados?categoria=ti&prioridade=alta" tom={fila.urgentes > 0 ? "text-red-700" : undefined} />
        <Kpi rotulo="Acessos pendentes" valor={fila.acessosPendentes} nota="solicitações de acesso" href="/chamados?categoria=ti&q=Acesso" />
        <Kpi
          rotulo="Resolvidos (30 dias)"
          valor={fila.resolvidos30}
          nota={fila.horasMedias !== null ? `tempo médio ${fila.horasMedias < 48 ? `${fila.horasMedias} h` : `${Math.round(fila.horasMedias / 24)} dias`}` : null}
          href="/chamados?categoria=ti&status=resolvido"
          tom="text-emerald-700"
        />
        <Kpi
          rotulo="Ativos em uso"
          valor={ativos.porStatus.em_uso}
          nota={`${ativos.porStatus.manutencao} em manutenção · ${ativos.porStatus.estoque} em estoque`}
          href="/ti/ativos"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card lg:col-span-2">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Fila de TI</h2>
            <Link href="/chamados?categoria=ti" className="text-xs text-fct-tinta underline">
              ver todos
            </Link>
          </div>
          {chamados.length === 0 ? (
            <p className="border-t px-5 py-5 text-sm text-muted-foreground">Nenhum chamado de TI em aberto.</p>
          ) : (
            <ul className="divide-y border-t">
              {chamados.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <Link href={`/chamados/${c.id}`} className="block truncate font-medium hover:underline">
                      #{c.numero} {c.titulo}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {c.unidade ? `${c.unidade.codigo} · ` : ""}
                      {c.subcategoria === "acesso" ? "acesso · " : ""}
                      {c.quem_atende?.nome ?? "sem responsável"} · há {descreverPeriodo(c.created_at) ?? "pouco"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <BadgePrioridade prioridade={c.prioridade} />
                    <span className="hidden sm:inline">
                      <BadgeStatusChamado status={c.status} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Inventário</h2>
            <Link href="/ti/ativos" className="text-xs text-fct-tinta underline">
              abrir
            </Link>
          </div>
          {ativos.total === 0 ? (
            <div className="border-t px-5 py-5 text-sm text-muted-foreground">
              <Laptop className="mb-2 size-5" aria-hidden />
              Nenhum equipamento cadastrado. Comece pelo <Link href="/ti/ativos/novo" className="underline">primeiro ativo</Link> — os tipos já trazem o valor de referência dos inventários.
            </div>
          ) : (
            <div className="border-t px-5 py-4 text-sm">
              <p className="mb-3">
                <span className="numero">{formatarMoeda(ativos.valorTotal)}</span>
                <span className="text-muted-foreground"> em {pluralizar(ativos.unidadesComAtivos, "unidade", "unidades")}</span>
              </p>
              <ul className="space-y-1">
                {ativos.porTipo.slice(0, 8).map(([tipo, qtd]) => (
                  <li key={tipo} className="flex justify-between">
                    <Link href={`/ti/ativos?tipo=${tipo}`} className="hover:underline">
                      {TIPO_ATIVO_LABEL[tipo] ?? tipo}
                    </Link>
                    <span className="tabular-nums text-muted-foreground">{qtd}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {Object.entries(ativos.porStatus)
                  .filter(([, n]) => n > 0)
                  .map(([s, n]) => `${n} ${STATUS_ATIVO_LABEL[s as keyof typeof STATUS_ATIVO_LABEL].toLowerCase()}`)
                  .join(" · ")}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
