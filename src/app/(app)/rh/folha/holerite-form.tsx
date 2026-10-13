"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import type { EstadoFolha } from "./actions";

type Props = { action: (prev: EstadoFolha, fd: FormData) => Promise<EstadoFolha>; temHolerite: boolean };

export function HoleriteForm({ action, temHolerite }: Props) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} noValidate className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <Campo id="holerite-arquivo" label={temHolerite ? "Substituir holerite" : "Anexar holerite"} erro={estado.erros?.arquivo} dica="PDF ou imagem · até 20 MB">
        <Input id="holerite-arquivo" name="arquivo" type="file" accept={ACCEPT_ARQUIVO} aria-invalid={!!estado.erros?.arquivo} />
      </Campo>
      <BotaoSalvar rotuloPendente="Enviando…">Enviar</BotaoSalvar>
    </form>
  );
}
