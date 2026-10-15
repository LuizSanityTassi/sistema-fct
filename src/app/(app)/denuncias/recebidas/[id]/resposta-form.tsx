"use client";

import * as React from "react";
import { useActionState } from "react";
import { Send } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { STATUS_DENUNCIA, type StatusDenuncia } from "@/lib/denuncias/rotulos";
import type { EstadoResposta } from "../../actions";

export function RespostaForm({ action, status }: { action: (prev: EstadoResposta, fd: FormData) => Promise<EstadoResposta>; status: StatusDenuncia }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const formRef = React.useRef<HTMLFormElement>(null);
  const [interna, setInterna] = React.useState(false);

  React.useEffect(() => {
    if (estado.ok) formRef.current?.reset();
  }, [estado]);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-4"
    >
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id="status" label="Situação">
        <SelectNativo id="status" name="status" defaultValue={status} key={status}>
          {Object.entries(STATUS_DENUNCIA).map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </SelectNativo>
      </Campo>
      <Campo id="mensagem" label={interna ? "Anotação interna" : "Mensagem para quem denunciou"} dica={interna ? "Só o comitê vê." : "Quem denunciou vê ao consultar com o protocolo e a chave."}>
        <textarea
          id="mensagem"
          name="mensagem"
          rows={5}
          maxLength={5000}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="interna" checked={interna} onChange={(e) => setInterna(e.target.checked)} className="size-4" />
        Anotação interna (quem denunciou não vê)
      </label>
      <Button type="submit" disabled={pendente}>
        <Send data-icon="inline-start" />
        {pendente ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
