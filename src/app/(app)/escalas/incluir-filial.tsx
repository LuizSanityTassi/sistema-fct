"use client";

import { useActionState } from "react";
import { Plus } from "lucide-react";
import { ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { incluirFilialEscala } from "./actions";

/** Coloca na escala uma filial que ainda não está (a equipe vem do cadastro do RH). */
export function IncluirFilial({ filiais }: { filiais: { id: string; codigo: string; nome: string; regional: string | null }[] }) {
  const [estado, enviar, pendente] = useActionState(incluirFilialEscala, {});
  return (
    <form action={enviar} className="mt-4 space-y-2 rounded-xl border bg-card p-5">
      <h2 className="text-sm font-semibold">Incluir filial na escala</h2>
      <p className="text-xs text-muted-foreground">A equipe vem do cadastro do RH (ativos, afastados e de férias); depois é só conferir funções e informar o horário da loja.</p>
      <ErroFormulario mensagem={estado.erro} />
      <div className="flex flex-wrap items-center gap-2">
        <SelectNativo name="branch_id" required defaultValue="" className="w-80" aria-label="Filial">
          <option value="">Selecione a filial</option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codigo} — {f.nome}
              {f.regional ? ` (${f.regional})` : ""}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline" disabled={pendente}>
          <Plus data-icon="inline-start" />
          {pendente ? "Incluindo…" : "Incluir"}
        </Button>
      </div>
    </form>
  );
}
