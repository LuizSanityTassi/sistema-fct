"use client";

import { useActionState } from "react";
import { TriangleAlert } from "lucide-react";
import { Campo, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoCodigoLeitor } from "./actions";

type Props = {
  acao: (prev: EstadoCodigoLeitor, fd: FormData) => Promise<EstadoCodigoLeitor>;
  filiais: { id: string; codigo: string; nome: string }[];
};

/** Gera o código que ativa o leitor de digital no computador de uma filial. */
export function FormCodigoLeitor({ acao, filiais }: Props) {
  const [estado, enviar, pendente] = useActionState(acao, {});
  const filial = filiais.find((f) => f.id === estado.filial);
  return (
    <form action={enviar} className="grid gap-3 px-5 pb-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <Campo id="leitor-filial" label="Filial">
        <SelectNativo id="leitor-filial" name="filial" required defaultValue="">
          <option value="" disabled>
            Escolha…
          </option>
          {filiais.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codigo} — {f.nome}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <Button type="submit" disabled={pendente}>
        {pendente ? "Gerando…" : "Gerar código"}
      </Button>
      {estado.erro && (
        <p role="alert" className="flex items-start gap-2 text-sm text-red-700 sm:col-span-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {estado.erro}
        </p>
      )}
      {estado.codigo && (
        <div role="status" className="rounded-lg border bg-muted/40 px-4 py-3 sm:col-span-2">
          <p className="font-mono text-2xl font-semibold tracking-[0.2em] select-all">{estado.codigo}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Na {filial ? `${filial.codigo} ${filial.nome}` : "filial"}, abra o relógio, clique em Ativar leitor de digital e digite este código. Ele vale uma vez, por 30 minutos.
          </p>
        </div>
      )}
    </form>
  );
}
