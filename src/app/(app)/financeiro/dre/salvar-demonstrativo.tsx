"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import type { EstadoManual } from "./actions";

/** Formulário dos campos digitáveis do demonstrativo (os campos ficam na tabela, ligados pelo id do form). */
export function SalvarDemonstrativo({ action, empresa, id, rotulo }: { action: (prev: EstadoManual, fd: FormData) => Promise<EstadoManual>; empresa: string; id: string; rotulo: string }) {
  const [estado, enviar] = useActionState(action, {});
  return (
    <form id={id} action={enviar} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="empresa" value={empresa} />
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <BotaoSalvar size="sm" rotuloPendente="Salvando…">
        {rotulo}
      </BotaoSalvar>
    </form>
  );
}
