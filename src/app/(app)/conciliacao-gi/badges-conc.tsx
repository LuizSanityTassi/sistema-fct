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
import { TOM } from "@/lib/tons";

const CLASSE_GRUPO: Record<GrupoItem, string> = {
  exato: TOM.sucesso,
  aproximado: TOM.atencao,
  so_trier: TOM.perigo,
  so_dda: TOM.info,
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
  pendente: TOM.perigo,
  em_analise: TOM.atencao,
  resolvido: TOM.sucesso,
  justificado: TOM.neutro,
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
  3: TOM.perigo,
  2: TOM.atencao,
  1: TOM.sucesso,
};

export function BadgePrioridadePendencia({ prioridade }: { prioridade: Prioridade }) {
  return (
    <Badge variant="outline" className={CLASSE_PRIORIDADE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

const CLASSE_TIPO: Record<TipoArquivoConc, string> = {
  dda_ret: TOM.info,
  dda_planilha: TOM.info,
  trier: TOM.destaque,
  omie: TOM.neutro,
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
