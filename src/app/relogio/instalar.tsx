"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useAppInstalavel } from "@/components/layout/app-instalavel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** "Instalar app" do relógio da filial: vira um ícone no computador que abre direto no relógio. */
export function InstalarRelogio({ filial }: { filial: string }) {
  const { situacao, instalar } = useAppInstalavel();
  const [ajuda, setAjuda] = useState(false);
  if (situacao === "instalado") return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={async () => {
          if (situacao === "pode-instalar") await instalar();
          else setAjuda(true);
        }}
        className="text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Download aria-hidden />
        Instalar app
      </Button>
      <Dialog open={ajuda} onOpenChange={setAjuda}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar o Relógio {filial}</DialogTitle>
            <DialogDescription>
              No Chrome, clique no ícone de instalar na ponta direita da barra de endereço (um monitor com uma seta) ou no menu ⋮ → “Transmitir, salvar
              e compartilhar” → “Instalar página como app”. O ícone “Relógio {filial}” fica na área de trabalho e abre direto no relógio.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
