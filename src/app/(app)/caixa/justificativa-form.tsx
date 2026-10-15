"use client";

import * as React from "react";
import { useActionState } from "react";
import { Send } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoJustificativa } from "./actions";

export function JustificativaForm({ action, id, atual }: { action: (prev: EstadoJustificativa, fd: FormData) => Promise<EstadoJustificativa>; id: string; atual: string | null }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-2"
    >
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id={`just-${id}`} label={atual ? "Corrigir a justificativa" : "O que aconteceu?"} dica="Conte com detalhe: o financeiro decide se mantém o desconto ou abona.">
        <textarea
          id={`just-${id}`}
          name="justificativa"
          rows={3}
          minLength={10}
          maxLength={2000}
          required
          defaultValue={atual ?? ""}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Campo>
      <Button type="submit" size="sm" disabled={pendente}>
        <Send data-icon="inline-start" />
        {pendente ? "Enviando…" : atual ? "Atualizar justificativa" : "Enviar justificativa"}
      </Button>
    </form>
  );
}
