"use client";

import * as React from "react";
import { useActionState } from "react";
import { FileUp } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { importarCrm } from "./actions";

/** Envio do CSV do Bunker (um dia por arquivo). */
export function ImportarCrm({ ontem, hoje }: { ontem: string; hoje: string }) {
  const [estado, enviar, pendente] = useActionState(importarCrm, {});
  const form = React.useRef<HTMLFormElement>(null);
  React.useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={enviar} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Dia das vendas</span>
          <Input type="date" name="dia" defaultValue={ontem} max={hoje} required disabled={pendente} className="w-44" />
        </label>
        <label className="grid min-w-64 flex-1 gap-1 text-sm">
          <span className="font-medium">Arquivo CSV do Bunker</span>
          <Input type="file" name="arquivo" accept=".csv,text/csv" required disabled={pendente} />
        </label>
        <Button type="submit" disabled={pendente}>
          <FileUp data-icon="inline-start" />
          {pendente ? "Enviando…" : "Enviar"}
        </Button>
      </div>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {!!estado.avisos?.length && (
        <ul className="list-disc space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 py-2 pr-3 pl-7 text-xs text-amber-900">
          {estado.avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
