"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { GrupoGestores } from "@/lib/caixa/gestores";
import type { EstadoDecisao } from "../actions";

/** Escolhe o gestor (um usuário do sistema) que justifica as quebras; serve para a loja e para uma quebra só. */
export function GestorForm({
  action,
  atual,
  grupos,
  rotulo,
  mostrarMover,
  semGestor = "— sem gestor (fica com o gerente da loja) —",
}: {
  action: (prev: EstadoDecisao, fd: FormData) => Promise<EstadoDecisao>;
  atual: string | null;
  grupos: GrupoGestores[];
  rotulo: string;
  mostrarMover?: boolean;
  semGestor?: string;
}) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [valor, setValor] = React.useState(atual ?? "");
  const mudou = valor !== (atual ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-1.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <SelectNativo name="gestor_id" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={rotulo} className="min-w-64 flex-1">
          <option value="">{semGestor}</option>
          {grupos.map((g) => (
            <optgroup key={g.titulo} label={g.titulo}>
              {g.opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <Button type="submit" size="sm" variant={mudou ? "default" : "outline"} disabled={pendente || !mudou}>
          <Check data-icon="inline-start" />
          {pendente ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      {mostrarMover && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="mover" value="1" defaultChecked className="size-3.5 accent-fct-navy" />
          Levar junto as quebras em aberto desta loja
        </label>
      )}
      {estado.erro && <p className="text-xs text-red-700">{estado.erro}</p>}
      {estado.ok && !mudou && <p className="text-xs text-emerald-700">{estado.ok}</p>}
    </form>
  );
}
