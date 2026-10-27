"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { NotaFluxo } from "@/lib/data/fluxo-caixa";
import { apagarNota, criarNota, resolverNota } from "./actions";

type Props = {
  notas: NotaFluxo[];
  /** empresa escolhida na tela (null = as duas) */
  empresa: string | null;
  meuId: string;
  souAdmin: boolean;
  podeEditar: boolean;
};

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Quadro de anotações para a diretoria: o que precisa de atenção no caixa, quem escreveu e se já foi resolvido. */
export function Anotacoes({ notas, empresa, meuId, souAdmin, podeEditar }: Props) {
  const router = useRouter();
  const [texto, setTexto] = React.useState("");
  const [referencia, setReferencia] = React.useState("");
  const [importante, setImportante] = React.useState(false);
  const [paraEmpresa, setParaEmpresa] = React.useState(empresa ?? "");
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const abertas = notas.filter((n) => !n.resolvidaEm);
  const resolvidas = notas.filter((n) => n.resolvidaEm);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    const r = await criarNota({ empresa: paraEmpresa, referencia, texto, importante });
    setEnviando(false);
    if (r.erro) return setErro(r.erro);
    setErro(null);
    setTexto("");
    setReferencia("");
    setImportante(false);
    router.refresh();
  };
  const agir = async (f: () => Promise<{ erro?: string }>) => {
    const r = await f();
    if (r.erro) setErro(r.erro);
    else router.refresh();
  };

  const cartao = (n: NotaFluxo) => (
    <li key={n.id} className={`rounded-lg border p-3 ${n.resolvidaEm ? "opacity-60" : n.importante ? "border-red-300 bg-red-50/60" : "bg-background"}`}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        {n.importante && !n.resolvidaEm && <span className="rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">IMPORTANTE</span>}
        <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{n.empresa ?? "VARELA e NAZÁRIO"}</span>
        {n.referencia && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">dia {ddmm(n.referencia)}</span>}
      </div>
      <p className="whitespace-pre-wrap text-sm">{n.texto}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span>
          {n.autor} · {quando(n.criadoEm)}
        </span>
        {n.resolvidaEm && <span className="text-emerald-700">✓ resolvida por {n.resolvidaPor ?? "—"} em {quando(n.resolvidaEm)}</span>}
        <span className="ml-auto flex gap-2">
          {(podeEditar || n.autorId === meuId) && (
            <button type="button" className="underline hover:text-foreground" onClick={() => agir(() => resolverNota({ id: n.id, resolvida: !n.resolvidaEm }))}>
              {n.resolvidaEm ? "reabrir" : "marcar resolvida"}
            </button>
          )}
          {(n.autorId === meuId || souAdmin) && (
            <button type="button" className="underline hover:text-red-700" onClick={() => confirm("Apagar esta anotação?") && agir(() => apagarNota({ id: n.id }))}>
              apagar
            </button>
          )}
        </span>
      </div>
    </li>
  );

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-base font-semibold">Anotações para a diretoria</h2>
      <p className="mb-3 text-xs text-muted-foreground">O que a diretoria precisa saber do caixa: dias apertados, pagamentos grandes, combinados com banco ou fornecedor.</p>
      <form onSubmit={enviar} className="space-y-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Ex.: dia 13 tem boletos de R$ 869 mil + ICMS + aluguel; vamos antecipar cartão na segunda."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          aria-label="Anotação"
        />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1">
            Sobre o dia
            <input type="date" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="rounded border border-input bg-background px-1.5 py-1" />
          </label>
          <select value={paraEmpresa} onChange={(e) => setParaEmpresa(e.target.value)} className="rounded border border-input bg-background px-1.5 py-1" aria-label="Empresa">
            <option value="">VARELA e NAZÁRIO</option>
            <option value="VARELA">VARELA</option>
            <option value="NAZÁRIO">NAZÁRIO</option>
          </select>
          <label className="flex items-center gap-1 font-medium text-red-700">
            <input type="checkbox" checked={importante} onChange={(e) => setImportante(e.target.checked)} />
            Importante
          </label>
          <Button type="submit" size="sm" className="ml-auto" disabled={enviando || !texto.trim()}>
            Anotar
          </Button>
        </div>
        {erro && <p className="text-xs text-red-700">{erro}</p>}
      </form>
      <ul className="mt-4 space-y-2">
        {abertas.length ? abertas.map(cartao) : <li className="text-sm text-muted-foreground">Nenhuma anotação aberta.</li>}
      </ul>
      {resolvidas.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">Resolvidas ({resolvidas.length})</summary>
          <ul className="mt-2 space-y-2">{resolvidas.map(cartao)}</ul>
        </details>
      )}
    </section>
  );
}
