import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Variacao, type VariacaoIndicador } from "@/components/layout/painel";
import { ORDEM_STATUS, ROTULO_STATUS, TOM_STATUS } from "@/lib/data/dashboard-filiais";
import { TEXTO, type Tom } from "@/lib/tons";
import { BarraSituacao, type ContagemStatus } from "./desempenho-filiais";

export type MetricaResumo = {
  chave: string;
  rotulo: string;
  icone: LucideIcon;
  valor: string;
  /** Só quando a cor ajuda a ler (crítico, tudo certo). */
  tom?: Tom;
  /** O que dá sentido ao número: de quanto é, % do total. */
  contexto?: React.ReactNode;
  variacao?: VariacaoIndicador | null;
  comparado?: React.ReactNode;
  href: string;
};

export type FiliaisResumo = { contagem: ContagemStatus; meta: React.ReactNode };

/** "Como está a operação agora": as filiais por situação e os números que pedem decisão. Cada pedaço abre a lista filtrada. */
export function ResumoExecutivo({ filiais, metricas, atualizadoAs }: { filiais?: FiliaisResumo | null; metricas: MetricaResumo[]; atualizadoAs: string }) {
  return (
    <section id="resumo" aria-labelledby="t-resumo" className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 id="t-resumo" className="text-base font-semibold">
            Resumo executivo
          </h2>
          <p className="text-xs text-muted-foreground">Como está a operação agora</p>
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">Atualizado às {atualizadoAs}</p>
      </div>
      <div className={cn("grid overflow-hidden rounded-xl border bg-card", filiais && metricas.length > 0 && "xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]")}>
        {filiais && (
          <div className="min-w-0 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="rotulo">Situação das filiais</p>
              <p className="text-xs text-muted-foreground tabular-nums">{filiais.contagem.total} acompanhadas</p>
            </div>
            <BarraSituacao contagem={filiais.contagem} className="mt-2.5" />
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {ORDEM_STATUS.map((s) => {
                const n = filiais.contagem[s];
                return (
                  <li key={s} className="min-w-0">
                    <Link href={`/dashboard/filiais?status=${s}`} className="cartao-interativo block h-full rounded-lg border p-2.5">
                      <span className={cn("numero-lg block", n ? TEXTO[TOM_STATUS[s]] : "text-muted-foreground/60")}>{n}</span>
                      <span className="block text-sm font-medium">{ROTULO_STATUS[s]}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">{Math.round((n / (filiais.contagem.total || 1)) * 100)}% do total</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{filiais.meta}</p>
          </div>
        )}
        {metricas.length > 0 && (
          <ul className={cn("grid min-w-0 divide-y sm:divide-x sm:divide-y-0", filiais && "border-t xl:border-t-0 xl:border-l", metricas.length >= 3 ? "sm:grid-cols-3" : metricas.length === 2 ? "sm:grid-cols-2" : "")}>
            {metricas.map((m) => {
              const Icone = m.icone;
              return (
                <li key={m.chave} className="min-w-0">
                  <Link href={m.href} className="flex h-full flex-col p-5 transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40 active:bg-muted/70">
                    <span className="flex items-center justify-between gap-2">
                      <span className="rotulo">{m.rotulo}</span>
                      <Icone className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />
                    </span>
                    <span className={cn("numero-lg mt-1.5 block", m.tom && TEXTO[m.tom])}>{m.valor}</span>
                    {m.contexto && <span className="mt-1 block text-sm text-muted-foreground">{m.contexto}</span>}
                    {(m.variacao || m.comparado) && (
                      <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                        {m.variacao && <Variacao v={m.variacao} />}
                        {m.comparado}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
