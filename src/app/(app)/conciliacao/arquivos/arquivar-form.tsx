"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = { id: string; nome: string; action: (fd: FormData) => Promise<void> };

/** Arquivar = esconder da lista com motivo. Nada é apagado. */
export function ArquivarForm({ id, nome, action }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [pendente, iniciar] = React.useTransition();
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        Arquivar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar “{nome}”?</DialogTitle>
            <DialogDescription>O arquivo sai da lista, mas continua guardado (dá para desarquivar). Arquivos usados em conciliações não podem ser arquivados.</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) =>
              iniciar(async () => {
                await action(fd);
                setAberto(false);
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="id" value={id} />
            <Input name="motivo" placeholder="Motivo (obrigatório)" required minLength={3} maxLength={300} autoFocus />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <Button type="submit" variant="destructive" disabled={pendente}>
                {pendente ? "Aguarde…" : "Arquivar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
