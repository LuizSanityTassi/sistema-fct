"use client";

import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, type StatusFuncionario } from "@/lib/rh/rotulos";
import type { EstadoFormulario } from "./actions";

type Props = {
  id: string;
  statusAtual: StatusFuncionario;
  dataDesligamento: string | null;
  action: (prev: EstadoFormulario, fd: FormData) => Promise<EstadoFormulario>;
};

export function AlterarStatusFuncionario({ id, statusAtual, dataDesligamento, action }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [status, setStatus] = React.useState<StatusFuncionario>(statusAtual);
  // Fecha o diálogo quando a ação termina sem erro (direto no envio, sem efeito).
  const [estado, formAction] = useActionState(async (prev: EstadoFormulario, fd: FormData) => {
    const resultado = await action(prev, fd);
    if (resultado && !resultado.erro && !resultado.erros && "erro" in resultado) setAberto(false);
    return resultado;
  }, {});

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAberto(true)}>
        Alterar situação
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar situação</DialogTitle>
            <DialogDescription>
              Afastamento, férias ou desligamento. O funcionário nunca é apagado: o histórico continua na unidade.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} noValidate className="space-y-4">
            <input type="hidden" name="id" value={id} />
            <ErroFormulario mensagem={estado.erro} />
            <Campo id="status" label="Situação" obrigatorio erro={estado.erros?.status}>
              <SelectNativo
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFuncionario)}
              >
                {(Object.keys(STATUS_LABEL) as StatusFuncionario[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            {status === "desligado" && (
              <Campo id="data_desligamento" label="Data do desligamento" obrigatorio erro={estado.erros?.data_desligamento}>
                <Input
                  id="data_desligamento"
                  name="data_desligamento"
                  type="date"
                  defaultValue={dataDesligamento ?? ""}
                  aria-invalid={!!estado.erros?.data_desligamento}
                />
              </Campo>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <BotaoSalvar rotuloPendente="Salvando…">Confirmar</BotaoSalvar>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
