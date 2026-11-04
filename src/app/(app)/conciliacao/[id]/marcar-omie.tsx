"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Id do formulário (GET) que leva os marcados da lista para a aba "Enviar ao Omie"; as caixas da tabela apontam para ele. */
export const FORM_MARCAR_OMIE = "form-marcar-omie";

const caixas = () => [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${FORM_MARCAR_OMIE}"]:not(:disabled)`)];

type Props = {
  grupo: string;
  /** Quantas contas a lista tem com os filtros atuais, quando elas não cabem numa página só. */
  totalDaLista: number | null;
  filtros: { q?: string; filial?: number; categoria?: string; anomalias?: boolean; vencDe?: string; vencAte?: string };
};

/** Barra embaixo da lista: conta os marcados, marca/desmarca a página ou a lista inteira e envia para a aba do Omie. */
export function BarraMarcarOmie({ grupo, totalDaLista, filtros }: Props) {
  const [qtd, setQtd] = React.useState(0);
  const [todos, setTodos] = React.useState(false);
  const [abrindo, setAbrindo] = React.useState(false);
  React.useEffect(() => {
    const contar = () => {
      setTodos(false);
      setQtd(caixas().filter((c) => c.checked).length);
    };
    const voltou = () => setAbrindo(false);
    document.addEventListener("change", contar);
    window.addEventListener("pageshow", voltou);
    return () => {
      document.removeEventListener("change", contar);
      window.removeEventListener("pageshow", voltou);
    };
  }, []);
  const marcarTodas = (marcar: boolean) => {
    for (const c of caixas()) c.checked = marcar;
    setTodos(false);
    setQtd(marcar ? caixas().length : 0);
  };
  const marcarLista = () => {
    for (const c of caixas()) c.checked = true;
    setQtd(caixas().length);
    setTodos(true);
  };
  const aoEnviar = () => {
    // com a lista inteira, quem manda é o filtro: as caixas da página não vão no endereço
    if (todos) for (const c of caixas()) c.checked = false;
    setAbrindo(true);
  };
  return (
    <form id={FORM_MARCAR_OMIE} method="get" onSubmit={aoEnviar} className="sticky bottom-2 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 shadow-md">
      <input type="hidden" name="aba" value="omie" />
      <input type="hidden" name="grupo" value={grupo} />
      {todos && (
        <>
          <input type="hidden" name="todos" value="1" />
          {filtros.q && <input type="hidden" name="q" value={filtros.q} />}
          {filtros.filial !== undefined && <input type="hidden" name="filial" value={filtros.filial} />}
          {filtros.categoria && <input type="hidden" name="categoria" value={filtros.categoria} />}
          {filtros.anomalias && <input type="hidden" name="anomalias" value="1" />}
          {filtros.vencDe && <input type="hidden" name="venc_de" value={filtros.vencDe} />}
          {filtros.vencAte && <input type="hidden" name="venc_ate" value={filtros.vencAte} />}
        </>
      )}
      <span className="text-sm font-medium">{todos && totalDaLista != null ? `Todos os ${totalDaLista.toLocaleString("pt-BR")} desta lista marcados` : `${qtd} marcado(s) nesta página`}</span>
      <button type="button" onClick={() => marcarTodas(true)} className="text-xs text-fct-tinta underline">
        marcar todos da página
      </button>
      {totalDaLista != null && (
        <button type="button" onClick={marcarLista} className="text-xs font-semibold text-fct-tinta underline">
          marcar todos os {totalDaLista.toLocaleString("pt-BR")} desta lista
        </button>
      )}
      <button type="button" onClick={() => marcarTodas(false)} className="text-xs text-fct-tinta underline">
        desmarcar
      </button>
      <Button type="submit" size="sm" disabled={qtd === 0} className="ml-auto">
        <Send data-icon="inline-start" />
        {abrindo ? "Abrindo… (pode levar até 1 minuto)" : "Enviar marcados ao Omie"}
      </Button>
    </form>
  );
}
