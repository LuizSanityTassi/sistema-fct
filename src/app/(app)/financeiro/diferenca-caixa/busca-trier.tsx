"use client";

import * as React from "react";
import { useActionState } from "react";
import { Bot, Square } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoBusca } from "./actions";

type Filial = { id: string; codigo: string; nome: string };
type Params = { de: string; ate: string; filial: string; forcar: string };

/**
 * Busca no Trier: cada rodada do servidor lê as filiais que couberem em ~4 minutos; enquanto faltar filial e a
 * rodada tiver avançado, a tela pede a próxima sozinha (é só deixar a página aberta).
 */
export function BuscaTrier({ action, filiais, de, ate }: { action: (prev: EstadoBusca, fd: FormData) => Promise<EstadoBusca>; filiais: Filial[]; de: string; ate: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const params = React.useRef<Params | null>(null);
  const [parado, setParado] = React.useState(false);

  const pedir = React.useCallback(
    (p: Params, anterior: EstadoBusca | null) => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(p)) fd.set(k, v);
      if (anterior?.inicio) {
        fd.set("inicio", anterior.inicio);
        fd.set("acc_lidas", String(anterior.lidas ?? 0));
        fd.set("acc_caixas", String(anterior.caixas ?? 0));
        fd.set("acc_quebras", String(anterior.quebras ?? 0));
        fd.set("acc_erros", String(anterior.totalErros ?? 0));
      }
      React.startTransition(() => enviar(fd));
    },
    [enviar],
  );

  // continua sozinho: faltou filial e a rodada avançou (se não avançou, o Trier está fora e não adianta insistir)
  React.useEffect(() => {
    if (parado || !params.current || estado.erro || estado.fim || !estado.inicio || !(estado.rodada ?? 0)) return;
    pedir(params.current, estado);
  }, [estado, parado, pedir]);

  const rodando = pendente || (!!estado.inicio && !estado.fim && !estado.erro && !parado && (estado.rodada ?? 0) > 0);
  const feitas = (estado.total ?? 0) - (estado.faltam ?? 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const p = { de: String(fd.get("de") ?? ""), ate: String(fd.get("ate") ?? ""), filial: String(fd.get("filial") ?? ""), forcar: fd.get("forcar") ? "1" : "" };
        params.current = p;
        setParado(false);
        pedir(p, null);
      }}
      className="space-y-3"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[auto_auto_1fr_auto] lg:items-end">
        <Campo id="busca-de" label="De">
          <Input id="busca-de" name="de" type="date" defaultValue={de} required className="lg:w-40" />
        </Campo>
        <Campo id="busca-ate" label="Até">
          <Input id="busca-ate" name="ate" type="date" defaultValue={ate} required className="lg:w-40" />
        </Campo>
        <Campo id="busca-filial" label="Filial">
          <SelectNativo id="busca-filial" name="filial" defaultValue="">
            <option value="">Todas as lojas</option>
            {filiais.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <div className="flex gap-2">
          <Button type="submit" disabled={rodando} className="bg-fct-yellow font-semibold text-fct-navy hover:bg-fct-yellow/85">
            <Bot data-icon="inline-start" />
            {rodando ? "Buscando…" : "Buscar do Trier"}
          </Button>
          {rodando && (
            <Button type="button" variant="outline" onClick={() => setParado(true)}>
              <Square data-icon="inline-start" />
              Parar
            </Button>
          )}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="forcar" value="1" className="size-4 accent-fct-navy" />
        Buscar de novo as filiais que já foram lidas nesse período (para pegar correções feitas no Trier)
      </label>

      <ErroFormulario mensagem={estado.erro} />
      {estado.inicio && !estado.erro && (
        <div role="status" aria-live="polite" className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          {estado.nadaNovo ? (
            <p>Nada novo para buscar: todas as filiais desse período já foram lidas. Marque “buscar de novo” para atualizar.</p>
          ) : (
            <>
              <p className="font-medium">
                {estado.fim ? "Busca concluída" : parado ? "Busca parada" : "Buscando"}: {feitas} de {estado.total} filial(is) × dia
              </p>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-fct-navy transition-all" style={{ width: `${estado.total ? Math.round((feitas / estado.total) * 100) : 0}%` }} />
              </div>
              <p className="mt-1.5 text-muted-foreground">
                {estado.caixas ?? 0} caixa(s) lido(s), {estado.quebras ?? 0} quebra(s) acima de R$ 2,00{estado.totalErros ? `, ${estado.totalErros} erro(s)` : ""}.
                {!estado.fim && !parado && (estado.rodada ?? 0) > 0 && " Pode deixar a página aberta: continua sozinho."}
                {!estado.fim && (estado.rodada ?? 0) === 0 && " O Trier não respondeu nesta rodada; tente de novo em alguns minutos."}
              </p>
              {!!estado.erros?.length && (
                <ul className="mt-1.5 list-disc pl-5 text-xs text-red-800">
                  {estado.erros.slice(0, 5).map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </form>
  );
}
