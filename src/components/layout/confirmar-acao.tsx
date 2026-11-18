"use client";

import * as React from "react";
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

type Props = {
  titulo: string;
  descricao: string;
  rotuloBotao: string;
  rotuloConfirmar?: string;
  variant?: "outline" | "destructive";
  /** Server Action que recebe os campos ocultos. */
  action: (formData: FormData) => Promise<void>;
  campos?: Record<string, string>;
  /** Campos extras dentro do formulário (ex.: uma opção marcável). */
  children?: React.ReactNode;
};

/** Botão que abre um diálogo de confirmação antes de executar uma Server Action. */
export function ConfirmarAcao({
  titulo,
  descricao,
  rotuloBotao,
  rotuloConfirmar,
  variant = "outline",
  action,
  campos = {},
  children,
}: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [pendente, iniciar] = React.useTransition();

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setAberto(true)}>
        {rotuloBotao}
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) =>
              iniciar(async () => {
                await action(fd);
                setAberto(false);
              })
            }
          >
            {Object.entries(campos).map(([nome, valor]) => (
              <input key={nome} type="hidden" name={nome} value={valor} />
            ))}
            {children}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>Cancelar</DialogClose>
              <Button
                type="submit"
                variant={variant === "destructive" ? "destructive" : "default"}
                disabled={pendente}
              >
                {pendente ? "Aguarde…" : (rotuloConfirmar ?? rotuloBotao)}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
