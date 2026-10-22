"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoFilialGi } from "./actions";

type Valores = { codigo?: number; nome?: string; cnpj?: string | null; departamento_omie?: string | null; ativo?: boolean };

/** Cadastro ou edição de uma filial da GI (o número é o da filial no Trier da GI). */
export function FilialGiForm({ action, valores = {} }: { action: (prev: EstadoFilialGi, fd: FormData) => Promise<EstadoFilialGi>; valores?: Valores }) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const edicao = valores.codigo !== undefined;
  return (
    <form action={formAction} noValidate className="space-y-4">
      {edicao && <input type="hidden" name="codigo_original" value={valores.codigo} />}
      <ErroFormulario mensagem={estado.erro} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[8rem_1fr_13rem_1fr]">
        <Campo id="codigo" label="Nº no Trier" obrigatorio erro={erro("codigo")} dica="Ex.: 1, 12, 301">
          <Input id="codigo" name="codigo" inputMode="numeric" defaultValue={valores.codigo ?? ""} maxLength={4} aria-invalid={!!erro("codigo")} autoFocus={!edicao} />
        </Campo>
        <Campo id="nome" label="Nome" obrigatorio erro={erro("nome")} dica="Ex.: MATRIZ, CENTRO">
          <Input id="nome" name="nome" defaultValue={valores.nome ?? ""} maxLength={80} aria-invalid={!!erro("nome")} />
        </Campo>
        <Campo id="cnpj" label="CNPJ" erro={erro("cnpj")} dica="Liga o boleto do banco à filial">
          <Input id="cnpj" name="cnpj" inputMode="numeric" defaultValue={valores.cnpj ?? ""} maxLength={18} placeholder="00.000.000/0000-00" aria-invalid={!!erro("cnpj")} />
        </Campo>
        <Campo id="departamento_omie" label="Departamento na Omie" erro={erro("departamento_omie")} dica="Para quando o envio à Omie da GI for ligado">
          <Input id="departamento_omie" name="departamento_omie" defaultValue={valores.departamento_omie ?? ""} maxLength={120} />
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={valores.ativo ?? true} className="size-4 accent-fct-tinta" />
        Ativa
      </label>
      <div className="flex items-center gap-2">
        <BotaoSalvar>{edicao ? "Salvar alteração" : "Cadastrar filial"}</BotaoSalvar>
        {edicao && (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao-gi/filiais" />}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
