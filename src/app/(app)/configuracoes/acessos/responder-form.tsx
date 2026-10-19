"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check, CheckCircle2, X } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoResposta } from "./actions";

/** Atender ou recusar um pedido, com recado opcional para quem pediu. */
export function ResponderPedidoForm({ action, id }: { action: (prev: EstadoResposta, fd: FormData) => Promise<EstadoResposta>; id: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const idRecado = React.useId();
  if (estado.ok) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {estado.ok}
      </p>
    );
  }
  return (
    <form action={enviar} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label htmlFor={idRecado} className="sr-only">
        Recado para quem pediu (opcional)
      </label>
      <input
        id={idRecado}
        name="resposta"
        maxLength={1000}
        placeholder="Recado para quem pediu (opcional)"
        className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <ErroFormulario mensagem={estado.erro} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decisao" value="atendida" size="sm" disabled={pendente}>
          <Check data-icon="inline-start" />
          Marcar como atendido
        </Button>
        <Button type="submit" name="decisao" value="recusada" size="sm" variant="outline" disabled={pendente} className="text-red-700">
          <X data-icon="inline-start" />
          Recusar
        </Button>
      </div>
    </form>
  );
}
