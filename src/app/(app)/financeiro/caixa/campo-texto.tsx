"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { RespostaCelula } from "../caixa-contabil/actions";

type Props = { action: (fd: FormData) => Promise<RespostaCelula>; campos: Record<string, string>; valorAtual: string; placeholder?: string; podeEditar: boolean };

/** Campo de texto que salva ao sair (ex.: motivo da diferença na conferência de caixa). */
export function CampoTexto({ action, campos, valorAtual, placeholder, podeEditar }: Props) {
  const router = useRouter();
  const [texto, setTexto] = React.useState(valorAtual);
  const [erro, setErro] = React.useState<string | null>(null);
  const salvar = async () => {
    if (texto.trim() === valorAtual.trim()) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    fd.set("valor", texto);
    const r = await action(fd);
    if (r.erro) setErro(r.erro);
    else router.refresh();
  };
  if (!podeEditar) return <p className="text-xs text-muted-foreground">{valorAtual || placeholder}</p>;
  return (
    <input
      value={texto}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={salvar}
      placeholder={placeholder}
      maxLength={300}
      title={erro ?? undefined}
      className={`w-full rounded border border-dashed border-input bg-transparent px-2 py-1 text-xs ${erro ? "border-red-400 text-red-700" : ""}`}
    />
  );
}
