"use client";

import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { LINHAS_RATEIO, ROTULO_LINHA, SUGESTOES_RATEIO, type LinhaRateio } from "@/lib/financeiro/dre-contabil";
import type { EstadoRateio } from "./actions";

/** Lança um valor da empresa no mês para o sistema dividir entre as filiais pelo faturamento. */
export function RateioForm({ action, empresa, mes }: { action: (prev: EstadoRateio, fd: FormData) => Promise<EstadoRateio>; empresa: string; mes: string }) {
  const [estado, enviar] = useActionState(action, {});
  const [linha, setLinha] = React.useState<LinhaRateio>("despesas_financeiras");
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="empresa" value={empresa} />
      <input type="hidden" name="mes" value={mes} />
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1.2fr_10rem_1.4fr_auto] lg:items-end">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">O que é</span>
          <Input
            name="item"
            list="itens-rateio"
            maxLength={60}
            required
            placeholder="Ex.: Despesa financeira"
            onChange={(e) => {
              const s = SUGESTOES_RATEIO.find((x) => x.item.toLowerCase() === e.target.value.trim().toLowerCase());
              if (s) setLinha(s.linha);
            }}
          />
          <datalist id="itens-rateio">
            {SUGESTOES_RATEIO.map((s) => (
              <option key={s.item} value={s.item} />
            ))}
          </datalist>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Entra na conta</span>
          <SelectNativo name="linha" value={linha} onChange={(e) => setLinha(e.target.value as LinhaRateio)}>
            {LINHAS_RATEIO.map((l) => (
              <option key={l} value={l}>
                {ROTULO_LINHA[l].replace(/^\(−\) /, "")}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Total do mês (R$)</span>
          <Input name="valor" inputMode="decimal" required placeholder="59.145,00" className="text-right tabular-nums" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Observação</span>
          <Input name="observacao" maxLength={300} placeholder="Opcional" />
        </label>
        <BotaoSalvar rotuloPendente="Rateando…">Ratear</BotaoSalvar>
      </div>
      <p className="text-xs text-muted-foreground">Digite o valor sem sinal: despesa e imposto entram negativos na DRE; receita financeira e outras receitas, positivas. Mesmo item no mesmo mês troca o valor.</p>
    </form>
  );
}
