"use client";

import { useActionState, useEffect, useState } from "react";
import { Lock, TriangleAlert } from "lucide-react";
import { CampoSenha } from "@/components/form/campo-senha";
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
import type { EstadoSair } from "./actions";

/** Segura o quiosque: o "voltar" do navegador e o menu do botão direito não tiram ninguém do relógio. */
export function TravaQuiosque() {
  useEffect(() => {
    const ficar = () => history.pushState(null, "", location.href);
    ficar();
    const semMenu = (e: MouseEvent) => e.preventDefault();
    window.addEventListener("popstate", ficar);
    document.addEventListener("contextmenu", semMenu);
    return () => {
      window.removeEventListener("popstate", ficar);
      document.removeEventListener("contextmenu", semMenu);
    };
  }, []);
  return null;
}

type Props = {
  acao: (prev: EstadoSair, fd: FormData) => Promise<EstadoSair>;
  /** Login do relógio da filial: sair desconecta o aparelho. */
  doRelogio: boolean;
  conta: string;
};

/** Botão discreto de sair; pede a senha da conta aberta no relógio. */
export function SairDoRelogio({ acao, doRelogio, conta }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estado, enviar, pendente] = useActionState(acao, {});

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        className="text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Lock aria-hidden />
        Sair
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {doRelogio ? "Desconectar o relógio" : "Sair do relógio"}
            </DialogTitle>
            <DialogDescription>
              Só sai com a senha de <strong>{conta}</strong>.
              {doRelogio
                ? " Depois, para religar, entre de novo com o login do relógio."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <form action={enviar} className="space-y-3">
            <CampoSenha
              name="senha"
              autoComplete="off"
              required
              autoFocus
              aria-label="Senha"
              className="h-10"
            />
            {estado.erro && (
              <p
                role="alert"
                className="flex items-center gap-2 text-sm text-red-700"
              >
                <TriangleAlert className="size-4 shrink-0" aria-hidden />
                {estado.erro}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pendente}>
                {pendente ? "Conferindo…" : "Sair"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
