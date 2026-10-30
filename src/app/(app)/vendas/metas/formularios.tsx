"use client";

import { useActionState } from "react";
import { Save, Wand2 } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoMetas } from "./actions";

type Acao = (prev: EstadoMetas, fd: FormData) => Promise<EstadoMetas>;

/** Formulário das metas: a tabela (com os campos "m|<chave>") vem do servidor como children. */
export function FormMetas({ action, mes, podeEditar, children }: { action: Acao; mes: string; podeEditar: boolean; children: React.ReactNode }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="mes" value={mes} />
      <fieldset disabled={!podeEditar || pendente} className="min-w-0">
        {children}
      </fieldset>
      {podeEditar && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pendente}>
            <Save data-icon="inline-start" />
            {pendente ? "Salvando…" : "Salvar metas"}
          </Button>
          <span className="text-xs text-muted-foreground">Campo vazio apaga a meta. Pode digitar 150.000 ou 150000,00.</span>
        </div>
      )}
      <div className="mt-3 space-y-2">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
      </div>
    </form>
  );
}

/** Preenche as metas em branco com a venda do mês anterior + %. */
export function FormPreencher({ action, mes, secao, filial, mesAnterior }: { action: Acao; mes: string; secao: string; filial?: string; mesAnterior: string }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="mes" value={mes} />
      <input type="hidden" name="secao" value={secao} />
      {filial && <input type="hidden" name="filial" value={filial} />}
      <span className="self-center text-muted-foreground">Preencher as vazias com a venda de {mesAnterior} +</span>
      <Input name="percentual" inputMode="decimal" defaultValue="5" className="w-20" aria-label="Percentual sobre a venda do mês anterior" />
      <span className="self-center text-muted-foreground">%</span>
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        <Wand2 data-icon="inline-start" />
        {pendente ? "Preenchendo…" : "Preencher"}
      </Button>
      <div className="basis-full space-y-2 empty:hidden">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
      </div>
    </form>
  );
}
