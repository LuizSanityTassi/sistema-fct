"use client";

import { useActionState } from "react";
import { Lock } from "lucide-react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { SelectNativo } from "@/components/form/campo";
import { travarMesContabil, type EstadoTrava } from "./trava-contabil-actions";

/** Escolhe o mês (padrão: o que passou) e trava. */
export function TravarMesForm({ meses, padrao }: { meses: { valor: string; rotulo: string }[]; padrao: string }) {
  const [estado, acao] = useActionState<EstadoTrava, FormData>(travarMesContabil, {});
  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      <label htmlFor="trava-mes" className="text-sm">
        Travar
      </label>
      <SelectNativo id="trava-mes" name="mes" defaultValue={padrao} className="w-44">
        {meses.map((m) => (
          <option key={m.valor} value={m.valor}>
            {m.rotulo}
          </option>
        ))}
      </SelectNativo>
      <BotaoSalvar size="sm" rotuloPendente="Travando…">
        <Lock data-icon="inline-start" />
        Travar mês
      </BotaoSalvar>
      {estado.erro && <p role="alert" className="w-full text-xs text-red-700">{estado.erro}</p>}
      {estado.ok && <p role="status" className="w-full text-xs text-emerald-700">{estado.ok}</p>}
    </form>
  );
}
