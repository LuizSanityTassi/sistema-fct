"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import type { EstadoConfigOmie } from "../omie-actions";

type Props = { action: (prev: EstadoConfigOmie, fd: FormData) => Promise<EstadoConfigOmie>; valores: { categoria: string; conta: string }; opcoesConta: string[]; opcoesCategoria: string[] };

export function ConfigOmieForm({ action, valores, opcoesConta, opcoesCategoria }: Props) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="categoria" label="Categoria (Omie)" obrigatorio dica="Exatamente como está cadastrada na Omie">
          <Input id="categoria" name="categoria" list="omie-categorias" defaultValue={valores.categoria} maxLength={70} />
          <datalist id="omie-categorias">
            {opcoesCategoria.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Campo>
        <Campo id="conta" label="Conta corrente (Omie)" obrigatorio>
          <Input id="conta" name="conta" list="omie-contas" defaultValue={valores.conta} maxLength={40} />
          <datalist id="omie-contas">
            {opcoesConta.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </Campo>
      </div>
      <BotaoSalvar />
    </form>
  );
}
