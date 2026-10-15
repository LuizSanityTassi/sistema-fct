import { cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
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

type PropsAria = { "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false"; "aria-required"?: boolean; required?: boolean };

/**
 * Rótulo + controle + mensagem de erro/dica, no padrão de todos os formulários.
 * O controle (filho único) recebe aria-describedby (dica/erro), aria-invalid e aria-required,
 * para o leitor de tela anunciar a dica, o erro e se o campo é obrigatório.
 */
export function Campo({ id, label, erro, dica, obrigatorio, className, children }: CampoProps) {
  const idErro = `${id}-erro`;
  const idDica = `${id}-dica`;
  const idMensagem = erro ? idErro : dica ? idDica : undefined;
  let controle = children;
  if (isValidElement(children)) {
    const props = (children as ReactElement<PropsAria>).props;
    const descricao = [props["aria-describedby"], idMensagem].filter(Boolean).join(" ") || undefined;
    controle = cloneElement(children as ReactElement<PropsAria>, {
      "aria-describedby": descricao,
      ...(erro ? { "aria-invalid": true } : {}),
      ...(obrigatorio && !props.required ? { "aria-required": true } : {}),
    });
  }
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {obrigatorio && (
          <>
            <span aria-hidden className="text-fct-red">
              *
            </span>
            <span className="sr-only"> (obrigatório)</span>
          </>
        )}
      </Label>
      {controle}
      {erro ? (
        <p id={idErro} role="alert" className="text-xs font-medium text-destructive">
          {erro}
        </p>
      ) : dica ? (
        <p id={idDica} className="text-xs text-muted-foreground">
          {dica}
        </p>
      ) : null}
    </div>
  );
}

/** <select> nativo com o mesmo visual do Input (funciona sem JavaScript, inclusive em formulários GET). */
export function SelectNativo({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
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

export function AvisoAtencao({ mensagem }: { mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {mensagem}
    </div>
  );
}
