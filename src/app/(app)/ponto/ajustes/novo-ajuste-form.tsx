"use client";

import { useActionState, useState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { MOTIVO_AJUSTE_LABEL, TIPO_MARCACAO_LABEL, TIPOS_MARCACAO, TIPOS_NORMAIS, type TipoMarcacao } from "@/lib/ponto/calculo";
import type { EstadoPonto } from "@/lib/ponto/form";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  employeeId: string;
  data: string;
  marcacoes: { id: string; hora: string; tipo: TipoMarcacao; metodo: string }[];
  sugestaoTipo: TipoMarcacao;
  /** Incluir entrada ou saída extra por ajuste é só do RH/DP. */
  podeExtra: boolean;
};

const ACOES = [
  { v: "incluir", r: "Incluir marcação que faltou", d: "Esqueceu de marcar ou o relógio falhou" },
  { v: "alterar", r: "Corrigir o horário de uma marcação", d: "Marcou, mas o horário ficou errado" },
  { v: "anular", r: "Anular uma marcação", d: "Marcação feita por engano (duplicada, outro dia…)" },
] as const;

export function NovoAjusteForm({ action, employeeId, data, marcacoes, sugestaoTipo, podeExtra }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const [acao, setAcao] = useState<"incluir" | "alterar" | "anular">("incluir");
  const erro = (c: string) => estado.erros?.[c];
  return (
    <form action={formAction} noValidate className="space-y-4 border-t p-5">
      <input type="hidden" name="employee_id" value={employeeId} />
      <input type="hidden" name="data" value={data} />
      <ErroFormulario mensagem={estado.erro} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">O que precisa mudar?</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {ACOES.filter((a) => a.v === "incluir" || marcacoes.length).map((a) => (
            <label key={a.v} className={cn("cursor-pointer rounded-lg border p-3 text-sm transition-colors", acao === a.v ? "border-fct-tinta bg-fct-tinta/5" : "hover:bg-muted/50")}>
              <input type="radio" name="acao" value={a.v} checked={acao === a.v} onChange={() => setAcao(a.v)} className="sr-only" />
              <span className="font-medium">{a.r}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{a.d}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {acao !== "incluir" && (
        <Campo id="aj-marc" label="Qual marcação?" obrigatorio erro={erro("marcacao_id")}>
          <div id="aj-marc" className="flex flex-wrap gap-2">
            {marcacoes.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-checked:border-fct-tinta has-checked:bg-fct-tinta/5">
                <input type="radio" name="marcacao_id" value={m.id} className="accent-fct-tinta" />
                <span className="font-semibold tabular-nums">{m.hora}</span> {TIPO_MARCACAO_LABEL[m.tipo]}
              </label>
            ))}
          </div>
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {acao === "incluir" && (
          <Campo id="aj-tipo" label="Tipo" obrigatorio erro={erro("tipo_marcacao")}>
            <SelectNativo id="aj-tipo" name="tipo_marcacao" defaultValue={sugestaoTipo}>
              {(podeExtra ? TIPOS_MARCACAO : TIPOS_NORMAIS).map((t) => (
                <option key={t} value={t}>
                  {TIPO_MARCACAO_LABEL[t]}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        )}
        {acao !== "anular" && (
          <Campo id="aj-hora" label="Horário certo" obrigatorio erro={erro("horario")}>
            <Input id="aj-hora" name="horario" type="time" aria-invalid={!!erro("horario")} />
          </Campo>
        )}
        {acao !== "anular" && (
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted-foreground">
            <input type="checkbox" name="dia_seguinte" className="size-4 accent-fct-tinta" />
            Depois da meia-noite (turno da noite)
          </label>
        )}
        <Campo id="aj-mot" label="Motivo" obrigatorio erro={erro("motivo_tipo")}>
          <SelectNativo id="aj-mot" name="motivo_tipo" defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {Object.entries(MOTIVO_AJUSTE_LABEL).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </Campo>
      </div>
      <Campo id="aj-just" label="Explique" obrigatorio erro={erro("motivo")} dica="O gestor lê isto para aprovar. Fica no histórico.">
        <Input id="aj-just" name="motivo" maxLength={500} placeholder="Ex.: o relógio estava sem internet às 08:00; cheguei no horário" aria-invalid={!!erro("motivo")} />
      </Campo>
      <BotaoSalvar rotuloPendente="Enviando…">Enviar pedido</BotaoSalvar>
    </form>
  );
}
