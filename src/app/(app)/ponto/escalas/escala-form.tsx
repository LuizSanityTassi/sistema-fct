"use client";

import { useActionState, useState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { DIAS_SEMANA_CURTO } from "@/lib/ponto/calculo";
import type { EstadoPonto } from "@/lib/ponto/form";
import { cn } from "@/lib/utils";

export const ID_FORM_ESCALA = "form-escala";

type Props = { action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>; de: string; ate: string };

/** Barra "programar escala" (as caixas da grade usam form="form-escala"). */
export function EscalaForm({ action, de, ate }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const [folga, setFolga] = useState(false);
  return (
    <form id={ID_FORM_ESCALA} action={formAction} className="space-y-3 border-t bg-muted/30 px-5 py-4">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">
          De
          <Input type="date" name="de" defaultValue={de} className="h-9 w-40" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Até
          <Input type="date" name="ate" defaultValue={ate} className="h-9 w-40" />
        </label>
        <fieldset className="grid gap-1 text-xs text-muted-foreground">
          <legend className="mb-1">Dias da semana</legend>
          <div className="flex gap-1">
            {DIAS_SEMANA_CURTO.map((d, i) => (
              <label key={d} className="flex cursor-pointer items-center gap-1 rounded-md border bg-background px-2 py-1.5 text-xs has-checked:border-fct-tinta has-checked:bg-fct-tinta/10 has-checked:text-fct-tinta">
                <input type="checkbox" name="dias" value={i} defaultChecked={i !== 0} className="sr-only" />
                {d}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="folga" value="sim" checked={folga} onChange={(e) => setFolga(e.target.checked)} className="size-4 accent-fct-tinta" />
          Folga
        </label>
        {(["entrada", "intervalo_inicio", "intervalo_fim", "saida"] as const).map((c) => (
          <label key={c} className={cn("grid gap-1 text-xs text-muted-foreground", folga && "opacity-40")}>
            {{ entrada: "Entrada", intervalo_inicio: "Intervalo", intervalo_fim: "Retorno", saida: "Saída" }[c]}
            <Input type="time" name={c} disabled={folga} className="h-9 w-28" />
          </label>
        ))}
        <label className="grid min-w-48 flex-1 gap-1 text-xs text-muted-foreground">
          Motivo (opcional)
          <Input name="motivo" maxLength={200} placeholder="Ex.: plantão de domingo, troca de folga" className="h-9" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <BotaoSalvar name="modo" value="salvar" rotuloPendente="Salvando…">
          Salvar escala dos marcados
        </BotaoSalvar>
        <BotaoSalvar name="modo" value="limpar" variant="outline" rotuloPendente="…">
          Voltar à jornada (apagar escala)
        </BotaoSalvar>
      </div>
      <p className="text-xs text-muted-foreground">A escala vale no lugar da jornada só nos dias escolhidos. Mês fechado não aceita mudança.</p>
    </form>
  );
}
