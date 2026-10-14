"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = { lote: string; descricao: string; action: (fd: FormData) => Promise<void> };

/** Desfaz um envio ao Omie (as contas voltam para "Enviar ao Omie"; nada é apagado). */
export function DesfazerForm({ lote, descricao, action }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [pendente, iniciar] = React.useTransition();
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        Desfazer
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desfazer este envio?</DialogTitle>
            <DialogDescription>{descricao}. As contas voltam para a tela “Enviar ao Omie” e as pendências fechadas por esse envio reabrem. Use quando a importação deu erro na Omie e foi apagada lá.</DialogDescription>
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
            <input type="hidden" name="lote" value={lote} />
            <Input name="motivo" placeholder="Motivo (obrigatório)" required minLength={3} maxLength={300} autoFocus />
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <Button type="submit" variant="destructive" disabled={pendente}>
                {pendente ? "Aguarde…" : "Desfazer envio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
