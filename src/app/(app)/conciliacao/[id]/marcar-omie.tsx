"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Id do formulário (GET) que leva os marcados da lista para a aba "Enviar ao Omie"; as caixas da tabela apontam para ele. */
export const FORM_MARCAR_OMIE = "form-marcar-omie";

const caixas = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${FORM_MARCAR_OMIE}"]:not(:disabled)`)];

/** Barra embaixo da lista: conta os marcados, marca/desmarca a página e envia para a aba do Omie. */
export function BarraMarcarOmie({ grupo }: { grupo: string }) {
  const [qtd, setQtd] = React.useState(0);
  React.useEffect(() => {
    const contar = () => setQtd(caixas().filter((c) => c.checked).length);
    document.addEventListener("change", contar);
    return () => document.removeEventListener("change", contar);
  }, []);
  const marcarTodas = (marcar: boolean) => {
    for (const c of caixas()) c.checked = marcar;
    setQtd(marcar ? caixas().length : 0);
  };
  return (
    <form id={FORM_MARCAR_OMIE} method="get" className="sticky bottom-2 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-md">
      <input type="hidden" name="aba" value="omie" />
      <input type="hidden" name="grupo" value={grupo} />
      <span className="text-sm font-medium">{qtd} marcado(s) nesta página</span>
      <button type="button" onClick={() => marcarTodas(true)} className="text-xs text-fct-tinta underline">
        marcar todos da página
      </button>
      <button type="button" onClick={() => marcarTodas(false)} className="text-xs text-fct-tinta underline">
        desmarcar
      </button>
      <Button type="submit" size="sm" disabled={qtd === 0} className="ml-auto">
        <Send data-icon="inline-start" />
        Enviar marcados ao Omie
      </Button>
    </form>
  );
}
