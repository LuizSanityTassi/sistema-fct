import type { ComponentProps, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CampoProps = {
  id: string;
  label: string;
  erro?: string;
  dica?: string;
  obrigatorio?: boolean;
  className?: string;
  children: ReactNode;
};

/** Rótulo + controle + mensagem de erro/dica, no padrão de todos os formulários. */
export function Campo({ id, label, erro, dica, obrigatorio, className, children }: CampoProps) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {obrigatorio && (
          <span aria-hidden className="text-fct-red">
            *
          </span>
        )}
      </Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="text-xs text-destructive">
          {erro}
        </p>
      ) : dica ? (
        <p className="text-xs text-muted-foreground">{dica}</p>
      ) : null}
    </div>
  );
}

/** <select> nativo com o mesmo visual do Input (funciona sem JavaScript, inclusive em formulários GET). */
export function SelectNativo({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function ErroFormulario({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {mensagem}
    </div>
  );
}

export function AvisoSucesso({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
    >
      {mensagem}
    </div>
  );
}
