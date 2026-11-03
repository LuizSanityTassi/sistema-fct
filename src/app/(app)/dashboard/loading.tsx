import { Esqueleto } from "@/components/ui/skeleton";

/** Enquanto o painel carrega: o desenho dele em cinza (faixa, resumo, prioridades e cartões do mês). */
export default function CarregandoPainel() {
  return (
    <div role="status" aria-live="polite" aria-label="Carregando o painel">
      <span className="sr-only">Carregando…</span>
      <Esqueleto className="mb-6 h-40 w-full rounded-2xl" />
      <Esqueleto className="mb-3 h-4 w-40" />
      <div className="mb-8 grid gap-4 rounded-xl border bg-card p-5 xl:grid-cols-2">
        <div>
          <Esqueleto className="h-2.5 w-full rounded-full" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-24" />
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Esqueleto className="h-3 w-24" />
              <Esqueleto className="mt-3 h-9 w-32 max-w-full" />
              <Esqueleto className="mt-3 h-3 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 lg:col-span-2">
          <Esqueleto className="h-4 w-44" />
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-28" />
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-xl border bg-card p-5">
          <Esqueleto className="h-4 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-8" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="mt-3 h-7 w-28" />
            <Esqueleto className="mt-3 h-3 w-32" />
            <Esqueleto className="mt-4 h-9 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
