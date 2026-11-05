"use client";

import { useRouter } from "next/navigation";

export type OpcaoFilialVendas = { id: string; rotulo: string; grupo: string };

/** Escolha de uma filial só no painel de vendas (a lista é a das lojas que a pessoa vê). */
export function EscolhaFilial({ lojas, atual }: { lojas: OpcaoFilialVendas[]; atual: string }) {
  const router = useRouter();
  const grupos = [...new Set(lojas.map((l) => l.grupo))];
  return (
    <label className="flex items-center">
      <span className="sr-only">Ver uma filial só</span>
      <select
        value={atual}
        onChange={(e) => router.push(e.target.value ? `/vendas?filial=${encodeURIComponent(e.target.value)}` : "/vendas")}
        className="h-[34px] max-w-56 rounded-lg border bg-card px-2.5 text-sm"
      >
        <option value="">{atual ? "Todas as filiais" : "Uma filial…"}</option>
        {grupos.map((g) => (
          <optgroup key={g} label={g}>
            {lojas
              .filter((l) => l.grupo === g)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.rotulo}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}
