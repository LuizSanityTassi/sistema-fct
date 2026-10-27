"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PAPEL_LABEL, ehPapel } from "@/lib/roles";
import { compartilharFluxo, removerAcessoFluxo } from "./actions";

type Props = {
  acessos: { userId: string; nome: string; papel: string; podeEditar: boolean }[];
  disponiveis: { id: string; nome: string; papel: string }[];
};

const papel = (p: string) => (ehPapel(p) ? PAPEL_LABEL[p] : p);

/** Quem mais vê o fluxo de caixa (além de Administrador e Financeiro), só vendo ou também digitando. */
export function Compartilhar({ acessos, disponiveis }: Props) {
  const router = useRouter();
  const [pessoa, setPessoa] = React.useState("");
  const [editar, setEditar] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const agir = async (f: () => Promise<{ erro?: string }>) => {
    const r = await f();
    if (r.erro) setErro(r.erro);
    else {
      setErro(null);
      router.refresh();
    }
  };

  return (
    <details className="rounded-xl border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Compartilhar esta tela <span className="font-normal text-muted-foreground">· {acessos.length ? `${acessos.length} pessoa(s) além do financeiro` : "só Administrador e Financeiro veem"}</span>
      </summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">Administradores e Financeiro já veem e editam. Escolha quem mais vê o fluxo: a tela aparece no menu da pessoa.</p>
        {acessos.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {acessos.map((a) => (
              <li key={a.userId} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-medium">{a.nome}</span>
                <span className="text-xs text-muted-foreground">{papel(a.papel)}</span>
                <label className="ml-auto flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={a.podeEditar} onChange={(e) => agir(() => compartilharFluxo({ userId: a.userId, podeEditar: e.target.checked }))} />
                  pode editar
                </label>
                <button type="button" className="text-xs underline hover:text-red-700" onClick={() => agir(() => removerAcessoFluxo({ userId: a.userId }))}>
                  tirar acesso
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className="min-w-64 rounded-lg border border-input bg-background px-2 py-1.5 text-sm" aria-label="Pessoa">
            <option value="">Escolha a pessoa…</option>
            {disponiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} — {papel(p.papel)}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={editar} onChange={(e) => setEditar(e.target.checked)} />
            pode editar (digitar previsões, motivos e importar)
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!pessoa}
            onClick={() =>
              agir(async () => {
                const r = await compartilharFluxo({ userId: pessoa, podeEditar: editar });
                if (!r.erro) setPessoa("");
                return r;
              })
            }
          >
            Compartilhar
          </Button>
        </div>
        {erro && <p className="text-xs text-red-700">{erro}</p>}
      </div>
    </details>
  );
}
