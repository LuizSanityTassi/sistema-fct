"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { colarPrevisoes, salvarPrevisao } from "./actions";

export type DiaPrevisao = { data: string; rotulo: string; especial: string | null; hoje: boolean; valores: Record<string, number | null> };
/** chave = "EMPRESA|campo" (ex.: "VARELA|receber") */
type Coluna = { chave: string; empresa: string; campo: "receber" | "cartao"; titulo: string; sub: string };

const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Tabela de previsão do financeiro (a receber e cartão de crédito das duas empresas), um mês por vez. Colar um bloco
 * copiado da planilha de previsão preenche a partir da célula clicada: linhas = dias corridos, colunas = as daqui.
 */
export function GradePrevisoes({ dias, colunas, podeEditar, tituloMes }: { dias: DiaPrevisao[]; colunas: Coluna[]; podeEditar: boolean; tituloMes: string }) {
  const router = useRouter();
  const [aviso, setAviso] = React.useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const focar = (c: number, i: number) => document.querySelector<HTMLInputElement>(`[data-prev="${c}-${i}"]`)?.focus();
  const salvar = async (col: Coluna, d: DiaPrevisao, texto: string, original: string) => {
    if (texto.trim() === original.trim()) return;
    const r = await salvarPrevisao({ empresa: col.empresa, data: d.data, campo: col.campo, valor: texto });
    if (r.erro) setAviso({ tipo: "erro", texto: `${d.rotulo}: ${r.erro}` });
    else router.refresh();
  };
  const colar = async (c: number, d: DiaPrevisao, e: React.ClipboardEvent<HTMLInputElement>) => {
    const linhas = e.clipboardData.getData("text").replace(/\r/g, "").replace(/\n+$/, "").split("\n");
    const largura = Math.max(...linhas.map((l) => l.split("\t").length));
    if (linhas.length < 2 && largura < 2) return; // um valor só: cola normal
    e.preventDefault();
    setSalvando(true);
    const feitas: string[] = [];
    for (let k = 0; k < largura && c + k < colunas.length; k++) {
      const col = colunas[c + k];
      const r = await colarPrevisoes({ empresa: col.empresa, inicio: d.data, campo: col.campo, linhas: linhas.map((l) => l.split("\t")[k] ?? "") });
      if (r.erro && r.erro !== "Nenhum número no que foi colado.") {
        setSalvando(false);
        return setAviso({ tipo: "erro", texto: `${col.titulo}: ${r.erro}` });
      }
      if (!r.erro) feitas.push(col.titulo);
    }
    setSalvando(false);
    setAviso(feitas.length ? { tipo: "ok", texto: `Colado a partir de ${d.rotulo}: ${feitas.join(", ")}.` } : { tipo: "erro", texto: "Nenhum número no que foi colado." });
    router.refresh();
  };

  const total = (chave: string) => dias.reduce((t, d) => t + (d.valores[chave] ?? 0), 0);

  return (
    <div className="space-y-2">
      {aviso && (
        <p role="status" className={`rounded-lg border px-3 py-2 text-sm ${aviso.tipo === "erro" ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
          {aviso.texto}{" "}
          <button type="button" className="ml-2 text-xs underline" onClick={() => setAviso(null)}>
            fechar
          </button>
        </p>
      )}
      <div className={`overflow-x-auto rounded-xl border bg-card ${salvando ? "opacity-60" : ""}`}>
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-xs font-semibold">
              <th className="bg-neutral-800 px-2 py-2 text-left text-white">Dia</th>
              {colunas.map((c) => (
                <th key={c.chave} className={`px-2 py-2 text-right ${c.campo === "receber" ? "bg-red-900 text-white" : "bg-amber-400 text-neutral-900"}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
            <tr className="text-[11px] italic text-muted-foreground">
              <th />
              {colunas.map((c) => (
                <th key={c.chave} className="px-2 py-1 text-right font-normal">
                  {c.sub}
                </th>
              ))}
            </tr>
            <tr className="border-y bg-rose-50 text-xs font-semibold">
              <th className="px-2 py-1.5 text-left uppercase">{tituloMes}</th>
              {colunas.map((c) => (
                <th key={c.chave} className="px-2 py-1.5 text-right tabular-nums">
                  R$ {num(total(c.chave))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map((d, i) => (
              <tr key={d.data} className={`border-b last:border-0 ${d.especial ? "bg-rose-50/70 text-muted-foreground" : ""} ${d.hoje ? "outline-2 -outline-offset-2 outline-primary" : ""}`}>
                <td className="whitespace-nowrap px-2 py-1">
                  <span className="font-medium tabular-nums text-foreground">{d.rotulo}</span>
                  {d.especial && <span className="ml-2 text-xs font-semibold text-rose-700">{d.especial}</span>}
                </td>
                {colunas.map((col, c) => {
                  const v = d.valores[col.chave];
                  const original = v == null ? "" : num(v);
                  return (
                    <td key={col.chave} className="px-1 py-0.5 text-right tabular-nums">
                      {podeEditar ? (
                        <input
                          key={`${d.data}-${col.chave}-${original}`}
                          data-prev={`${c}-${i}`}
                          defaultValue={original}
                          inputMode="decimal"
                          maxLength={30}
                          placeholder="—"
                          aria-label={`${col.titulo} de ${d.rotulo}`}
                          onBlur={(e) => salvar(col, d, e.currentTarget.value, original)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              focar(c, i + 1);
                            }
                            if (e.key === "Escape") {
                              e.currentTarget.value = original;
                              e.currentTarget.blur();
                            }
                          }}
                          onPaste={(e) => colar(c, d, e)}
                          className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right hover:border-input focus:border-primary focus:bg-background focus:outline-none"
                        />
                      ) : v == null ? (
                        "—"
                      ) : (
                        `R$ ${num(v)}`
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {podeEditar
          ? "Digite o valor ou cole da planilha de previsão: copie o bloco lá (uma coluna ou várias lado a lado, na mesma ordem daqui) e cole no 1º dia. Cada linha cai num dia corrido; Sábado, Domingo e Feriado só pulam o dia. Enter vai para o dia seguinte; apague para limpar."
          : "Somente leitura."}{" "}
        O fluxo de caixa usa estes valores.
      </p>
    </div>
  );
}
