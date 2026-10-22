"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { Scale } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoConciliar } from "../actions";

export type ArquivoOpcao = { id: string; nome: string; tipo: string; filial: number | null; resumo: string; enviadoEm: string };
export type Faixa = { nome: string; min: number; max: number };

type Props = {
  action: (prev: EstadoConciliar, fd: FormData) => Promise<EstadoConciliar>;
  dda: ArquivoOpcao[];
  trier: ArquivoOpcao[];
  faixas: Faixa[];
};

function Lista({ nome, itens, selecionados, aoMudar, titulo, dica }: { nome: string; itens: ArquivoOpcao[]; selecionados: Set<string>; aoMudar: (ids: Set<string>) => void; titulo: string; dica: string }) {
  const todos = () => aoMudar(new Set(itens.map((i) => i.id)));
  const nenhum = () => aoMudar(new Set());
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{dica}</p>
        </div>
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={todos} className="text-fct-tinta underline">
            todos
          </button>
          <span className="text-muted-foreground">·</span>
          <button type="button" onClick={nenhum} className="text-fct-tinta underline">
            nenhum
          </button>
        </div>
      </div>
      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum arquivo deste tipo. <Link href="/conciliacao-gi/arquivos" className="text-fct-tinta underline">Enviar</Link>.
        </p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
          {itens.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60">
                <input
                  type="checkbox"
                  name={nome}
                  value={a.id}
                  checked={selecionados.has(a.id)}
                  onChange={(e) => {
                    const n = new Set(selecionados);
                    if (e.target.checked) n.add(a.id);
                    else n.delete(a.id);
                    aoMudar(n);
                  }}
                  className="mt-0.5 size-4 accent-fct-tinta"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {a.filial != null && <span className="mr-1 font-mono text-xs text-fct-tinta">{String(a.filial).padStart(3, "0")} </span>}
                    {a.nome}
                  </span>
                  <span className="block text-xs text-muted-foreground">{a.resumo}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{selecionados.size} selecionado(s)</p>
    </section>
  );
}

export function NovaConciliacaoForm({ action, dda, trier, faixas }: Props) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const [selDda, setSelDda] = React.useState<Set<string>>(() => new Set(dda.slice(0, 1).map((a) => a.id)));
  const [selTrier, setSelTrier] = React.useState<Set<string>>(() => new Set(trier.slice(0, 1).map((a) => a.id)));
  const [min, setMin] = React.useState(String(faixas[0]?.min ?? 1));
  const [max, setMax] = React.useState(String(faixas[0]?.max ?? 999));

  return (
    <form action={formAction} className="space-y-4">
      <ErroFormulario mensagem={estado.erro} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Lista nome="dda" itens={dda} selecionados={selDda} aoMudar={setSelDda} titulo="Arquivos do banco (DDA)" dica="Vários .RET e planilhas podem entrar juntos; o último estado de cada boleto é o que vale." />
        <Lista nome="trier" itens={trier} selecionados={selTrier} aoMudar={setSelTrier} titulo="Relatórios do Trier" dica="Um por filial ou um geral. Vários relatórios são somados." />
      </div>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold">Filiais do Trier a considerar</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-2">
            {faixas.map((f) => (
              <Button
                key={f.nome}
                type="button"
                variant={String(f.min) === min && String(f.max) === max ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setMin(String(f.min));
                  setMax(String(f.max));
                }}
              >
                {f.nome} ({f.min}–{f.max})
              </Button>
            ))}
          </div>
          <Campo id="fil_min" label="De">
            <Input id="fil_min" name="fil_min" type="number" min={1} max={9999} value={min} onChange={(e) => setMin(e.target.value)} className="w-24" />
          </Campo>
          <Campo id="fil_max" label="Até">
            <Input id="fil_max" name="fil_max" type="number" min={1} max={9999} value={max} onChange={(e) => setMax(e.target.value)} className="w-24" />
          </Campo>
          <Campo id="titulo" label="Nome da conciliação (opcional)" className="min-w-64 flex-1">
            <Input id="titulo" name="titulo" maxLength={120} placeholder="Ex.: GI · outubro" />
          </Campo>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pendente || selDda.size === 0 || selTrier.size === 0}>
          <Scale data-icon="inline-start" />
          {pendente ? "Conciliando… (pode levar alguns segundos)" : "Conciliar"}
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao-gi" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
