"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = { action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>; hoje: string };

export function MovimentoForm({ action, hoje }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  return (
    <details className="group border-t">
      <summary className="cursor-pointer px-5 py-3 text-sm font-medium select-none">Lançar no banco (compensação, pagamento, saldo inicial…)</summary>
      <form action={formAction} noValidate className="space-y-3 px-5 pb-4">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="mv-tipo" label="Tipo" obrigatorio erro={erro("tipo")}>
            <SelectNativo id="mv-tipo" name="tipo" defaultValue="compensacao">
              <option value="compensacao">Compensação (folga/saída antecipada)</option>
              <option value="pagamento">Pago em folha</option>
              <option value="saldo_inicial">Saldo inicial (de antes do sistema)</option>
              <option value="ajuste">Ajuste manual</option>
            </SelectNativo>
          </Campo>
          <Campo id="mv-sinal" label="Efeito">
            <SelectNativo id="mv-sinal" name="sinal" defaultValue="-">
              <option value="-">Tira horas do banco (−)</option>
              <option value="+">Põe horas no banco (+)</option>
            </SelectNativo>
          </Campo>
          <Campo id="mv-horas" label="Horas" obrigatorio erro={erro("horas")} dica="2:30 ou 2,5">
            <Input id="mv-horas" name="horas" inputMode="decimal" placeholder="0:00" aria-invalid={!!erro("horas")} />
          </Campo>
          <Campo id="mv-data" label="Data" obrigatorio erro={erro("data")}>
            <Input id="mv-data" name="data" type="date" defaultValue={hoje} aria-invalid={!!erro("data")} />
          </Campo>
          <Campo id="mv-desc" label="Descrição" obrigatorio erro={erro("descricao")} className="sm:col-span-2 lg:col-span-4">
            <Input id="mv-desc" name="descricao" maxLength={300} placeholder="Ex.: folga compensada em 14/11; horas pagas na folha de outubro" aria-invalid={!!erro("descricao")} />
          </Campo>
        </div>
        <BotaoSalvar>Lançar</BotaoSalvar>
      </form>
    </details>
  );
}
