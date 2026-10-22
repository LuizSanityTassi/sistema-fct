"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { CAMPOS_SALDO, type Dre } from "@/lib/financeiro/dre";
import { arred41 } from "@/lib/financeiro/formatos";
import { CelulaEditavel } from "./celula-editavel";
import type { RespostaCelula } from "./actions";

type Props = {
  dre: Dre;
  escopo: { grupo: string; filial: string };
  podeEditar: boolean;
  salvarAjuste: (fd: FormData) => Promise<RespostaCelula>;
  salvarSaldo: (fd: FormData) => Promise<RespostaCelula>;
  ajustes: Record<string, number>; // `${categoriaId}|${mes}` → valor manual
};

const inteiro = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
/** Número cheio, sem centavos (regra 41) e sem "R$" (pedido do usuário: só no Caixa contábil), igual à planilha da diretoria. */
const moedaDre = (v: number) => (v ? `${v < 0 ? "-" : ""}${inteiro.format(arred41(Math.abs(v)))}` : "—");
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (m: string) => `${MESES_CURTO[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
const pctFmt = (v: number, base: number) => (base > 0 ? `${((v / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const tom = (v: number) => (v < 0 ? "text-red-700" : v > 0 ? "text-emerald-700" : "text-muted-foreground");

export function DreTabela({ dre, escopo, podeEditar, salvarAjuste, salvarSaldo, ajustes }: Props) {
  const [nivel, setNivel] = React.useState<1 | 2 | 3>(1);
  const [busca, setBusca] = React.useState("");
  const termo = busca.trim().toLowerCase();
  const mostraGrupos = nivel >= 2 || !!termo;
  const mostraCategorias = nivel >= 3 || !!termo;
  const casa = (nome: string) => !termo || nome.toLowerCase().includes(termo);
  const foraTotal = (m: string) => !dre.mesesTotal.includes(m);
  const base = { grupo: escopo.grupo, filial: escopo.filial };

  const linhaTotal = ({ nome, porMes, total, classe, nivelVisual }: { nome: string; porMes: Record<string, number>; total: number; classe: string; nivelVisual: number }) => (
    <tr key={`total-${nome}-${nivelVisual}`} className={classe}>
      <td className="px-2 py-1" style={{ paddingLeft: 8 + nivelVisual * 14 }}>
        {nome}
      </td>
      {dre.meses.map((m) => (
        <td key={m} className={`px-2 py-1 text-right tabular-nums ${foraTotal(m) ? "text-muted-foreground/70" : ""}`}>
          {moedaDre(porMes[m] ?? 0)}
        </td>
      ))}
      <td className="px-2 py-1 text-right font-semibold tabular-nums">{moedaDre(total)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{pctFmt(total, dre.totalReceitas)}</td>
    </tr>
  );

  const linhaCategoria = (c: Dre["familias"][number]["grupos"][number]["categorias"][number], nivelVisual: number) => (
    <tr key={c.id} className="text-sm">
      <td className="px-2 py-1 text-muted-foreground" style={{ paddingLeft: 8 + nivelVisual * 14 }}>
        {c.nome}
      </td>
      {dre.meses.map((m) => {
        const cel = c.porMes[m];
        const manual = ajustes[`${c.id}|${m}`];
        return (
          <CelulaEditavel
            key={m}
            action={salvarAjuste}
            campos={{ ...base, categoria_id: c.id, competencia: m }}
            valorAtual={manual ?? null}
            exibicao={moedaDre(cel.valor)}
            automatico={moedaDre(cel.auto)}
            ajustado={cel.ajustado}
            classe={`text-sm ${foraTotal(m) ? "text-muted-foreground/70" : tom(cel.valor)}`}
            podeEditar={podeEditar}
          />
        );
      })}
      <td className="px-2 py-1 text-right tabular-nums">{moedaDre(c.total)}</td>
      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{pctFmt(c.total, dre.totalReceitas)}</td>
    </tr>
  );

  const linhaSaldo = (rotulo: string, campo: string, dica: string, editavelEm: (m: string) => boolean, valorDe: (m: string) => number | null, somaTotal = true) => {
    const total = dre.mesesTotal.reduce((s, m) => s + (valorDe(m) ?? 0), 0);
    return (
      <tr className="bg-muted/40 font-semibold">
        <td className="px-2 py-1" title={dica}>
          {rotulo}
        </td>
        {dre.meses.map((m) => {
          const v = valorDe(m);
          if (!editavelEm(m) || !podeEditar) {
            return (
              <td key={m} className={`px-2 py-1 text-right tabular-nums ${v == null ? "text-muted-foreground" : tom(v)}`}>
                {v == null ? "—" : moedaDre(v)}
              </td>
            );
          }
          return <CelulaEditavel key={m} action={salvarSaldo} campos={{ ...base, campo, competencia: m }} valorAtual={v} exibicao={v == null ? "—" : moedaDre(v)} ajustado={v != null} podeEditar classe="font-semibold" />;
        })}
        <td className="px-2 py-1 text-right tabular-nums">{somaTotal && total ? moedaDre(total) : "—"}</td>
        <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{somaTotal && total ? pctFmt(total, dre.totalReceitas) : "—"}</td>
      </tr>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted-foreground">Detalhe:</span>
        {([1, 2, 3] as const).map((n) => (
          <button key={n} type="button" onClick={() => setNivel(n)} className={`rounded-full border px-3 py-1 text-xs ${nivel === n ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
            {n === 1 ? "Totais" : n === 2 ? "Grupos" : "Categorias"}
          </button>
        ))}
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar categoria" className="ml-auto w-56" aria-label="Buscar categoria" />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-2 py-2 text-left">Conta</th>
              {dre.meses.map((m) => (
                <th key={m} className={`px-2 py-2 text-right ${foraTotal(m) ? "font-normal text-muted-foreground/70" : ""}`} title={foraTotal(m) ? "Antes do início escolhido: aparece, mas não entra no total" : undefined}>
                  {rotuloMes(m)}
                </th>
              ))}
              <th className="px-2 py-2 text-right">TOTAL</th>
              <th className="px-2 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {linhaSaldo(
              "SALDO INICIAL",
              "saldo_inicial",
              "Caixa no começo do mês. No 1º mês do período você digita; nos seguintes vem do resultado acumulado do mês anterior.",
              (m) => m === dre.mesesTotal[0],
              (m) => dre.saldoInicial[m] ?? null,
              false,
            )}
            {dre.familias.map((f) => (
              <React.Fragment key={f.nome}>
                {casa(f.nome) || f.grupos.some((g) => casa(g.nome) || g.categorias.some((c) => casa(c.nome))) ? linhaTotal({ nome: f.nome, porMes: f.porMes, total: f.total, classe: "bg-primary text-primary-foreground font-semibold", nivelVisual: 0 }) : null}
                {mostraGrupos &&
                  f.grupos.map((g) => (
                    <React.Fragment key={g.nome}>
                      {(casa(g.nome) || g.categorias.some((c) => casa(c.nome))) && g.nome !== f.nome ? linhaTotal({ nome: g.nome, porMes: g.porMes, total: g.total, classe: "bg-muted/50 font-semibold", nivelVisual: 1 }) : null}
                      {mostraCategorias && g.categorias.filter((c) => casa(c.nome)).map((c) => linhaCategoria(c, 2))}
                    </React.Fragment>
                  ))}
              </React.Fragment>
            ))}
            {dre.naoClassificadas.length > 0 && (
              <>
                <tr className="bg-amber-600 text-white font-semibold">
                  <td className="px-2 py-1" colSpan={dre.meses.length + 3}>
                    NÃO CLASSIFICADAS ({dre.naoClassificadas.length}) — categorias fora do molde do caixa contábil (classifique em Categorias)
                  </td>
                </tr>
                {dre.naoClassificadas.filter((c) => casa(c.nome)).map((c) => linhaCategoria(c, 1))}
              </>
            )}
            {linhaTotal({ nome: "Total de saídas", porMes: dre.saidas.porMes, total: dre.saidas.total, classe: "bg-neutral-700 text-white font-semibold", nivelVisual: 0 })}
            <tr className="border-t-2 border-fct-yellow font-bold">
              <td className="px-2 py-1.5">RESULTADO REALIZADO TOTAL MÊS</td>
              {dre.meses.map((m) => (
                <td key={m} className={`px-2 py-1.5 text-right tabular-nums ${tom(dre.resultado.porMes[m])} ${foraTotal(m) ? "opacity-60" : ""}`}>
                  {moedaDre(dre.resultado.porMes[m])}
                </td>
              ))}
              <td className={`px-2 py-1.5 text-right tabular-nums ${tom(dre.resultado.total)}`}>{moedaDre(dre.resultado.total)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{pctFmt(dre.resultado.total, dre.totalReceitas)}</td>
            </tr>
            {CAMPOS_SALDO.slice(0, 2).map((c) => linhaSaldo(c.rotulo, c.campo, "Digite o valor do mês.", () => true, (m) => dre.saldos[c.campo]?.[m] ?? null))}
            <tr className="border-t-2 bg-muted/40 font-semibold">
              <td className="px-2 py-1" title="Soma do SALDO INICIAL com o resultado de cada mês, encadeado. É o caixa acumulado desde o início do período.">
                RESULTADO ACUMULADO TOTAL
              </td>
              {dre.meses.map((m) => {
                const v = dre.acumulado[m];
                return (
                  <td key={m} className={`px-2 py-1 text-right tabular-nums ${v == null ? "text-muted-foreground" : tom(v)}`}>
                    {v == null ? "—" : moedaDre(v)}
                  </td>
                );
              })}
              <td className={`px-2 py-1 text-right tabular-nums ${tom(dre.acumulado[dre.mesesTotal[dre.mesesTotal.length - 1]] ?? 0)}`}>{moedaDre(dre.acumulado[dre.mesesTotal[dre.mesesTotal.length - 1]] ?? 0)}</td>
              <td className="px-2 py-1 text-right text-muted-foreground">—</td>
            </tr>
            {linhaSaldo(CAMPOS_SALDO[2].rotulo, CAMPOS_SALDO[2].campo, "Limites disponíveis nos bancos.", () => true, (m) => dre.saldos.limites_bancos?.[m] ?? null)}
            <tr className="bg-muted/40 font-semibold">
              <td className="px-2 py-1" title="Resultado acumulado dividido pela receita do mês: quantos % da receita viram caixa.">
                Capacidade de geração de caixa
              </td>
              {dre.meses.map((m) => {
                const v = dre.capacidade[m];
                return (
                  <td key={m} className={`px-2 py-1 text-right tabular-nums ${v == null ? "text-muted-foreground" : tom(v)}`}>
                    {v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-right text-muted-foreground">—</td>
              <td className="px-2 py-1 text-right text-muted-foreground">—</td>
            </tr>
            <tr className="bg-muted/40 font-semibold">
              <td className="px-2 py-1" title="Em quantos meses o caixa acumulado se paga pelo resultado médio recente.">
                Payback (meses)
              </td>
              {dre.meses.map((m) => {
                const v = dre.payback[m];
                return (
                  <td key={m} className="px-2 py-1 text-right tabular-nums">
                    {v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-right text-muted-foreground">—</td>
              <td className="px-2 py-1 text-right text-muted-foreground">—</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Receitas (+) · custo e despesas (−). Valores sem centavos. {podeEditar ? "Clique numa célula de categoria para ajustar o número manualmente (o contador pode sobrescrever o automático; apague para voltar). Células amarelas = ajuste manual. Totais recalculam sozinhos." : "Somente leitura."}
      </p>
    </div>
  );
}
