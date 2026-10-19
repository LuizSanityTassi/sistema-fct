// Gráficos leves, sem biblioteca: SVG/HTML puro que segue a cor do texto (currentColor) e o tema.
import { cn } from "cn";

/** Minigráfico de linha com área: tendência, sem eixos. A cor vem do `text-*` do className. */
export function Sparkline({ valores, className }: { valores: number[]; className?: string }) {
  if (valores.length < 2) return null;
  const L = 120;
  const A = 32;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const faixa = max - min || 1;
  const pts = valores.map((v, i) => [(i / (valores.length - 1)) * L, A - 2 - ((v - min) / faixa) * (A - 4)] as const);
  const linha = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${linha} L${L} ${A} L0 ${A} Z`;
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden className={cn("block overflow-visible", className)}>
      <path d={area} fill="currentColor" opacity={0.1} />
      <path d={linha} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export type BarraDupla = { rotulo: string; a: number; b: number; textoA: string; textoB: string };

/** Colunas lado a lado por período (ex.: receitas × despesas por mês), com legenda e tabela para leitor de tela. */
export function BarrasDuplas({ dados, rotuloA, rotuloB, titulo, className }: { dados: BarraDupla[]; rotuloA: string; rotuloB: string; titulo: string; className?: string }) {
  const max = Math.max(1, ...dados.flatMap((d) => [d.a, d.b]));
  const pct = (v: number) => `${Math.max(v > 0 ? 2 : 0, (v / max) * 100)}%`;
  return (
    <div className={className}>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-foreground/75" />
          {rotuloA}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-fct-red" />
          {rotuloB}
        </span>
      </div>
      <div className="flex h-40 items-end gap-2 border-b sm:gap-4" aria-hidden>
        {dados.map((d) => (
          <div key={d.rotulo} className="group flex h-full min-w-0 flex-1 items-end justify-center gap-1" title={`${d.rotulo}: ${rotuloA} ${d.textoA} · ${rotuloB} ${d.textoB}`}>
            <span className="w-full max-w-5 rounded-t-[3px] bg-foreground/75 transition-opacity group-hover:opacity-80" style={{ height: pct(d.a) }} />
            <span className="w-full max-w-5 rounded-t-[3px] bg-fct-red transition-opacity group-hover:opacity-80" style={{ height: pct(d.b) }} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4" aria-hidden>
        {dados.map((d) => (
          <span key={d.rotulo} className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground">
            {d.rotulo}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th>Período</th>
            <th>{rotuloA}</th>
            <th>{rotuloB}</th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => (
            <tr key={d.rotulo}>
              <td>{d.rotulo}</td>
              <td>{d.textoA}</td>
              <td>{d.textoB}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Barra horizontal de proporção (ex.: funcionários por regional). */
export function BarraProporcao({ pct, className }: { pct: number; className?: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted" role="presentation">
      <div className={cn("h-1.5 rounded-full bg-foreground/70", className)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}
