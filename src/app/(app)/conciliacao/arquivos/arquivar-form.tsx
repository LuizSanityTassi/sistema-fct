"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = { id: string; nome: string; usos?: number; vencFim?: string | null; action: (fd: FormData) => Promise<void> };

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Arquivar = tirar da lista e das próximas conciliações, com motivo. Nada é apagado; as conciliações já feitas não mudam. */
export function ArquivarForm({ id, nome, usos = 0, vencFim = null, action }: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [pendente, iniciar] = React.useTransition();
  // arquivo do banco que ainda tem boleto vencendo: arquivar tira esses boletos das próximas rodadas
  const aindaVence = Boolean(vencFim && vencFim.slice(0, 10) >= new Date().toISOString().slice(0, 10));
  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(true)}>
        Arquivar
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arquivar “{nome}”?</DialogTitle>
            <DialogDescription>
              O arquivo sai da lista e das próximas conciliações (inclusive da automática), mas continua guardado e dá para desarquivar.
              {usos > 0 ? ` Foi usado em ${usos} conciliação(ões): elas continuam como estão.` : ""}
              {aindaVence && (
                <span className="mt-2 block text-amber-800">
                  Atenção: este arquivo ainda tem boletos vencendo até {dataBr(vencFim!)}. Se eles não estiverem em outro arquivo ativo (ex.: .RET do agente), somem da próxima
                  conciliação automática e as pendências deles param de ser atualizadas. Normalmente não precisa arquivar: o sistema junta o mesmo boleto da planilha e do .RET e
                  deixa o arquivo de lado sozinho quando os vencimentos passam.
                </span>
              )}
            </DialogDescription>
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
