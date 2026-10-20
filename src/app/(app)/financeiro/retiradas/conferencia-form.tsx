"use client";

import { useActionState } from "react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Input } from "@/components/ui/input";
import type { EstadoConferenciaRetirada } from "./actions";

/** Comentário + "Conferido" da filial no período pesquisado (os filtros vão junto, escondidos). */
export function ConferenciaRetiradaForm({
  action,
  filtros,
}: {
  action: (prev: EstadoConferenciaRetirada, fd: FormData) => Promise<EstadoConferenciaRetirada>;
  filtros: Record<string, string | undefined>;
}) {
  const [estado, enviar] = useActionState(action, {});
  return (
    <form action={enviar} className="space-y-3">
      {Object.entries(filtros).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input name="comentario" placeholder="Comentário (opcional)" maxLength={1000} aria-label="Comentário" className="sm:flex-1" />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="conferido" className="size-4" />
          Conferido
        </label>
        <BotaoSalvar rotuloPendente="Salvando…">Salvar</BotaoSalvar>
      </div>
    </form>
  );
}
