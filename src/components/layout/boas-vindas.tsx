import type { ReactNode } from "react";
import { Onda } from "@/components/layout/marca";

/** Faixa de boas-vindas do início: a faixa vermelha do site com o desenho da logo (sol nascendo atrás da onda). */
export function BoasVindas({ data, titulo, children }: { data: string; titulo: string; children?: ReactNode }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl bg-fct-red-fundo px-6 pt-6 pb-14 text-white shadow-lg sm:px-8 sm:pt-7 sm:pb-16">
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 size-64 rounded-full bg-fct-yellow sm:-right-12 sm:-bottom-48 sm:size-80" />
      <Onda tom="vermelho" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 sm:h-14" />
      <div className="relative max-w-[min(36rem,70%)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/90">{data}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">{titulo}</h1>
        {children && <p className="mt-1.5 text-sm text-white/90">{children}</p>}
      </div>
    </section>
  );
}
