"use client";

import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import type { EstadoManual } from "./actions";

const reais = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Props = {
  action: (prev: EstadoManual, fd: FormData) => Promise<EstadoManual>;
  empresa: string;
  /** chave = id da filial ou "empresa" (valor da empresa, sem filial) */
  filiais: { chave: string; codigo: string; nome: string }[];
  contas: { linha: string; rotulo: string }[];
  /** valores iniciais já sem sinal, como na planilha ("12.345,67"; vazio = 0), por "chave:conta" */
  iniciais: Record<string, string>;
};

const numero = (t: string) => {
  const s = t.replace(/[R$\s]/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-");
  const n = Number((neg ? s.slice(1) : s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};

/** Grade do lançamento à mão: filiais nas linhas, contas amarelas nas colunas, total de cada conta no rodapé. */
export function LancarForm({ action, empresa, filiais, contas, iniciais }: Props) {
  const [estado, enviar] = useActionState(action, {});
  const [valores, setValores] = React.useState(iniciais);
  const total = (linha: string) => filiais.reduce((t, f) => t + numero(valores[`${f.chave}:${linha}`] ?? ""), 0);
  return (
    <form action={enviar} className="space-y-3">
      <input type="hidden" name="empresa" value={empresa} />
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium">Filial</th>
              {contas.map((c) => (
                <th key={c.linha} className="bg-amber-50 px-2 py-2 text-right text-xs font-medium whitespace-nowrap text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filiais.map((f) => (
              <tr key={f.chave} className="border-b last:border-0 hover:bg-muted/40">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 whitespace-nowrap">
                  <span className="font-mono text-xs text-muted-foreground">{f.codigo}</span> {f.nome}
                </td>
                {contas.map((c) => {
                  const nome = `${f.chave}:${c.linha}`;
                  return (
                    <td key={c.linha} className="px-1 py-1">
                      <input
                        name={`v:${nome}`}
                        value={valores[nome] ?? ""}
                        onChange={(e) => setValores((v) => ({ ...v, [nome]: e.target.value }))}
                        inputMode="decimal"
                        placeholder="0,00"
                        aria-label={`${c.rotulo} · ${f.codigo}`}
                        className="h-8 w-28 rounded-md border bg-background px-2 text-right tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/50 font-semibold">
              <td className="sticky left-0 z-10 bg-muted px-3 py-2">Total</td>
              {contas.map((c) => (
                <td key={c.linha} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                  {reais(total(c.linha))}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex justify-end">
        <BotaoSalvar rotuloPendente="Salvando…">Salvar setembro da {empresa}</BotaoSalvar>
      </div>
    </form>
  );
}
