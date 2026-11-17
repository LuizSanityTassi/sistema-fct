"use client";

import * as React from "react";
import { SelectNativo } from "@/components/form/campo";

/** Escala individual: escolhe a pessoa e abre o PDF ou baixa o Excel só dela. */
export function ExportarIndividual({ simId, pessoas }: { simId: string; pessoas: { id: string; nome: string }[] }) {
  const [pessoa, setPessoa] = React.useState("");
  return (
    <span className="inline-flex items-center gap-1.5">
      <SelectNativo value={pessoa} onChange={(e) => setPessoa(e.target.value)} className="h-8 w-44 text-xs" aria-label="Escala individual">
        <option value="">Individual…</option>
        {pessoas.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </SelectNativo>
      {pessoa && (
        <>
          <a href={`/imprimir/escala/${simId}?pessoa=${pessoa}`} target="_blank" rel="noopener" className="text-xs font-medium text-primary hover:underline">
            PDF
          </a>
          <a href={`/api/escalas/exportar?id=${simId}&pessoa=${pessoa}`} className="text-xs font-medium text-primary hover:underline">
            Excel
          </a>
        </>
      )}
    </span>
  );
}
