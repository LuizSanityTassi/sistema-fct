"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RespostaCelula } from "./actions";

type Props = {
  action: (fd: FormData) => Promise<RespostaCelula>;
  campos: Record<string, string>;
  valorAtual: number | null; // valor manual gravado (null = automático)
  exibicao: string; // texto mostrado quando não está editando
  automatico?: string; // dica do valor automático
  ajustado?: boolean;
  classe?: string;
  podeEditar: boolean;
};

/** Célula da DRE: clique para digitar; Enter/sair salva; vazio volta ao automático. */
export function CelulaEditavel({ action, campos, valorAtual, exibicao, automatico, ajustado, classe, podeEditar }: Props) {
  const router = useRouter();
  const [editando, setEditando] = React.useState(false);
  const [texto, setTexto] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const abrir = () => {
    if (!podeEditar) return;
    setTexto(valorAtual == null ? "" : String(valorAtual).replace(".", ","));
    setErro(null);
    setEditando(true);
  };
  const salvar = async () => {
    if (!editando) return;
    setEditando(false);
    const original = valorAtual == null ? "" : String(valorAtual).replace(".", ",");
    if (texto.trim() === original.trim()) return;
    setSalvando(true);
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    fd.set("valor", texto);
    const r = await action(fd);
    setSalvando(false);
    if (r.erro) setErro(r.erro);
    else router.refresh();
  };

  if (editando) {
    return (
      <td className={`p-1 text-right ${classe ?? ""}`}>
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === "Enter") salvar();
            if (e.key === "Escape") setEditando(false);
          }}
          placeholder={automatico ?? "—"}
          className="w-28 rounded border border-input bg-background px-1.5 py-0.5 text-right text-xs text-foreground"
          inputMode="decimal"
        />
      </td>
    );
  }
  return (
    <td
      onClick={abrir}
      title={erro ?? (podeEditar ? (ajustado ? `Ajuste manual — clique para editar; apague para voltar ao automático (${automatico ?? "—"})` : "Clique para ajustar manualmente") : undefined)}
      className={`px-2 py-1 text-right tabular-nums ${podeEditar ? "cursor-pointer hover:bg-muted/60" : ""} ${ajustado ? "bg-fct-yellow/25 font-semibold shadow-[inset_2px_0_0_var(--color-fct-yellow)]" : ""} ${erro ? "text-red-700" : ""} ${salvando ? "opacity-50" : ""} ${classe ?? ""}`}
    >
      {exibicao}
    </td>
  );
}
