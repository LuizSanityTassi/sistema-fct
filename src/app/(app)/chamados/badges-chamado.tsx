import { Badge } from "@/components/ui/badge";
import {
  CATEGORIA_CHAMADO_LABEL,
  PRIORIDADE_LABEL,
  STATUS_CHAMADO_LABEL,
  type CategoriaChamado,
  type PrioridadeChamado,
  type StatusChamado,
} from "@/lib/chamados/rotulos";

const CLASSE_STATUS: Record<StatusChamado, string> = {
  aberto: "border-amber-200 bg-amber-50 text-amber-800",
  em_analise: "border-sky-200 bg-sky-50 text-sky-700",
  em_atendimento: "border-sky-200 bg-sky-50 text-sky-700",
  aguardando_usuario: "border-violet-200 bg-violet-50 text-violet-700",
  aguardando_terceiro: "border-violet-200 bg-violet-50 text-violet-700",
  resolvido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelado: "border-border bg-muted text-muted-foreground",
};

const CLASSE_PRIORIDADE: Record<PrioridadeChamado, string> = {
  baixa: "border-border bg-muted text-muted-foreground",
  normal: "border-border bg-card text-foreground",
  alta: "border-orange-200 bg-orange-50 text-orange-700",
  critica: "border-red-200 bg-red-50 text-red-700",
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

export function BadgeCategoria({ categoria }: { categoria: CategoriaChamado }) {
  return (
    <Badge variant="secondary" className="font-medium">
      {CATEGORIA_CHAMADO_LABEL[categoria]}
    </Badge>
  );
}
