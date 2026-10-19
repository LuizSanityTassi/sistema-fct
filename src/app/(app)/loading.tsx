import { Esqueleto } from "@/components/ui/skeleton";

/** Enquanto a próxima tela carrega: o desenho dela em cinza (cabeçalho, indicadores e tabela). */
export default function Carregando() {
  return (
    <div role="status" aria-live="polite" aria-label="Carregando">
      <span className="sr-only">Carregando…</span>
      <div className="mb-6 space-y-2.5">
        <Esqueleto className="h-3 w-24" />
        <Esqueleto className="h-8 w-72 max-w-full" />
        <Esqueleto className="h-4 w-[28rem] max-w-full" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Esqueleto className="h-3 w-24" />
            <Esqueleto className="mt-3 h-7 w-28" />
            <Esqueleto className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        <div className="border-b px-5 py-4">
          <Esqueleto className="h-4 w-40" />
        </div>
        <div className="divide-y">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3.5">
              <Esqueleto className="h-4 w-1/3" />
              <Esqueleto className="h-4 w-1/5" />
              <Esqueleto className="ml-auto h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
