import Link from "next/link";
import { ArrowRight, CircleCheckBig } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { carregarPendencias, ORDEM_SEVERIDADE, type AreaPendencia } from "@/lib/data/pendencias";
import { COR_SEVERIDADE, ROTULO_SEVERIDADE } from "@/lib/pendencias-visual";

export const metadata = { title: "Central de pendências" };

export default async function PendenciasPage({ searchParams }: PageProps<"/pendencias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/pendencias"), searchParams]);
  const todas = await carregarPendencias(sessao);
  const soMinhas = sp.minhas === "1";
  const area = typeof sp.area === "string" ? (sp.area as AreaPendencia) : "";
  const areas = [...new Set(todas.map((p) => p.area))];
  const lista = todas.filter((p) => (!soMinhas || p.minha) && (!area || p.area === area));
  const link = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const v = { minhas: soMinhas ? "1" : undefined, area: area || undefined, ...extra };
    for (const [k, x] of Object.entries(v)) if (x) q.set(k, x);
    const s = q.toString();
    return s ? `/pendencias?${s}` : "/pendencias";
  };
  const chip = (ativo: boolean) => `rounded-full border px-3 py-1 text-sm ${ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`;

  return (
    <>
      <PageHeader
        eyebrow="Início"
        titulo="Central de pendências"
        descricao="O que precisa de ação agora, de todos os módulos que você usa. Clique para abrir a tela já filtrada."
      />

      <section aria-label="Resumo" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {ORDEM_SEVERIDADE.map((s) => {
          const n = todas.filter((p) => p.severidade === s).length;
          return (
            <div key={s} className={`rounded-xl border border-l-4 bg-card px-4 py-3 ${COR_SEVERIDADE[s].borda}`}>
              <p className="rotulo">{ROTULO_SEVERIDADE[s]}</p>
              <p className="mt-1 numero">{n}</p>
            </div>
          );
        })}
      </section>

      <nav aria-label="Filtros" className="mb-4 flex flex-wrap items-center gap-2">
        <Link href={link({ minhas: undefined })} aria-current={!soMinhas ? "page" : undefined} className={chip(!soMinhas)}>
          Todas ({todas.length})
        </Link>
        <Link href={link({ minhas: "1" })} aria-current={soMinhas ? "page" : undefined} className={chip(soMinhas)}>
          Minha responsabilidade ({todas.filter((p) => p.minha).length})
        </Link>
        {areas.length > 1 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
        {areas.length > 1 &&
          [{ v: "", r: "Todos os módulos" }, ...areas.map((a) => ({ v: a, r: a }))].map((x) => (
            <Link key={x.v || "todas"} href={link({ area: x.v || undefined })} aria-current={area === x.v ? "page" : undefined} className={chip(area === x.v)}>
              {x.r}
            </Link>
          ))}
      </nav>

      {lista.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border bg-card px-6 py-14 text-center">
          <CircleCheckBig className="mb-3 size-10 text-emerald-600" aria-hidden />
          <p className="text-base font-semibold">Tudo certo por aqui</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {todas.length ? "Nenhuma pendência nesse filtro." : "Nenhuma pendência nos módulos que você usa. Quando algo precisar de ação, aparece aqui."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={p.href} className={`group flex items-center gap-4 rounded-xl border border-l-4 bg-card px-4 py-3 hover:border-primary/40 ${COR_SEVERIDADE[p.severidade].borda}`}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${COR_SEVERIDADE[p.severidade].selo}`}>{ROTULO_SEVERIDADE[p.severidade]}</span>
                    <span className="text-xs text-muted-foreground">{p.area}</span>
                    {p.minha && <span className="rounded-full bg-fct-tinta/8 px-2 py-0.5 text-[11px] font-medium text-fct-tinta">sua</span>}
                  </span>
                  <span className="mt-1 block text-sm font-semibold">{p.titulo}</span>
                  {p.detalhe && <span className="block text-sm text-muted-foreground">{p.detalhe}</span>}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
