import { Badge } from "@/components/ui/badge";
import { FOLHA_STATUS_LABEL, type StatusFolha } from "@/lib/rh/rotulos";

const CLASSE_STATUS: Record<StatusFolha, string> = {
  rascunho: "border-border bg-muted text-muted-foreground",
  fechada: "border-sky-200 bg-sky-50 text-sky-700",
  paga: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

export function BadgeFolha({ status }: { status: StatusFolha }) {
  return (
    <Badge variant="outline" className={CLASSE_STATUS[status]}>
      {FOLHA_STATUS_LABEL[status]}
    </Badge>
  );
}
