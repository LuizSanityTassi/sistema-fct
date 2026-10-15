"use client";

import * as React from "react";
import { useActionState } from "react";
import { Check } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoVinculo } from "../actions";

export type OpcaoFuncionario = { id: string; rotulo: string };
export type GrupoFuncionarios = { titulo: string; opcoes: OpcaoFuncionario[] };

/** Liga o operador a um funcionário. A sugestão pelo nome vem pré-selecionada, mas só vale depois de salvar. */
export function VinculoForm({
  action,
  atual,
  sugestao,
  grupos,
  rotulo,
}: {
  action: (prev: EstadoVinculo, fd: FormData) => Promise<EstadoVinculo>;
  atual: string | null;
  sugestao: OpcaoFuncionario | null;
  grupos: GrupoFuncionarios[];
  rotulo: string;
}) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [valor, setValor] = React.useState(atual ?? sugestao?.id ?? "");
  const mudou = valor !== (atual ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <SelectNativo name="employee_id" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Funcionário do operador ${rotulo}`} className="min-w-64 flex-1">
        <option value="">— sem funcionário —</option>
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
        {pendente ? "Salvando…" : !atual && sugestao && valor === sugestao.id ? "Confirmar sugestão" : "Salvar"}
      </Button>
      {estado.erro && <span className="text-xs text-red-700">{estado.erro}</span>}
      {estado.ok && !mudou && <span className="text-xs text-emerald-700">{estado.ok}</span>}
    </form>
  );
}
