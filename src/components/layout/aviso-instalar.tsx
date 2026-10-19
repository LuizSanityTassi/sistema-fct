"use client";

import * as React from "react";
import { Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppInstalavel, type SituacaoApp } from "@/components/layout/app-instalavel";

const CHAVE_FECHADO = "fct.app.aviso";
const EVENTO = "fct:aviso-app";

function lerFechado() {
  try {
    return window.localStorage.getItem(CHAVE_FECHADO) === "fechado";
  } catch {
    return false;
  }
}
function assinarFechado(f: () => void) {
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}

/** Passo a passo de quem não tem o botão automático (iPhone ou navegador sem o pedido de instalação). */
function Passos({ situacao }: { situacao: SituacaoApp }) {
  return situacao === "iphone" ? (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      <li>Abra o sistema no <strong>Safari</strong>.</li>
      <li>
        Toque em <strong>Compartilhar</strong> <Share className="inline size-4 align-[-3px]" aria-label="(ícone de quadrado com seta para cima)" /> na barra de baixo.
      </li>
      <li>
        Role e toque em <strong>Adicionar à Tela de Início</strong> e depois em <strong>Adicionar</strong>.
      </li>
    </ol>
  ) : (
    <ol className="list-decimal space-y-1.5 pl-5 text-sm">
      <li>Abra o sistema no <strong>Chrome</strong> do celular.</li>
      <li>
        Toque no menu <strong>⋮</strong> (três pontinhos, no alto).
      </li>
      <li>
        Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
      </li>
    </ol>
  );
}

function DialogoPassos({ aberto, onOpenChange, situacao }: { aberto: boolean; onOpenChange: (v: boolean) => void; situacao: SituacaoApp }) {
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Instalar o Sistema FCT no celular</DialogTitle>
          <DialogDescription>Fica um ícone da FCT na tela inicial: abre direto, em tela cheia, e dá para fotografar o cupom na hora de justificar.</DialogDescription>
        </DialogHeader>
        <Passos situacao={situacao} />
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Entendi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Faixa no celular (some quando instala ou quando a pessoa fecha). */
export function AvisoInstalarApp() {
  const { situacao, instalar } = useAppInstalavel();
  const fechado = React.useSyncExternalStore(assinarFechado, lerFechado, () => true);
  const [passos, setPassos] = React.useState(false);
  if (situacao === "instalado" || fechado) return null;

  const fechar = () => {
    try {
      window.localStorage.setItem(CHAVE_FECHADO, "fechado");
    } catch {
      /* sem armazenamento: some só nesta página */
    }
    window.dispatchEvent(new Event(EVENTO));
  };

  return (
    <div className="mb-5 flex items-start gap-3 rounded-xl border bg-card p-3.5 md:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-fct-red-fundo text-white">
        <Smartphone className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Instale o Sistema FCT no celular</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Abre direto da tela inicial e dá para fotografar o cupom na hora de justificar.</p>
        <Button size="sm" className="mt-2.5" onClick={() => (situacao === "pode-instalar" ? void instalar() : setPassos(true))}>
          {situacao === "pode-instalar" ? "Instalar" : "Como instalar"}
        </Button>
      </div>
      <button type="button" onClick={fechar} className="-mt-1 -mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar aviso de instalação">
        <X className="size-4" aria-hidden />
      </button>
      <DialogoPassos aberto={passos} onOpenChange={setPassos} situacao={situacao} />
    </div>
  );
}

/** Item "Instalar no celular" para o menu do usuário (não aparece se já está instalado). */
export function useInstalarPeloMenu() {
  const { situacao, instalar } = useAppInstalavel();
  const [passos, setPassos] = React.useState(false);
  const disponivel = situacao !== "instalado";
  const acionar = () => (situacao === "pode-instalar" ? void instalar() : setPassos(true));
  const dialogo = <DialogoPassos aberto={passos} onOpenChange={setPassos} situacao={situacao} />;
  return { disponivel, acionar, dialogo, rotulo: situacao === "pode-instalar" ? "Instalar o aplicativo" : "Instalar no celular" };
}
