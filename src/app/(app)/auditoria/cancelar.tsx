"use client";

import * as React from "react";
import { useActionState } from "react";
import { Ban } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAud } from "./actions";

/** Cancelar (checklist ou auditoria de precificação) com o motivo; fica registrado quem cancelou. */
export function CancelarAuditoria({ action, rotulo = "Cancelar" }: { action: (prev: EstadoAud, fd: FormData) => Promise<EstadoAud>; rotulo?: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [aberto, setAberto] = React.useState(false);
  if (estado.ok) return <AvisoSucesso mensagem={estado.ok} />;
  if (!aberto)
    return (
      <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => setAberto(true)}>
        <Ban data-icon="inline-start" />
        {rotulo}
      </Button>
    );
  return (
    <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
      <ErroFormulario mensagem={estado.erro} />
      <label htmlFor="motivo-cancelar" className="text-sm font-medium">
        Motivo do cancelamento
      </label>
      <Input id="motivo-cancelar" name="motivo" maxLength={500} required minLength={5} autoFocus />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
          {pendente ? "Gravando…" : "Confirmar cancelamento"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
    </form>
  );
}
