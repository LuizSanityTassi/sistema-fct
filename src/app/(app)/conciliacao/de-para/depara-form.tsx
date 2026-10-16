"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoDePara } from "../actions";

type Props = {
  action: (prev: EstadoDePara, fd: FormData) => Promise<EstadoDePara>;
  valores?: { dda?: string; fornecedores?: string[]; alerta?: string | null; ativo?: boolean };
  modo: "novo" | "edicao";
};

export function DeParaForm({ action, valores = {}, modo }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="dda" label="Como aparece no DDA (começo do nome do beneficiário)" obrigatorio erro={erro("dda")} dica="Ex.: TEMPLI SECURITIZADORA">
            <Input id="dda" name="dda" defaultValue={valores.dda ?? ""} maxLength={80} aria-invalid={!!erro("dda")} autoFocus={modo === "novo"} />
          </Campo>
          <Campo id="fornecedores" label="Fornecedor(es) real(is) no Trier" erro={erro("fornecedores")} dica="Separe por vírgula ou ponto e vírgula. Ex.: MULTIMED">
            <Input id="fornecedores" name="fornecedores" defaultValue={(valores.fornecedores ?? []).join(", ")} maxLength={400} aria-invalid={!!erro("fornecedores")} />
          </Campo>
          <Campo id="alerta" label="Alerta" erro={erro("alerta")} dica="Aparece em vermelho nos boletos desse beneficiário. Ex.: INDEVIDO - não pagar">
            <Input id="alerta" name="alerta" defaultValue={valores.alerta ?? ""} maxLength={120} />
          </Campo>
          {modo === "edicao" && (
            <label className="flex items-center gap-2 pt-6 text-sm">
              <input type="hidden" name="ativo_presente" value="1" />
              <input type="checkbox" name="ativo" defaultChecked={valores.ativo ?? true} className="size-4 accent-fct-tinta" />
              Ativo (usado nas próximas conciliações)
            </label>
          )}
        </div>
      </section>
      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao/de-para" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
