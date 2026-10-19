import { Badge } from "@/components/ui/badge";
import { COR_GRUPO } from "@/lib/financeiro/formatos";
import { ORIGEM_FIN_LABEL, TIPO_FIN_LABEL, type FinOrigem, type FinTipo } from "@/lib/financeiro/rotulos";
import { cn } from "@/lib/utils";
import { TOM } from "@/lib/tons";

const CLASSE_TIPO: Record<FinTipo, string> = {
  receber: TOM.sucesso,
  pagar: TOM.perigo,
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
    <Badge variant="outline" className={TOM.neutro}>
      {ORIGEM_FIN_LABEL[origem]}
    </Badge>
  );
}

export function BadgeMesFechado() {
  return (
    <Badge variant="outline" className={TOM.atencao}>
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
