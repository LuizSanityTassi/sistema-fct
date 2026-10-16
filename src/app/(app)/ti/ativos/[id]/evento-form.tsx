"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus } from "lucide-react";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EVENTOS_MANUAIS, TIPOS_EVENTO_ATIVO } from "@/lib/ti/rotulos";
import type { EstadoEvento } from "../actions";

/** Registro manual no histórico: manutenção, troca de peça ou anotação. */
export function EventoForm({ action, hoje }: { action: (prev: EstadoEvento, fd: FormData) => Promise<EstadoEvento>; hoje: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const ref = React.useRef<HTMLFormElement>(null);
  // registrou: limpa o texto para o próximo
  React.useEffect(() => {
    if (estado.ok) ref.current?.reset();
  }, [estado]);
  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-2 border-t pt-3"
    >
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
        <SelectNativo name="tipo" defaultValue="manutencao" aria-label="Tipo de registro" className="sm:w-40">
          {EVENTOS_MANUAIS.map((t) => (
            <option key={t} value={t}>
              {TIPOS_EVENTO_ATIVO[t]}
            </option>
          ))}
        </SelectNativo>
        <Input name="data" type="date" defaultValue={hoje} aria-label="Data" className="sm:w-40" />
        <Input name="descricao" maxLength={1000} placeholder="Ex.: troca do SSD, limpeza, formatação" aria-label="O que foi feito" required />
        <Button type="submit" size="sm" disabled={pendente}>
          <Plus data-icon="inline-start" />
          {pendente ? "Registrando…" : "Registrar"}
        </Button>
      </div>
    </form>
  );
}
