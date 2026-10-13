import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function BadgeAtivo({ ativo, className }: { ativo: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        ativo
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      {ativo ? "Ativa" : "Inativa"}
    </Badge>
  );
}

const STATUS_FUNCIONARIO: Record<string, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  afastado: { rotulo: "Afastado", classe: "border-amber-200 bg-amber-50 text-amber-800" },
  ferias: { rotulo: "Férias", classe: "border-sky-200 bg-sky-50 text-sky-700" },
  desligado: { rotulo: "Desligado", classe: "border-border bg-muted text-muted-foreground" },
};

export function BadgeStatusFuncionario({ status }: { status: string }) {
  const s = STATUS_FUNCIONARIO[status] ?? { rotulo: status, classe: "" };
  return (
    <Badge variant="outline" className={s.classe}>
      {s.rotulo}
    </Badge>
  );
}
