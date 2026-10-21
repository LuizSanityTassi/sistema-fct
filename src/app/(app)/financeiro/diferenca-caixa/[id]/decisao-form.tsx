"use client";

import * as React from "react";
import { useActionState } from "react";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoDecisao } from "../actions";

export function DecisaoForm({ action, andamento }: { action: (prev: EstadoDecisao, fd: FormData) => Promise<EstadoDecisao>; andamento: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const decidida = andamento === "mantida" || andamento === "abonada";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-3"
    >
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id="obs" label="Observação do financeiro" dica="Obrigatória para abonar. Quem justificou não vê este texto.">
        <textarea
          id="obs"
          name="obs"
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Campo>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decisao" value="mantida" disabled={pendente} className="bg-red-700 text-white hover:bg-red-800">
          Manter o desconto
        </Button>
        <Button type="submit" name="decisao" value="abonada" disabled={pendente} variant="outline" className="border-emerald-300 text-emerald-800">
          Abonar (sem desconto)
        </Button>
        {(decidida || andamento === "justificada") && (
          <Button type="submit" name="decisao" value="pendente" disabled={pendente} variant="ghost">
            Reabrir para justificar
          </Button>
        )}
      </div>
    </form>
  );
}
