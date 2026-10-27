"use client";

import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Nota de 0 a 5 estrelas (rádios de verdade: vai no formulário e funciona no teclado). */
export function EscolherEstrelas({ nome, rotulo, invalido }: { nome: string; rotulo: string; invalido?: boolean }) {
  const [nota, setNota] = React.useState<number | null>(null);
  const [sobre, setSobre] = React.useState<number | null>(null);
  const ativa = sobre ?? nota;
  return (
    <fieldset className={cn("flex items-center gap-0.5 rounded-md", invalido && nota === null && "ring-2 ring-destructive/40")} onMouseLeave={() => setSobre(null)}>
      <legend className="sr-only">{rotulo}</legend>
      <label className={cn("mr-1 grid size-7 cursor-pointer place-items-center rounded-md border text-xs font-semibold", nota === 0 ? "border-red-300 bg-red-50 text-red-700" : "text-muted-foreground hover:bg-muted")} title="Zero estrelas">
        <input type="radio" name={nome} value="0" className="sr-only" checked={nota === 0} onChange={() => setNota(0)} />0
      </label>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className="cursor-pointer p-0.5" title={`${n} ${n === 1 ? "estrela" : "estrelas"}`} onMouseEnter={() => setSobre(n)}>
          <input type="radio" name={nome} value={n} className="peer sr-only" checked={nota === n} onChange={() => setNota(n)} />
          <Star className={cn("size-6 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-ring", ativa !== null && n <= ativa ? "fill-amber-400 text-amber-500" : "text-muted-foreground/40")} aria-hidden />
          <span className="sr-only">{n}</span>
        </label>
      ))}
      <span className="ml-1.5 w-6 text-right text-xs tabular-nums text-muted-foreground">{nota ?? "—"}</span>
    </fieldset>
  );
}

/** Estrelas só para ler (detalhe e lista). */
export function MostrarEstrelas({ nota, tamanho = "size-4" }: { nota: number; tamanho?: string }) {
  const cheia = Math.round(nota);
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${nota.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(tamanho, n <= cheia ? "fill-amber-400 text-amber-500" : "text-muted-foreground/30")} aria-hidden />
      ))}
    </span>
  );
}
