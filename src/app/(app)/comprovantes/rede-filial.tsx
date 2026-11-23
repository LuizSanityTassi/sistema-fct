"use client";

import * as React from "react";
import { SelectNativo } from "@/components/form/campo";

type Props = {
  redes: { id: string; nome: string }[];
  filiais: { id: string; codigo: string; nome: string; rede: string | null }[];
  rede?: string;
  filial?: string;
};

/** Rede e filial da pesquisa: escolher a rede deixa na lista só as filiais dela. */
export function RedeFilial({ redes, filiais, rede: redeInicial, filial: filialInicial }: Props) {
  const [rede, setRede] = React.useState(redeInicial ?? "");
  const [filial, setFilial] = React.useState(filialInicial ?? "");
  const daRede = rede ? filiais.filter((f) => f.rede === rede) : filiais;

  return (
    <>
      {redes.length > 1 && (
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Rede</span>
          <SelectNativo
            name="rede"
            value={rede}
            onChange={(e) => {
              setRede(e.target.value);
              if (e.target.value && !filiais.some((f) => f.id === filial && f.rede === e.target.value)) setFilial("");
            }}
          >
            <option value="">Todas</option>
            {redes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
      )}
      <label className="grid gap-1 text-sm">
        <span className="font-medium">Filial</span>
        <SelectNativo name="filial" value={filial} onChange={(e) => setFilial(e.target.value)}>
          <option value="">Todas</option>
          {daRede.map((f) => (
            <option key={f.id} value={f.id}>
              {f.codigo} — {f.nome}
            </option>
          ))}
        </SelectNativo>
      </label>
    </>
  );
}
