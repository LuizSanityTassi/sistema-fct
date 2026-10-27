"use client";

import * as React from "react";

export type LinhaCategoria = {
  /** 1 = bloco (DESPESAS FIXAS…), 2 = grupo dentro do bloco, 3 = categoria do Omie */
  nivel: 1 | 2 | 3;
  rotulo: string;
  dica?: string;
  valores: number[];
  total: number;
  /** cor da linha do bloco, como na planilha: vermelho (custo, fixas, variáveis) ou amarelo (os outros) */
  cor?: "vermelho" | "amarelo";
  /** "não classificadas": em vermelho forte */
  alerta?: boolean;
};

type Props = {
  colunas: { rotulo: string; atual?: boolean }[];
  linhas: LinhaCategoria[];
  totalGeral: number[];
  /** faixa em cima da tabela ("PREVISÃO", "REALIZADO"); sem ela, título "A pagar por categoria" */
  faixa?: { texto: string; tom: "previsao" | "realizado" };
  rotuloTotal?: string;
  centavos?: boolean;
  nivelInicial?: 1 | 2 | 3;
  rodape?: string;
};

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A pagar dividido como a coordenação financeira lê: blocos (fixas, variáveis…), grupos e categorias do Omie. */
export function TabelaCategorias({ colunas, linhas, totalGeral, faixa, rotuloTotal = "TOTAL A PAGAR", centavos = false, nivelInicial = 2, rodape }: Props) {
  const [nivel, setNivel] = React.useState<1 | 2 | 3>(nivelInicial);
  const [zeradas, setZeradas] = React.useState(false);
  const visiveis = linhas.filter((l) => l.nivel <= nivel && (zeradas || l.total !== 0 || l.alerta || l.nivel === 1));
  const soma = totalGeral.reduce((t, v) => t + v, 0);
  const fmt = (v: number) => (v ? `${centavos ? "R$ " : ""}${(centavos ? decimal : inteiro).format(centavos ? v : Math.round(v))}` : centavos ? "R$ –" : "—");
  const corLinha = (l: LinhaCategoria) =>
    l.alerta
      ? ["bg-red-600 text-white font-semibold", "bg-red-600"]
      : l.nivel === 1
        ? l.cor === "amarelo"
          ? ["bg-amber-200 text-neutral-900 font-semibold", "bg-amber-200"]
          : ["bg-red-400 text-neutral-950 font-bold", "bg-red-400"]
        : l.nivel === 2
          ? ["bg-muted/60 font-semibold", "bg-muted"]
          : ["", "bg-card"];

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {!faixa && <h2 className="mr-2 text-base font-semibold">A pagar por categoria</h2>}
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" onClick={() => setNivel(n)} className={`rounded-full border px-3 py-1 text-xs ${nivel === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
            {n === 1 ? "Blocos" : n === 2 ? "Grupos" : "Categorias"}
          </button>
        ))}
        <button type="button" onClick={() => setZeradas(!zeradas)} className={`rounded-full border px-3 py-1 text-xs ${zeradas ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
          {zeradas ? "Esconder categorias sem valor" : "Mostrar todas as categorias do Omie"}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-xs">
          <thead>
            {faixa && (
              <tr>
                <th className="sticky left-0 z-10 bg-card" />
                <th colSpan={colunas.length + 2} className={`border-b px-2 py-1.5 text-center text-sm font-semibold tracking-wide ${faixa.tom === "previsao" ? "bg-red-400 text-neutral-950" : "bg-green-200 text-neutral-900"}`}>
                  {faixa.texto}
                </th>
              </tr>
            )}
            <tr className="border-b text-muted-foreground">
              <th className="sticky left-0 z-10 min-w-64 bg-card px-2 py-2 text-left">Conta</th>
              {colunas.map((c) => (
                <th key={c.rotulo} className={`whitespace-nowrap px-2 py-2 text-right uppercase ${c.atual ? "text-primary" : ""}`}>
                  {c.rotulo}
                </th>
              ))}
              <th className="px-2 py-2 text-right">TOTAL</th>
              <th className="px-2 py-2 text-right">%</th>
            </tr>
            <tr className="border-b font-semibold">
              <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left">{rotuloTotal}</th>
              {totalGeral.map((v, i) => (
                <th key={i} className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                  {fmt(v)}
                </th>
              ))}
              <th className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{fmt(soma)}</th>
              <th className="px-2 py-1.5 text-right">100%</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l, i) => {
              const [cor, fundoFixo] = corLinha(l);
              return (
                <tr key={`${l.rotulo}-${i}`} className={`border-b last:border-0 ${cor}`}>
                  <td className={`sticky left-0 z-10 whitespace-nowrap px-2 py-1 ${fundoFixo}`} style={{ paddingLeft: 8 + (l.nivel - 1) * 14 }} title={l.dica}>
                    {l.rotulo}
                  </td>
                  {l.valores.map((v, j) => (
                    <td key={j} className="whitespace-nowrap px-2 py-1 text-right tabular-nums">
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-2 py-1 text-right font-semibold tabular-nums">{fmt(l.total)}</td>
                  <td className="px-2 py-1 text-right tabular-nums opacity-70">{soma ? `${((l.total / soma) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rodape && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{rodape}</p>}
      </div>
    </section>
  );
}
