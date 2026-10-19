"use client";

import * as React from "react";
import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { EstadoExclusao } from "../../actions";

/** Excluir o usuário de vez: explica a diferença para desativar e pede o e-mail digitado para confirmar. */
export function ExcluirUsuario({ action, nome, confirmacao }: { action: (prev: EstadoExclusao, fd: FormData) => Promise<EstadoExclusao>; nome: string; confirmacao: string }) {
  const [aberto, setAberto] = React.useState(false);
  const [digitado, setDigitado] = React.useState("");
  const [estado, enviar, pendente] = useActionState(action, {});
  const idCampo = React.useId();
  const confere = digitado.trim().toLowerCase() === confirmacao.trim().toLowerCase();

  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setAberto(true)}>
        <Trash2 data-icon="inline-start" />
        Excluir usuário
      </Button>
      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          if (!v) setDigitado("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {nome}?</DialogTitle>
            <DialogDescription>
              O login e o cadastro somem de vez, e isso não tem volta. Se a pessoa só saiu da empresa, prefira <strong>desmarcar “Acesso ativo”</strong>: ela perde o acesso, mas o nome continua aparecendo no histórico.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Saem junto: lojas extras, gestor de loja, comitê de denúncias e pedidos de acesso dela.</li>
            <li>Fica o histórico (chamados, lançamentos, justificativas, auditoria), sem o vínculo com a pessoa.</li>
            <li>Nome, e-mail e cargo ficam registrados na auditoria.</li>
          </ul>
          <form action={enviar} className="space-y-3">
            <div className="grid gap-1.5">
              <label htmlFor={idCampo} className="text-sm">
                Para confirmar, digite <strong className="font-mono">{confirmacao}</strong>
              </label>
              <Input id={idCampo} name="confirmacao" value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" />
            </div>
            <ErroFormulario mensagem={estado.erro} />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <Button type="submit" variant="destructive" disabled={!confere || pendente}>
                {pendente ? "Excluindo…" : "Excluir de vez"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
