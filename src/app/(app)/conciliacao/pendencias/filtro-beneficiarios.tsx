"use client";

import * as React from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatarMoeda } from "@/lib/formatos";

type Beneficiario = { chave: string; nome: string; qtd: number; valor: number; tirado: boolean };

/**
 * Filtro de coluna dos beneficiários, como no Omie: marca quem SAI da lista (ex.: as ACICs). Vai no formulário de
 * filtros num campo só ("sem", nomes separados por "|"), para caber na paginação.
 */
export function FiltroBeneficiarios({ beneficiarios }: { beneficiarios: Beneficiario[] }) {
  const [tirados, setTirados] = React.useState(() => new Set(beneficiarios.filter((b) => b.tirado).map((b) => b.chave)));
  const [busca, setBusca] = React.useState("");
  const termo = busca.trim().toUpperCase();
  const visiveis = termo ? beneficiarios.filter((b) => b.nome.toUpperCase().includes(termo)) : beneficiarios;
  const nomes = beneficiarios.filter((b) => tirados.has(b.chave)).map((b) => b.nome);
  const alternar = (chave: string, tirar: boolean) =>
    setTirados((t) => {
      const n = new Set(t);
      if (tirar) n.add(chave);
      else n.delete(chave);
      return n;
    });
  const marcarVisiveis = (tirar: boolean) =>
    setTirados((t) => {
      const n = new Set(t);
      for (const b of visiveis) if (tirar) n.add(b.chave);
      else n.delete(b.chave);
      return n;
    });

  return (
    <details className="group relative sm:col-span-2">
      {/* sem nada tirado, o campo nem vai no endereço */}
      <input type="hidden" name="sem" value={nomes.join("|")} disabled={!nomes.length} />
      <summary className="flex h-9 cursor-pointer list-none items-center justify-between gap-2 rounded-md border bg-background px-3 text-sm">
        <span className={nomes.length ? "font-medium text-fct-tinta" : "text-muted-foreground"}>
          {nomes.length ? `Beneficiários: ${nomes.length} tirado(s) da lista` : "Tirar beneficiários da lista…"}
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute z-20 mt-1 w-[min(32rem,90vw)] rounded-lg border bg-card p-3 shadow-lg">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar beneficiário (ex.: ACIC)" className="pl-8" aria-label="Procurar beneficiário" />
        </div>
        <div className="mb-2 flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={() => marcarVisiveis(true)} className="text-fct-tinta underline">
            tirar {termo ? `os ${visiveis.length} encontrados` : "todos"}
          </button>
          <button type="button" onClick={() => marcarVisiveis(false)} className="text-fct-tinta underline">
            voltar {termo ? "os encontrados" : "todos"}
          </button>
          <span className="text-muted-foreground">Marque quem sai da lista e clique em Filtrar.</span>
        </div>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto text-sm">
          {visiveis.length === 0 ? (
            <li className="py-2 text-xs text-muted-foreground">Nenhum beneficiário com esse nome.</li>
          ) : (
            visiveis.map((b) => (
              <li key={b.chave}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                  <input type="checkbox" checked={tirados.has(b.chave)} onChange={(e) => alternar(b.chave, e.target.checked)} className="size-4 accent-fct-tinta" />
                  <span className={`min-w-0 flex-1 truncate ${tirados.has(b.chave) ? "text-muted-foreground line-through" : ""}`} title={b.nome}>
                    {b.nome}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {b.qtd} · {formatarMoeda(b.valor)}
                  </span>
                </label>
              </li>
            ))
          )}
        </ul>
      </div>
    </details>
  );
}
