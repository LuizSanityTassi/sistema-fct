import { Badge } from "@/components/ui/badge";
import {
  CATEGORIA_LABEL,
  GRUPO_LABEL,
  PRIORIDADE_LABEL,
  STATUS_PENDENCIA_LABEL,
  TIPO_ARQUIVO_LABEL,
  type GrupoItem,
  type Prioridade,
  type StatusPendencia,
  type TipoArquivoConc,
} from "@/lib/conciliacao/rotulos";
import { cn } from "@/lib/utils";

const CLASSE_GRUPO: Record<GrupoItem, string> = {
  exato: "border-emerald-200 bg-emerald-50 text-emerald-700",
  aproximado: "border-amber-200 bg-amber-50 text-amber-800",
  so_trier: "border-red-200 bg-red-50 text-red-700",
  so_dda: "border-sky-200 bg-sky-50 text-sky-700",
};

export function grupoDaCategoria(categoria: string): GrupoItem {
  if (["EXATO", "TAXA", "AGRUPADO", "COMBINACAO", "DESCONTO", "LIQUIDO"].includes(categoria)) return "exato";
  if (["VALOR_DATA", "DOCUMENTO", "DATA", "VALOR", "FILIAL"].includes(categoria)) return "aproximado";
  if (categoria === "SO_DDA") return "so_dda";
  return "so_trier";
}

export function BadgeCategoria({ categoria, curto }: { categoria: string; curto?: boolean }) {
  const grupo = grupoDaCategoria(categoria);
  return (
    <Badge variant="outline" className={cn(CLASSE_GRUPO[grupo], "max-w-full whitespace-normal text-left")} title={CATEGORIA_LABEL[categoria] ?? categoria}>
      {curto ? GRUPO_LABEL[grupo] : (CATEGORIA_LABEL[categoria] ?? categoria)}
    </Badge>
  );
}

export function BadgeGrupo({ grupo }: { grupo: GrupoItem }) {
  return (
    <Badge variant="outline" className={CLASSE_GRUPO[grupo]}>
      {GRUPO_LABEL[grupo]}
    </Badge>
  );
}

const CLASSE_STATUS: Record<StatusPendencia, string> = {
  pendente: "border-red-200 bg-red-50 text-red-700",
  em_analise: "border-amber-200 bg-amber-50 text-amber-800",
  resolvido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  justificado: "border-border bg-muted text-muted-foreground",
};

export function BadgeStatusPendencia({ status, auto }: { status: StatusPendencia; auto?: boolean }) {
  return (
    <Badge variant="outline" className={CLASSE_STATUS[status]}>
      {STATUS_PENDENCIA_LABEL[status]}
      {auto && status === "resolvido" ? " (auto)" : ""}
    </Badge>
  );
}

const CLASSE_PRIORIDADE: Record<Prioridade, string> = {
  3: "border-red-200 bg-red-50 text-red-700",
  2: "border-amber-200 bg-amber-50 text-amber-800",
  1: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function BadgePrioridadePendencia({ prioridade }: { prioridade: Prioridade }) {
  return (
    <Badge variant="outline" className={CLASSE_PRIORIDADE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

const CLASSE_TIPO: Record<TipoArquivoConc, string> = {
  dda_ret: "border-sky-200 bg-sky-50 text-sky-700",
  dda_planilha: "border-sky-200 bg-sky-50 text-sky-700",
  trier: "border-violet-200 bg-violet-50 text-violet-700",
  omie: "border-border bg-muted text-muted-foreground",
};

export function BadgeTipoArquivo({ tipo }: { tipo: TipoArquivoConc }) {
  return (
    <Badge variant="outline" className={CLASSE_TIPO[tipo]}>
      {TIPO_ARQUIVO_LABEL[tipo]}
    </Badge>
  );
}

/** Código numérico da filial do Trier ("301") com a unidade do sistema, quando conhecida. */
export function Filial({ filial, nome }: { filial: number | null | undefined; nome?: string | null }) {
  if (filial == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span title={nome ?? undefined}>
      <span className="font-mono text-xs text-fct-tinta">{String(filial).padStart(3, "0")}</span>
      {nome ? <span className="hidden text-xs text-muted-foreground xl:inline"> {nome}</span> : null}
    </span>
  );
}
