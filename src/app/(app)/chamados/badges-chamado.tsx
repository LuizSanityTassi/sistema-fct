import { Badge } from "@/components/ui/badge";
import {
  CATEGORIA_CHAMADO_LABEL,
  PRIORIDADE_LABEL,
  STATUS_CHAMADO_LABEL,
  type CategoriaChamado,
  type PrioridadeChamado,
  type StatusChamado,
} from "@/lib/chamados/rotulos";
import { rotuloTipo } from "@/lib/chamados/tipos";
import { TOM } from "@/lib/tons";

const CLASSE_STATUS: Record<StatusChamado, string> = {
  aberto: TOM.atencao,
  em_analise: TOM.info,
  em_atendimento: TOM.info,
  aguardando_usuario: TOM.destaque,
  aguardando_terceiro: TOM.destaque,
  resolvido: TOM.sucesso,
  cancelado: TOM.neutro,
};

const CLASSE_PRIORIDADE: Record<PrioridadeChamado, string> = {
  baixa: TOM.neutro,
  normal: "border-border bg-card text-foreground",
  alta: TOM.alerta,
  critica: TOM.perigo,
};

export function BadgeStatusChamado({ status }: { status: StatusChamado }) {
  return (
    <Badge variant="outline" className={CLASSE_STATUS[status]}>
      {STATUS_CHAMADO_LABEL[status]}
    </Badge>
  );
}

export function BadgePrioridade({ prioridade }: { prioridade: PrioridadeChamado }) {
  return (
    <Badge variant="outline" className={CLASSE_PRIORIDADE[prioridade]}>
      {PRIORIDADE_LABEL[prioridade]}
    </Badge>
  );
}

/** Tipo do chamado (Admissão, Férias…) com o setor que atende; chamado antigo sem tipo mostra só o setor. */
export function BadgeTipo({ subcategoria, categoria }: { subcategoria: string | null; categoria: CategoriaChamado }) {
  const tipo = rotuloTipo(subcategoria);
  if (!tipo) return <BadgeCategoria categoria={categoria} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge variant="secondary" className="font-medium">
        {tipo}
      </Badge>
      <span className="text-xs text-muted-foreground">{CATEGORIA_CHAMADO_LABEL[categoria]}</span>
    </span>
  );
}

export function BadgeCategoria({ categoria }: { categoria: CategoriaChamado }) {
  return (
    <Badge variant="secondary" className="font-medium">
      {CATEGORIA_CHAMADO_LABEL[categoria]}
    </Badge>
  );
}
