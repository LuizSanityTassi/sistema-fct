"use client";

import * as React from "react";
import { useActionState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAgente } from "./actions";

type Props = { action: (prev: EstadoAgente, fd: FormData) => Promise<EstadoAgente> };

/** Gera a chave de um agente e mostra UMA vez (depois só o hash fica no banco). */
export function NovoAgenteForm({ action }: Props) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const [copiado, setCopiado] = React.useState(false);
  const copiar = async () => {
    if (!estado.token) return;
    try {
      await navigator.clipboard.writeText(estado.token);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem clipboard: a pessoa seleciona e copia */
    }
  };
  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <Campo id="nome" label="Nome do agente" obrigatorio dica="ex.: PC do Luiz – Itaú Mailbox">
          <Input id="nome" name="nome" required minLength={2} maxLength={60} className="w-72" />
        </Campo>
        <Button type="submit" disabled={pendente}>
          <KeyRound data-icon="inline-start" />
          {pendente ? "Gerando…" : "Gerar chave do agente"}
        </Button>
      </form>
      <ErroFormulario mensagem={estado.erro} />
      {estado.token && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Chave do agente “{estado.nome}” — copie agora: ela não aparece de novo.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-white px-2 py-1 font-mono text-xs break-all select-all">{estado.token}</code>
            <Button type="button" size="sm" variant="outline" onClick={copiar}>
              <Copy data-icon="inline-start" />
              {copiado ? "Copiada!" : "Copiar"}
            </Button>
          </div>
          <p className="mt-2 text-xs">Cole no instalar.ps1 do PC do Itaú Mailbox. Se perder, revogue esta e gere outra.</p>
        </div>
      )}
    </div>
  );
}
