"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoFormulario } from "../actions";

type Props = {
  action: (prev: EstadoFormulario, fd: FormData) => Promise<EstadoFormulario>;
  valores: { razao_social: string; nome_fantasia: string | null; cnpj: string | null };
};

export function OrganizacaoForm({ action, valores }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (campo: string) => estado.erros?.[campo];

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="nome_fantasia" label="Nome do grupo" obrigatorio erro={erro("nome_fantasia")} dica="Como aparece nas telas (ex.: VARELA)">
            <Input id="nome_fantasia" name="nome_fantasia" defaultValue={valores.nome_fantasia ?? ""} maxLength={40} aria-invalid={!!erro("nome_fantasia")} />
          </Campo>
          <Campo id="cnpj" label="CNPJ da matriz" erro={erro("cnpj")}>
            <Input id="cnpj" name="cnpj" defaultValue={valores.cnpj ?? ""} maxLength={18} aria-invalid={!!erro("cnpj")} />
          </Campo>
          <Campo id="razao_social" label="Razão social" obrigatorio erro={erro("razao_social")} className="sm:col-span-2">
            <Input id="razao_social" name="razao_social" defaultValue={valores.razao_social} maxLength={120} aria-invalid={!!erro("razao_social")} />
          </Campo>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" render={<Link href="/filiais" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
