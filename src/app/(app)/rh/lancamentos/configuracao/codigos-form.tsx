"use client";

import * as React from "react";
import { useActionState } from "react";
import { CircleCheckBig, TriangleAlert } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoCodigos } from "./actions";

/**
 * Sobe as planilhas que a contabilidade devolve (uma por CNPJ) e deixa os códigos do sistema iguais aos delas. Os
 * valores das planilhas não entram.
 */
export function CodigosContabilidadeForm({ action }: { action: (prev: EstadoCodigos, fd: FormData) => Promise<EstadoCodigos> }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [qtd, setQtd] = React.useState(0);
  return (
    <div className="space-y-3">
      <form action={enviar} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Planilhas da contabilidade (.xls / .xlsx, uma por CNPJ)</span>
          <input
            type="file"
            name="planilhas"
            multiple
            accept=".xls,.xlsx"
            onChange={(e) => setQtd(e.target.files?.length ?? 0)}
            className="block text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
          />
        </label>
        <Button type="submit" disabled={pendente || qtd === 0}>
          {pendente ? "Lendo…" : qtd ? `Atualizar códigos (${qtd})` : "Atualizar códigos"}
        </Button>
      </form>
      <ErroFormulario mensagem={estado.erro} />
      {estado.resultados && (
        <ul className="divide-y rounded-lg border text-sm">
          {estado.resultados.map((r) => (
            <li key={r.arquivo} className="px-3 py-2">
              <p className="flex flex-wrap items-center gap-x-2 font-medium">
                {r.erro ? <TriangleAlert className="size-4 text-red-700" aria-hidden /> : <CircleCheckBig className="size-4 text-emerald-700" aria-hidden />}
                {r.arquivo}
                {r.filial && <span className="font-mono text-xs text-muted-foreground">→ {r.filial}</span>}
              </p>
              {r.erro ? (
                <p className="text-xs text-red-800">{r.erro}</p>
              ) : (
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p>
                    Empresa {r.empresa?.codigo ?? "—"}
                    {r.empresa && r.empresa.antes !== r.empresa.codigo ? ` (era ${r.empresa.antes ?? "sem código"})` : " (igual)"} · {r.colunas} colunas de evento
                    {r.mudancas ? ` · ${r.mudancas} coluna(s) mudaram` : " · códigos iguais aos que já estavam"}
                    {r.semEvento?.length ? ` · sai vazia: ${r.semEvento.join(", ")}` : ""}
                  </p>
                  {r.funcionarios && (
                    <p>
                      Funcionários: {r.funcionarios.iguais} com o código igual
                      {r.funcionarios.atualizados.length > 0 && <span className="text-foreground"> · código trocado: {r.funcionarios.atualizados.join("; ")}</span>}
                      {r.funcionarios.outraFilial.length > 0 && <span> · em outra filial no sistema (ficam onde estão): {r.funcionarios.outraFilial.join("; ")}</span>}
                      {r.funcionarios.naoCadastrados.length > 0 && <span className="text-amber-800 dark:text-amber-300"> · não cadastrados no sistema: {r.funcionarios.naoCadastrados.join("; ")}</span>}
                    </p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
