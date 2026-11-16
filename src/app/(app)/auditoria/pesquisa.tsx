"use client";

import * as React from "react";
import { FileText, Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  acao: string;
  relatorio?: string;
  lojas: { id: string; codigo: string; nome: string }[];
  regionais: string[];
  filtros: { modo: "regional" | "filial"; regional?: string; filial?: string; de: string; ate: string };
};

/** Pesquisa por Regional ou Filial e período (De/Até); "Gerar relatório" abre a versão para imprimir/PDF. */
export function PesquisaAuditoria({ acao, relatorio, lojas, regionais, filtros }: Props) {
  const [modo, setModo] = React.useState(filtros.modo);
  const form = React.useRef<HTMLFormElement>(null);
  const gerar = () => {
    if (!form.current || !relatorio) return;
    const fd = new FormData(form.current);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v) sp.set(k, v);
    window.open(`${relatorio}?${sp.toString()}`, "_blank", "noopener");
  };
  return (
    <form ref={form} method="get" action={acao} className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <fieldset className="grid gap-1 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input type="radio" name="modo" value="regional" checked={modo === "regional"} onChange={() => setModo("regional")} className="accent-primary" />
            Regional
          </label>
          <SelectNativo name="regional" defaultValue={filtros.regional ?? ""} disabled={modo !== "regional"} aria-label="Regional">
            <option value="">Todas</option>
            {regionais.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </fieldset>
        <fieldset className="grid gap-1 text-sm">
          <label className="flex items-center gap-2 font-medium">
            <input type="radio" name="modo" value="filial" checked={modo === "filial"} onChange={() => setModo("filial")} className="accent-primary" />
            Filial
          </label>
          <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} disabled={modo !== "filial"} aria-label="Filial">
            <option value="">Selecione uma filial</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} — {l.nome}
              </option>
            ))}
          </SelectNativo>
        </fieldset>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">De</span>
          <Input type="date" name="de" defaultValue={filtros.de} className="w-40" />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} className="w-40" />
        </label>
        <Button type="submit" variant="outline">
          <Search data-icon="inline-start" />
          Pesquisar
        </Button>
        {relatorio && (
          <Button type="button" onClick={gerar}>
            <FileText data-icon="inline-start" />
            Gerar relatório
          </Button>
        )}
      </div>
    </form>
  );
}
