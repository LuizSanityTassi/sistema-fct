"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import type { LembreteDre } from "@/lib/financeiro/dre-lembrete";
import type { EstadoLembrete } from "../actions";

/** Configura o lembrete no sino: a partir de que dia do mês a DRE do mês anterior conta como atrasada. */
export function LembreteForm({ action, config, podeEditar }: { action: (prev: EstadoLembrete, fd: FormData) => Promise<EstadoLembrete>; config: LembreteDre; podeEditar: boolean }) {
  const [estado, enviar] = useActionState(action, {});
  return (
    <form action={enviar} className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <fieldset disabled={!podeEditar} className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ligado" defaultChecked={config.ligado} className="size-4 accent-fct-tinta" />
          Avisar no sino
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">A partir do dia</span>
          <SelectNativo name="dia" defaultValue={String(config.dia)} className="w-24">
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectNativo>
        </label>
        {podeEditar && <BotaoSalvar>Salvar</BotaoSalvar>}
      </fieldset>
    </form>
  );
}
