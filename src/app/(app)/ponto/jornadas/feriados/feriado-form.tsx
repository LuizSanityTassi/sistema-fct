"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  filiais: { id: string; codigo: string; nome: string }[];
};

export function FeriadoForm({ action, filiais }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  return (
    <form action={formAction} noValidate className="space-y-3 p-5 pt-0">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[10rem_1fr_14rem_10rem_auto] lg:items-end">
        <Campo id="f-data" label="Data" obrigatorio erro={erro("data")}>
          <Input id="f-data" name="data" type="date" aria-invalid={!!erro("data")} />
        </Campo>
        <Campo id="f-nome" label="Nome" obrigatorio erro={erro("nome")}>
          <Input id="f-nome" name="nome" maxLength={80} placeholder="Ex.: Aniversário da cidade" aria-invalid={!!erro("nome")} />
        </Campo>
        <Campo id="f-filial" label="Filial">
          <SelectNativo id="f-filial" name="branch_id" defaultValue="">
            <option value="">Todas (nacional)</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="f-abr" label="Tipo">
          <SelectNativo id="f-abr" name="abrangencia" defaultValue="">
            <option value="">Nacional / municipal</option>
            <option value="estadual">Estadual</option>
            <option value="empresa">Da empresa</option>
          </SelectNativo>
        </Campo>
        <BotaoSalvar>Adicionar</BotaoSalvar>
      </div>
    </form>
  );
}
