"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "cn";

/** Atraso comum: a 1ª dica espera um pouco, as vizinhas abrem na hora (passar o mouse pelo menu). */
export function DicaProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={400} closeDelay={0}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

type DicaProps = {
  texto: React.ReactNode;
  /** atalho de teclado mostrado à direita (ex.: "Ctrl K") */
  atalho?: string;
  lado?: "top" | "right" | "bottom" | "left";
  /** sem dica (ex.: item do menu aberto, que já mostra o nome) */
  desligada?: boolean;
  className?: string;
  /** o elemento que dispara: vira o próprio gatilho, sem embrulho extra */
  children: React.ReactElement;
};

/** Dica curta no passar do mouse e no foco do teclado. */
export function Dica({ texto, atalho, lado = "top", desligada, className, children }: DicaProps) {
  return (
    <TooltipPrimitive.Root disabled={desligada}>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side={lado} sideOffset={8} className="z-[70]">
          <TooltipPrimitive.Popup
            className={cn(
              "flex max-w-72 origin-(--transform-origin) items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
              className,
            )}
          >
            {texto}
            {atalho && <kbd className="rounded border border-background/25 px-1 font-sans text-[10px] text-background/75">{atalho}</kbd>}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
