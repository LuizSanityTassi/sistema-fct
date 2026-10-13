import { Badge } from "@/components/ui/badge";
import { STATUS_ATIVO_LABEL, type StatusAtivo } from "@/lib/ti/rotulos";

const CLASSE_STATUS: Record<StatusAtivo, string> = {
  em_uso: "border-emerald-200 bg-emerald-50 text-emerald-700",
  estoque: "border-sky-200 bg-sky-50 text-sky-700",
  manutencao: "border-amber-200 bg-amber-50 text-amber-800",
  baixado: "border-border bg-muted text-muted-foreground",
};

export function BadgeAtivo({ status }: { status: StatusAtivo }) {
  return (
    <Badge variant="outline" className={CLASSE_STATUS[status]}>
      {STATUS_ATIVO_LABEL[status]}
    </Badge>
  );
}
