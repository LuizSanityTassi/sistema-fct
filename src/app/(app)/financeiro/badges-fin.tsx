import { Badge } from "@/components/ui/badge";
import { COR_GRUPO } from "@/lib/financeiro/formatos";
import { ORIGEM_FIN_LABEL, TIPO_FIN_LABEL, type FinOrigem, type FinTipo } from "@/lib/financeiro/rotulos";
import { cn } from "@/lib/utils";

const CLASSE_TIPO: Record<FinTipo, string> = {
  receber: "border-emerald-200 bg-emerald-50 text-emerald-700",
  pagar: "border-red-200 bg-red-50 text-red-700",
};

export function BadgeTipoFin({ tipo }: { tipo: FinTipo }) {
  return (
    <Badge variant="outline" className={CLASSE_TIPO[tipo]}>
      {TIPO_FIN_LABEL[tipo]}
    </Badge>
  );
}

export function BadgeOrigemFin({ origem }: { origem: FinOrigem }) {
  return (
    <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
      {ORIGEM_FIN_LABEL[origem]}
    </Badge>
  );
}

export function BadgeMesFechado() {
  return (
    <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
      Mês fechado
    </Badge>
  );
}

/** Nome do grupo financeiro na cor combinada (VARELA vermelho, NAZÁRIO azul). */
export function RotuloGrupo({ grupo, className }: { grupo: string; className?: string }) {
  return <span className={cn("font-semibold", COR_GRUPO[grupo] ?? "text-foreground", className)}>{grupo}</span>;
}

/** Valor com a cor do tipo: receitas em verde, despesas em vermelho. */
export function ValorTipo({ tipo, children }: { tipo: FinTipo; children: React.ReactNode }) {
  return <span className={cn("tabular-nums", tipo === "receber" ? "text-emerald-700" : "text-red-700")}>{children}</span>;
}
