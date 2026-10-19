import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TOM } from "@/lib/tons";

export function BadgeAtivo({ ativo, className }: { ativo: boolean; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        ativo
          ? TOM.sucesso
          : TOM.neutro,
        className,
      )}
    >
      {ativo ? "Ativa" : "Inativa"}
    </Badge>
  );
}

const STATUS_FUNCIONARIO: Record<string, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: TOM.sucesso },
  afastado: { rotulo: "Afastado", classe: TOM.atencao },
  ferias: { rotulo: "Férias", classe: TOM.info },
  desligado: { rotulo: "Desligado", classe: TOM.neutro },
};

export function BadgeStatusFuncionario({ status }: { status: string }) {
  const s = STATUS_FUNCIONARIO[status] ?? { rotulo: status, classe: "" };
  return (
    <Badge variant="outline" className={s.classe}>
      {s.rotulo}
    </Badge>
  );
}
