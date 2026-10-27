"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { lerRelatorioPagar, type RelatorioPagar } from "@/lib/fluxo-caixa/omie-pivot";
import { importarPagar } from "./actions";

type Importacao = { id: string; empresa: string; arquivo: string; gerado: string | null; de: string; ate: string; linhas: number; total: number; criado_em: string; quem: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Importa o a pagar do relatório do Omie "Contas por Período" (lido aqui no navegador; só as somas vão ao servidor). */
export function ImportarPagar({ importacoes, podeEditar }: { importacoes: Importacao[]; podeEditar: boolean }) {
  const router = useRouter();
  const [arquivo, setArquivo] = React.useState<string | null>(null);
  const [rel, setRel] = React.useState<RelatorioPagar | null>(null);
  const [estado, setEstado] = React.useState<{ tipo: "lendo" | "enviando" | "ok" | "erro"; texto?: string } | null>(null);

  const ler = async (f: File | undefined) => {
    setRel(null);
    if (!f) return;
    setArquivo(f.name);
    setEstado({ tipo: "lendo" });
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", dense: true });
      const matriz = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
      const r = lerRelatorioPagar(matriz);
      setRel(r);
      setEstado(r.empresas.length ? null : { tipo: "erro", texto: "Nenhuma conta a pagar da Varela ou da Nazário com os dias abertos neste arquivo." });
    } catch (e) {
      setEstado({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  };

  const enviar = async () => {
    if (!rel || !arquivo) return;
    setEstado({ tipo: "enviando" });
    const r = await importarPagar({ arquivo, titulo: rel.titulo, empresas: rel.empresas.map((e) => ({ empresa: e.empresa, linhas: e.linhas })) });
    if (r.erro) return setEstado({ tipo: "erro", texto: r.erro });
    setEstado({ tipo: "ok", texto: r.mensagem });
    setRel(null);
    router.refresh();
  };

  return (
    <details className="rounded-xl border bg-card p-4" open={!importacoes.length}>
      <summary className="cursor-pointer text-sm font-semibold">
        A pagar do Omie
        {importacoes[0] && (
          <span className="ml-2 font-normal text-muted-foreground">
            · última importação {quando(importacoes[0].criado_em)} por {importacoes[0].quem} ({importacoes[0].empresa})
          </span>
        )}
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        {podeEditar && (
          <>
            <p className="text-xs text-muted-foreground">
              No Omie: Finanças → Relatórios → <strong>Contas por Período</strong> (tipo Contas a Pagar, por data de previsão), exportar em Excel. Na tabela dinâmica deixe as empresas abertas (com o “+” expandido). Cada importação troca o a pagar dos dias que o relatório cobre; os dias de antes ficam guardados como estavam.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => ler(e.target.files?.[0])} className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground" />
          </>
        )}
        {estado?.tipo === "lendo" && <p className="text-muted-foreground">Lendo o arquivo…</p>}
        {estado?.tipo === "erro" && <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-800">{estado.texto}</p>}
        {estado?.tipo === "ok" && <p className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">{estado.texto}</p>}
        {rel && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{rel.titulo}</p>
            {rel.empresas.map((e) => (
              <p key={e.empresa}>
                <strong>{e.empresa}</strong>: {e.contas.toLocaleString("pt-BR")} contas · {dt(e.de)} a {dt(e.ate)} · total <strong>{moeda(e.total)}</strong>
              </p>
            ))}
            {rel.avisos.map((a) => (
              <p key={a} className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                {a}
              </p>
            ))}
            {rel.empresas.length > 0 && (
              <Button type="button" size="sm" onClick={enviar} disabled={estado?.tipo === "enviando"}>
                {estado?.tipo === "enviando" ? "Importando…" : `Importar a pagar (${rel.empresas.map((e) => e.empresa).join(" e ")})`}
              </Button>
            )}
          </div>
        )}
        {importacoes.length > 0 && (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="py-1 text-left">Quando</th>
                <th className="py-1 text-left">Empresa</th>
                <th className="py-1 text-left">Dias</th>
                <th className="py-1 text-right">Total</th>
                <th className="py-1 text-left pl-3">Arquivo</th>
              </tr>
            </thead>
            <tbody>
              {importacoes.map((i) => (
                <tr key={i.id} className="border-b last:border-0">
                  <td className="py-1">
                    {quando(i.criado_em)} · {i.quem}
                  </td>
                  <td className="py-1">{i.empresa}</td>
                  <td className="py-1">
                    {dt(i.de)} a {dt(i.ate)}
                  </td>
                  <td className="py-1 text-right tabular-nums">{moeda(i.total)}</td>
                  <td className="py-1 pl-3 text-muted-foreground">{i.arquivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
