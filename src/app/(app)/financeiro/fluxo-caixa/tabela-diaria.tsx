"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { colarPrevisoes, salvarMotivo, salvarPrevisao } from "./actions";

export type LinhaDia = {
  data: string;
  rotulo: string; // dd/mm/aaaa
  semana: string; // Segunda…
  especial: string | null; // Sábado, Domingo ou nome do feriado
  hoje: boolean;
  receber: number | null;
  cartao: number | null;
  pagar: number;
  /** a pagar do dia por lugar do relatório (Despesas fixas › …) */
  pagarLugares: Record<string, number>;
  motivo: string | null;
};

type Props = {
  linhas: LinhaDia[];
  /** null = as duas empresas somadas (só leitura) */
  empresa: string | null;
  podeEditar: boolean;
  tituloMes: string;
  /** a pagar do dia a partir disto fica em vermelho forte, como na planilha */
  diaPesado: number;
};

const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moeda = (v: number | null) => (v == null ? "—" : `${v < 0 ? "-" : ""}R$ ${num(Math.abs(v))}`);
type Coluna = "receber" | "cartao" | "motivo";

/** Resumo diário do mês, como a planilha: digita a receber, cartão e motivo direto na linha; cola uma coluna inteira. */
export function TabelaDiaria({ linhas, empresa, podeEditar, tituloMes, diaPesado }: Props) {
  const router = useRouter();
  const [aviso, setAviso] = React.useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = React.useState<string | null>(null);
  const editavel = podeEditar && !!empresa;

  const totais = linhas.reduce(
    (t, l) => ({ receber: t.receber + (l.receber ?? 0), pagar: t.pagar + l.pagar, cartao: t.cartao + (l.cartao ?? 0) }),
    { receber: 0, pagar: 0, cartao: 0 },
  );
  const comAcumulado = linhas.reduce<(LinhaDia & { balanco: number; acumulado: number })[]>((lista, l) => {
    const balanco = (l.receber ?? 0) - l.pagar;
    lista.push({ ...l, balanco, acumulado: (lista.at(-1)?.acumulado ?? 0) + balanco });
    return lista;
  }, []);

  const focar = (col: Coluna, i: number) => document.querySelector<HTMLInputElement>(`[data-fluxo="${col}-${i}"]`)?.focus();

  const salvar = async (col: Coluna, l: LinhaDia, texto: string, original: string) => {
    if (!empresa || texto.trim() === original.trim()) return;
    setSalvando(`${col}-${l.data}`);
    const r = col === "motivo" ? await salvarMotivo({ empresa, data: l.data, texto }) : await salvarPrevisao({ empresa, data: l.data, campo: col, valor: texto });
    setSalvando(null);
    if (r.erro) setAviso({ tipo: "erro", texto: `${l.rotulo}: ${r.erro}` });
    else router.refresh();
  };

  const colar = async (col: "receber" | "cartao", l: LinhaDia, e: React.ClipboardEvent<HTMLInputElement>) => {
    const texto = e.clipboardData.getData("text");
    const partes = texto.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
    if (partes.length < 2 || !empresa) return; // um valor só: cola normal na célula
    e.preventDefault();
    setSalvando(`${col}-${l.data}`);
    // da planilha vem uma coluna (ou várias: fica a primeira)
    const r = await colarPrevisoes({ empresa, inicio: l.data, campo: col, linhas: partes.map((p) => p.split("\t")[0]) });
    setSalvando(null);
    setAviso(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: `${r.mensagem} A partir de ${l.rotulo}.` });
    if (!r.erro) router.refresh();
  };

  const celula = (col: Coluna, l: LinhaDia, i: number) => {
    const valor = col === "motivo" ? l.motivo : l[col];
    const original = col === "motivo" ? (l.motivo ?? "") : valor == null ? "" : num(valor as number);
    if (!editavel) return col === "motivo" ? <span className="text-xs">{l.motivo}</span> : <span>{moeda(valor as number | null)}</span>;
    return (
      <input
        key={`${l.data}-${col}-${original}`}
        data-fluxo={`${col}-${i}`}
        defaultValue={original}
        aria-label={`${col === "receber" ? "A receber" : col === "cartao" ? "Previsão de cartão" : "Motivos"} de ${l.rotulo}`}
        inputMode={col === "motivo" ? "text" : "decimal"}
        maxLength={col === "motivo" ? 500 : 30}
        placeholder={col === "motivo" ? "" : "—"}
        onBlur={(e) => salvar(col, l, e.currentTarget.value, original)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            focar(col, i + 1);
          }
          if (e.key === "Escape") {
            e.currentTarget.value = original;
            e.currentTarget.blur();
          }
        }}
        onPaste={col === "motivo" ? undefined : (e) => colar(col, l, e)}
        className={`w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 hover:border-input focus:border-primary focus:bg-background focus:outline-none ${col === "motivo" ? "text-left text-xs" : "text-right tabular-nums"} ${salvando === `${col}-${l.data}` ? "opacity-50" : ""}`}
      />
    );
  };

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
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-xs font-semibold text-white">
              <th className="bg-neutral-800 px-2 py-2 text-left">Dia</th>
              <th className="bg-red-900 px-2 py-2 text-right">A receber (previsão)</th>
              <th className="bg-red-800 px-2 py-2 text-right">A pagar</th>
              <th className="bg-red-700 px-2 py-2 text-right">Balanço</th>
              <th className="bg-red-600 px-2 py-2 text-right">Acumulado</th>
              <th className="bg-amber-400 px-2 py-2 text-right text-neutral-900">Previsão de cartão</th>
              <th className="bg-emerald-100 px-2 py-2 text-left text-neutral-900">Fatores causais (motivos)</th>
            </tr>
            <tr className="text-[11px] italic text-muted-foreground">
              <th className="px-2 py-1 text-left font-normal" />
              <th className="px-2 py-1 text-right font-normal">Dinheiro + PIX + Débito</th>
              <th className="px-2 py-1 text-right font-normal">Relatório do Omie</th>
              <th className="px-2 py-1 text-right font-normal">A receber − A pagar</th>
              <th className="px-2 py-1 text-right font-normal">Balanço somado no mês</th>
              <th className="px-2 py-1 text-right font-normal">Cartões de crédito</th>
              <th className="px-2 py-1 text-left font-normal">Motivos</th>
            </tr>
            <tr className="border-y bg-rose-50 text-xs font-semibold">
              <th className="px-2 py-1.5 text-left uppercase">{tituloMes}</th>
              <th className="px-2 py-1.5 text-right tabular-nums">{moeda(totais.receber)}</th>
              <th className="px-2 py-1.5 text-right tabular-nums text-red-700">{moeda(totais.pagar)}</th>
              <th className={`px-2 py-1.5 text-right tabular-nums ${totais.receber - totais.pagar < 0 ? "text-red-700" : "text-emerald-700"}`}>{moeda(totais.receber - totais.pagar)}</th>
              <th className="px-2 py-1.5" />
              <th className="px-2 py-1.5 text-right tabular-nums">{moeda(totais.cartao)}</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {comAcumulado.map((l, i) => {
              const pesado = l.pagar >= diaPesado;
              const grupos = Object.entries(l.pagarLugares)
                .sort((a, b) => b[1] - a[1])
                .map(([g, v]) => `${g}: R$ ${num(v)}`)
                .join("\n");
              return (
                <tr key={l.data} className={`border-b last:border-0 ${l.especial ? "bg-rose-50/70 text-muted-foreground" : ""} ${l.hoje ? "outline-2 -outline-offset-2 outline-primary" : ""}`}>
                  <td className="whitespace-nowrap px-2 py-1">
                    <span className="font-medium tabular-nums text-foreground">{l.rotulo}</span>
                    <span className={`ml-2 text-xs ${l.especial ? "font-semibold text-rose-700" : "text-muted-foreground"}`}>{l.especial ?? l.semana}</span>
                  </td>
                  <td className="px-1 py-0.5 text-right tabular-nums">{celula("receber", l, i)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums ${pesado ? "bg-red-600 font-semibold text-white" : "text-red-700"}`} title={grupos || undefined}>
                    {l.pagar ? `(${num(l.pagar)})` : "—"}
                  </td>
                  <td className={`px-2 py-1 text-right font-semibold tabular-nums ${l.balanco < 0 ? "text-red-700" : "text-foreground"}`}>{l.receber == null && !l.pagar ? "—" : moeda(l.balanco)}</td>
                  <td className={`px-2 py-1 text-right tabular-nums text-xs ${l.acumulado < 0 ? "text-red-700" : "text-emerald-700"}`}>{moeda(l.acumulado)}</td>
                  <td className="px-1 py-0.5 text-right tabular-nums">{celula("cartao", l, i)}</td>
                  <td className="min-w-56 px-1 py-0.5">{celula("motivo", l, i)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {editavel
          ? "Clique no valor para digitar; Enter vai para o dia seguinte. Para trazer a planilha de previsão, copie a coluna inteira lá e cole no 1º dia aqui: cada linha cai num dia (Sábado, Domingo e Feriado só pulam o dia). Apague o valor para limpar."
          : empresa
            ? "Somente leitura."
            : "Vendo as duas empresas somadas. Para digitar, escolha VARELA ou NAZÁRIO."}{" "}
        Passe o mouse no a pagar para ver onde ele se divide (fixas, variáveis…). Vermelho forte = dia com a pagar a partir de R$ {num(diaPesado)}.
      </p>
    </div>
  );
}
