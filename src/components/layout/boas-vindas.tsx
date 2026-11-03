import type { ReactNode } from "react";
import { cn } from "cn";
import { Onda } from "@/components/layout/marca";

/** A frase de "como está a operação agora", em destaque na faixa. */
export type SituacaoFaixa = { tom: "perigo" | "atencao" | "sucesso"; rotulo: string; texto?: string };

const PONTO_FAIXA: Record<SituacaoFaixa["tom"], string> = { perigo: "bg-red-400", atencao: "bg-fct-yellow", sucesso: "bg-emerald-400" };

/** Faixa de boas-vindas do início: base preta (fixa, nos dois temas) com o vermelho da marca entrando pela direita e o
 * desenho da logo (sol nascendo atrás da onda). */
export function BoasVindas({ data, titulo, situacao, children }: { data: string; titulo: string; situacao?: SituacaoFaixa; children?: ReactNode }) {
  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl bg-[oklch(0.188_0.007_0.9)] px-6 pt-6 pb-14 text-white shadow-lg ring-1 ring-white/10 sm:px-8 sm:pt-7 sm:pb-16">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-3/4 bg-linear-to-l from-fct-red-fundo/90 via-fct-red-fundo/30 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -bottom-40 size-64 rounded-full bg-fct-yellow sm:-right-12 sm:-bottom-48 sm:size-80" />
      <Onda tom="escuro" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 sm:h-14" />
      <div className="relative max-w-[min(40rem,78%)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{data}</p>
        <h1 className="mt-1 text-2xl sm:text-3xl">{titulo}</h1>
        {children && <p className="mt-1.5 text-sm text-white/75">{children}</p>}
        {situacao && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-white/10 sm:rounded-full px-3 py-1 text-sm ring-1 ring-white/15 backdrop-blur-sm">
            <span className={cn("size-2 shrink-0 rounded-full", PONTO_FAIXA[situacao.tom])} aria-hidden />
            <strong className="font-semibold">{situacao.rotulo}</strong>
            {situacao.texto && <span className="text-white/80">{situacao.texto}</span>}
          </p>
        )}
      </div>
    </section>
  );
}
