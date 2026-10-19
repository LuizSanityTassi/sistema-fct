import Link from "next/link";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Inbox, Minus, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Sparkline } from "@/components/graficos";
import { TEXTO, type Tom } from "@/lib/tons";

/** Cartão com cabeçalho (título, descrição e ação à direita): a unidade de conteúdo das telas. */
export function Painel({
  id,
  titulo,
  descricao,
  icone: Icone,
  acao,
  className,
  children,
}: {
  id?: string;
  titulo?: React.ReactNode;
  descricao?: React.ReactNode;
  icone?: LucideIcon;
  acao?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const idTitulo = id ? `${id}-titulo` : undefined;
  return (
    <section id={id} aria-labelledby={titulo ? idTitulo : undefined} className={cn("flex min-w-0 flex-col rounded-xl border bg-card", className)}>
      {(titulo || acao) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            {titulo && (
              <h2 id={idTitulo} className="flex items-center gap-2 text-sm font-semibold">
                {Icone && <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                {titulo}
              </h2>
            )}
            {descricao && <p className="mt-0.5 text-xs text-muted-foreground">{descricao}</p>}
          </div>
          {acao && <div className="shrink-0">{acao}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** "Ver tudo →" do cabeçalho do painel. */
export function LinkPainel({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mr-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {children}
      <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

export type VariacaoIndicador = { texto: string; direcao: "sobe" | "desce" | "igual"; tom: Tom; dica?: string };

const FUNDO_VARIACAO: Partial<Record<Tom, string>> = {
  sucesso: "bg-emerald-50",
  perigo: "bg-red-50",
  atencao: "bg-amber-50",
};

/** Chip da variação: seta + quanto mudou, verde quando melhorou e vermelho quando piorou. */
export function Variacao({ v }: { v: VariacaoIndicador }) {
  const Seta = v.direcao === "sobe" ? ArrowUpRight : v.direcao === "desce" ? ArrowDownRight : Minus;
  return (
    <span title={v.dica} className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums", TEXTO[v.tom], FUNDO_VARIACAO[v.tom] ?? "bg-muted")}>
      <Seta className="size-3.5" aria-hidden />
      {v.texto}
    </span>
  );
}

/** Indicador (KPI): rótulo, número, variação contra o período anterior e minigráfico opcional. */
export function Indicador({
  rotulo,
  valor,
  icone: Icone,
  variacao,
  comparadoCom,
  detalhe,
  serie,
  tomValor,
  href,
  className,
}: {
  rotulo: string;
  valor: React.ReactNode;
  icone?: LucideIcon;
  variacao?: VariacaoIndicador | null;
  /** texto ao lado da variação ("× ago até dia 19") */
  comparadoCom?: React.ReactNode;
  detalhe?: React.ReactNode;
  serie?: number[];
  tomValor?: Tom;
  href?: string;
  className?: string;
}) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="rotulo">{rotulo}</p>
        {Icone && <Icone className="size-4 shrink-0 text-muted-foreground/70" aria-hidden />}
      </div>
      <p className={cn("mt-1.5 numero", tomValor && TEXTO[tomValor])}>{valor}</p>
      {(variacao || comparadoCom) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          {variacao && <Variacao v={variacao} />}
          {comparadoCom && <span>{comparadoCom}</span>}
        </div>
      )}
      {detalhe && <p className="mt-1.5 text-xs text-muted-foreground">{detalhe}</p>}
      {serie && serie.length > 1 && <Sparkline valores={serie} className={cn("mt-3 -mb-1 h-9 w-full", variacao ? TEXTO[variacao.tom === "neutro" ? "info" : variacao.tom] : "text-muted-foreground")} />}
    </>
  );
  const base = cn("flex min-w-0 flex-col rounded-xl border bg-card p-4", className);
  return href ? (
    <Link href={href} className={cn(base, "outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {conteudo}
    </Link>
  ) : (
    <div className={base}>{conteudo}</div>
  );
}

/** Lista/tabela sem itens: ícone, frase curta e, se fizer sentido, a ação para começar. */
export function EstadoVazio({
  icone: Icone = Inbox,
  titulo,
  descricao,
  acao,
  compacto,
  className,
}: {
  icone?: LucideIcon;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acao?: React.ReactNode;
  compacto?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 text-center", compacto ? "px-4 py-6" : "px-6 py-12", className)}>
      <span className={cn("mb-1 flex items-center justify-center rounded-full bg-muted text-muted-foreground ring-6 ring-muted/50", compacto ? "size-8" : "size-10")}>
        <Icone className={compacto ? "size-4" : "size-5"} aria-hidden />
      </span>
      <p className="text-sm font-medium">{titulo}</p>
      {descricao && <p className="max-w-sm text-sm text-muted-foreground">{descricao}</p>}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}
