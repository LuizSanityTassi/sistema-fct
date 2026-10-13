import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  titulo: string;
  descricao?: string;
  /** Rótulo pequeno acima do título (ex.: nome do módulo). */
  eyebrow?: string;
  /** Botões/ações alinhados à direita. */
  acoes?: ReactNode;
  className?: string;
};

export function PageHeader({ titulo, descricao, eyebrow, acoes, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-fct-red">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{titulo}</h1>
        {descricao && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
    </div>
  );
}
