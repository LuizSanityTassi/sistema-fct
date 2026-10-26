"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { AUSENCIA_LABEL } from "@/lib/ponto/calculo";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  funcionarios: { id: string; nome: string; filial: string }[];
  hoje: string;
};

export function AusenciaForm({ action, funcionarios, hoje }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  return (
    <form action={formAction} noValidate className="space-y-3 border-t p-5">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.5fr)_1fr_10rem_10rem]">
        <Campo id="au-func" label="Funcionário" obrigatorio erro={erro("employee_id")}>
          <SelectNativo id="au-func" name="employee_id" defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome} · {f.filial}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="au-tipo" label="Tipo" obrigatorio erro={erro("tipo")}>
          <SelectNativo id="au-tipo" name="tipo" defaultValue="atestado">
            {Object.entries(AUSENCIA_LABEL).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="au-ini" label="Primeiro dia" obrigatorio erro={erro("inicio")}>
          <Input id="au-ini" name="inicio" type="date" defaultValue={hoje} aria-invalid={!!erro("inicio")} />
        </Campo>
        <Campo id="au-fim" label="Último dia" erro={erro("fim")} dica="Vazio = um dia só">
          <Input id="au-fim" name="fim" type="date" aria-invalid={!!erro("fim")} />
        </Campo>
        <Campo id="au-obs" label="Observação" erro={erro("observacao")} className="sm:col-span-2 lg:col-span-4">
          <Input id="au-obs" name="observacao" maxLength={300} placeholder="Ex.: atestado de 2 dias (CID não precisa); férias do período aquisitivo 2025" />
        </Campo>
      </div>
      <BotaoSalvar>Lançar ausência</BotaoSalvar>
      <p className="text-xs text-muted-foreground">Folga compensatória tira as horas do dia do banco de horas; as demais apenas não contam como falta.</p>
    </form>
  );
}
