// Peças visuais do Painel de vendas (servidor, sem biblioteca de gráfico): comparação, seção, progresso, rosca de
// composição, colunas da semana e evolução acumulada do mês. Cores pelas classes da paleta (valem no tema escuro).
import { ArrowDown, ArrowRight, ArrowUp, Minus, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { decimal, moeda, moedaCurta } from "./comum";

// ---------- comparação: sobe / cai / estável / sem base ----------

type FormatoComparacao = "pct" | "pp";

/** Variação numérica (null = sem base para comparar). */
export function delta(atual: number | null, anterior: number | null, formato: FormatoComparacao = "pct") {
  if (atual === null || anterior === null) return null;
  if (formato === "pct") return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
  return atual - anterior;
}

/**
 * "↑ 8,4% vs setembro": verde quando melhorou, vermelho quando piorou, cinza estável e tracejado sem base.
 * `inverso` para o que é melhor quando cai (CMV).
 */
export function Comparacao({ atual, anterior, rotulo, formato = "pct", inverso = false, grande = false, className }: { atual: number | null; anterior: number | null; rotulo: string; formato?: FormatoComparacao; inverso?: boolean; grande?: boolean; className?: string }) {
  const d = delta(atual, anterior, formato);
  const base = cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium tabular-nums", grande ? "px-2.5 py-1 text-sm" : "px-2 py-0.5 text-xs", className);
  if (d === null)
    return (
      <span className={cn(base, "border-dashed text-muted-foreground")}>
        <Minus className="size-3.5" aria-hidden />
        sem comparação {rotulo}
      </span>
    );
  const estavel = Math.abs(d) < (formato === "pct" ? 0.5 : 0.1);
  const subiu = d > 0;
  const melhorou = !estavel && subiu !== inverso;
  const Icone = estavel ? ArrowRight : subiu ? ArrowUp : ArrowDown;
  const tom = estavel ? "border-border bg-muted text-muted-foreground" : melhorou ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800";
  const texto = estavel ? "estável" : `${decimal(Math.abs(d), 1)}${formato === "pct" ? "%" : " p.p."}`;
  return (
    <span className={cn(base, tom)}>
      <Icone className={grande ? "size-4" : "size-3.5"} aria-hidden />
      <strong className="font-semibold">{texto}</strong>
      <span className="font-normal opacity-90">{rotulo}</span>
      <span className="sr-only">{estavel ? "(estável)" : melhorou ? "(melhorou)" : "(piorou)"}</span>
    </span>
  );
}

// ---------- estrutura ----------

/** Seção do painel: título com ícone, subtítulo e conteúdo. */
export function Secao({ titulo, subtitulo, icone: Icone, acao, className, children }: { titulo: string; subtitulo?: React.ReactNode; icone?: LucideIcon; acao?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
            {Icone && (
              <span className="grid size-7 place-items-center rounded-lg bg-muted">
                <Icone className="size-4 text-muted-foreground" aria-hidden />
              </span>
            )}
            {titulo}
          </h2>
          {subtitulo && <p className="mt-1 text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {acao && <div className="shrink-0">{acao}</div>}
      </header>
      <div className="min-w-0 flex-1 px-5 pb-5 sm:px-6">{children}</div>
    </section>
  );
}

/** Indicador secundário: rótulo, número e comparação (menor que o destaque, maior que texto solto). */
export function MiniKpi({ rotulo, valor, comparacao, detalhe }: { rotulo: string; valor: React.ReactNode; comparacao?: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="rotulo">{rotulo}</p>
      <p className="mt-1 numero-sm">{valor}</p>
      {comparacao && <div className="mt-2">{comparacao}</div>}
      {detalhe && <p className="mt-1.5 text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** Barra de progresso do realizado sobre o projetado, com a marca de quanto do mês já passou. */
export function BarraProgresso({ pct, marca, rotuloMarca }: { pct: number; marca?: number; rotuloMarca?: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative pt-5" role="img" aria-label={`${decimal(p, 1)}% realizado${marca !== undefined ? `, ${decimal(marca, 0)}% do mês decorrido` : ""}`}>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-linear-to-r from-fct-red-dark to-fct-red" style={{ width: `${p}%` }} />
      </div>
      {marca !== undefined && (
        <div className="absolute top-0 bottom-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${Math.max(0, Math.min(100, marca))}%` }} aria-hidden>
          <span className="text-[10px] font-medium whitespace-nowrap text-muted-foreground">{rotuloMarca}</span>
          <span className="mt-0.5 h-4 w-0.5 rounded bg-foreground/60" />
        </div>
      )}
    </div>
  );
}

// ---------- composição (rosca) ----------

export type FatiaComposicao = { chave: string; rotulo: string; valor: number; cor: string; ponto: string };

/** Rosca minimalista: cada fatia é um arco do mesmo círculo (pathLength 100). */
export function Rosca({ fatias, centro, legenda }: { fatias: FatiaComposicao[]; centro: React.ReactNode; legenda: string }) {
  const total = fatias.reduce((s, f) => s + Math.max(0, f.valor), 0) || 1;
  const partes = fatias.map((f) => (Math.max(0, f.valor) / total) * 100);
  const inicios = partes.map((_, i) => partes.slice(0, i).reduce((s, p) => s + p, 0));
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[200px]">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={legenda}>
        <circle cx="60" cy="60" r="46" fill="none" strokeWidth="16" className="text-muted" stroke="currentColor" />
        {fatias.map((f, i) => {
          const p = Math.max(0, partes[i] - 0.6); // fresta entre as fatias
          return <circle key={f.chave} cx="60" cy="60" r="46" fill="none" strokeWidth="16" pathLength={100} strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-inicios[i]} stroke="currentColor" className={f.cor} />;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{centro}</div>
    </div>
  );
}

// ---------- colunas da semana (dia × mesmo dia da semana anterior) ----------

export type DiaComparado = { dia: string; rotulo: string; data: string; atual: number; anterior: number };

export function ColunasSemana({ dias }: { dias: DiaComparado[] }) {
  const max = Math.max(1, ...dias.flatMap((d) => [d.atual, d.anterior]));
  const h = (v: number) => `${Math.max(v > 0 ? 3 : 0, (v / max) * 100)}%`;
  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-fct-red" />
          Dia
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-foreground/20" />
          Mesmo dia da semana anterior
        </span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-3" aria-hidden>
        {dias.map((d) => {
          const v = delta(d.atual, d.anterior);
          return (
            <div key={d.dia} className="flex min-w-0 flex-col items-center" title={`${d.rotulo} ${d.data}: ${moeda(d.atual)} · semana anterior ${moeda(d.anterior)}`}>
              <span className="mb-1 text-[11px] font-semibold tabular-nums sm:text-xs">{d.atual ? moedaCurta(d.atual).replace("R$ ", "") : "—"}</span>
              <div className="flex h-40 w-full items-end justify-center gap-0.5 border-b sm:gap-1">
                <span className="w-full max-w-4 rounded-t-[3px] bg-foreground/20" style={{ height: h(d.anterior) }} />
                <span className="w-full max-w-6 rounded-t-[3px] bg-fct-red" style={{ height: h(d.atual) }} />
              </div>
              <span className="mt-1.5 text-xs font-medium">{d.rotulo.slice(0, 3)}</span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{d.data}</span>
              <span className={cn("mt-0.5 text-[10px] font-semibold tabular-nums", v === null ? "text-muted-foreground" : v >= 0 ? "text-emerald-700" : "text-red-700")}>{v === null ? "—" : `${v >= 0 ? "+" : "−"}${decimal(Math.abs(v), 0)}%`}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Venda dos últimos 7 dias comparada com o mesmo dia da semana anterior</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Venda</th>
            <th>Semana anterior</th>
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => (
            <tr key={d.dia}>
              <td>
                {d.rotulo} {d.data}
              </td>
              <td>{moeda(d.atual)}</td>
              <td>{moeda(d.anterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- evolução acumulada do mês ----------

/**
 * Linha do acumulado do mês (dia 1 até ontem), o acumulado do mês anterior no mesmo dia (cinza) e a projeção até o
 * último dia (tracejada).
 */
export function EvolucaoMes({ atual, anterior, projecao, diasNoMes, rotuloAnterior }: { atual: number[]; anterior: number[]; projecao: number; diasNoMes: number; rotuloAnterior: string }) {
  const L = 600;
  const A = 220;
  const max = Math.max(1, projecao, ...atual, ...anterior) * 1.05;
  const x = (i: number) => (i / Math.max(1, diasNoMes - 1)) * L;
  const y = (v: number) => A - (v / max) * A;
  const linha = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const ultimo = atual.length - 1;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-fct-red" />
          Este mês
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-foreground/30" />
          {rotuloAnterior}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-fct-red/60" />
          Projeção
        </span>
      </div>
      <div className="grid grid-cols-[3.5rem_1fr] gap-2">
        <div className="relative h-56 text-right text-[10px] text-muted-foreground tabular-nums" aria-hidden>
          {marcas.map((m) => (
            <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - m / max) * 100}%` }}>
              {m ? moedaCurta(m).replace("R$ ", "") : "0"}
            </span>
          ))}
        </div>
        <div className="relative h-56">
          <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" className="size-full overflow-visible" role="img" aria-label={`Venda acumulada do mês: ${moeda(atual[ultimo] ?? 0)} até agora, projeção de ${moeda(projecao)}`}>
            {marcas.map((m) => (
              <line key={m} x1="0" x2={L} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {anterior.length > 1 && <path d={linha(anterior)} fill="none" stroke="currentColor" className="text-foreground/30" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            {ultimo >= 0 && ultimo < diasNoMes - 1 && <path d={`M${x(ultimo)},${y(atual[ultimo])} L${x(diasNoMes - 1)},${y(projecao)}`} fill="none" stroke="currentColor" className="text-fct-red/60" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />}
            {atual.length > 1 && <path d={`${linha(atual)} L${x(ultimo)},${A} L0,${A} Z`} fill="currentColor" className="text-fct-red/10" />}
            {atual.length > 1 && <path d={linha(atual)} fill="none" stroke="currentColor" className="text-fct-red" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />}
          </svg>
          {ultimo >= 0 && (
            <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fct-red ring-2 ring-card" style={{ left: `${(x(ultimo) / L) * 100}%`, top: `${(y(atual[ultimo]) / A) * 100}%` }} aria-hidden />
          )}
        </div>
        <span />
        <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums" aria-hidden>
          {[1, Math.round(diasNoMes / 4), Math.round(diasNoMes / 2), Math.round((3 * diasNoMes) / 4), diasNoMes].map((d) => (
            <span key={d}>dia {d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
