"use client";

import * as React from "react";
import { useActionState } from "react";
import { BookOpenCheck, RefreshCw } from "lucide-react";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoBuscaVendas, EstadoReler } from "./actions";

type Props = {
  action: (prev: EstadoBuscaVendas, fd: FormData) => Promise<EstadoBuscaVendas>;
  ontem: string;
  inicioHistorico: string;
  relatorios: { chave: string; rotulo: string }[];
  configurado: boolean;
};

export function BuscarVendasForm({ action, ontem, inicioHistorico, relatorios, configurado }: Props) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const form = React.useRef<HTMLFormElement>(null);
  const [parar, setParar] = React.useState(false);
  const deRef = React.useRef<HTMLInputElement>(null);
  // a rodada acabou com pedidos faltando: manda de novo sozinha (cada rodada faz o que cabe em ~4,5 min)
  React.useEffect(() => {
    if (!pendente && !parar && (estado.restantes ?? 0) > 0) form.current?.requestSubmit();
  }, [estado, pendente, parar]);
  const continuando = (estado.restantes ?? 0) > 0 && !parar;
  return (
    <form ref={form} action={formAction} onSubmit={() => setParar(false)} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo id="vendas-de" label="De">
          <Input ref={deRef} id="vendas-de" name="de" type="date" defaultValue={ontem} min={inicioHistorico} max={ontem} className="w-44" />
        </Campo>
        <Campo id="vendas-ate" label="Até">
          <Input id="vendas-ate" name="ate" type="date" defaultValue={ontem} max={ontem} className="w-44" />
        </Campo>
        <Button type="submit" disabled={!configurado || pendente}>
          <RefreshCw data-icon="inline-start" className={pendente ? "animate-spin" : ""} />
          {pendente ? `Buscando no Trier…${estado.rodada ? ` (rodada ${estado.rodada + 1})` : ""}` : "Buscar do Trier agora"}
        </Button>
        {continuando && (
          <Button type="button" variant="outline" onClick={() => setParar(true)}>
            Parar depois desta rodada
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => deRef.current && (deRef.current.value = inicioHistorico)} disabled={pendente}>
          Desde {inicioHistorico.split("-").reverse().join("/")}
        </Button>
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">Relatórios</legend>
        {relatorios.map((r) => (
          <label key={r.chave} className="flex items-center gap-1.5">
            <input type="checkbox" name="relatorio" value={r.chave} defaultChecked className="size-4 accent-primary" />
            {r.rotulo}
          </label>
        ))}
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" name="forcar" value="1" className="size-4 accent-primary" />
          buscar de novo o que já foi buscado
        </label>
      </fieldset>
      <p className="text-xs text-muted-foreground">Cada rodada faz o que couber em uns 4 minutos e a próxima começa sozinha (deixe esta tela aberta). Um dia com todos os relatórios leva uns 10 segundos.</p>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {estado.avisos?.map((a) => (
        <AvisoAtencao key={a} mensagem={a} />
      ))}
    </form>
  );
}

export function RelerVendasForm({ action }: { action: (prev: EstadoReler, fd: FormData) => Promise<EstadoReler> }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline" disabled={pendente}>
          <BookOpenCheck data-icon="inline-start" />
          {pendente ? "Lendo…" : "Ler o que ficou sem ler"}
        </Button>
        <Button type="submit" name="todas" value="1" variant="ghost" disabled={pendente}>
          Ler tudo de novo
        </Button>
      </div>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {estado.avisos?.map((a) => (
        <AvisoAtencao key={a} mensagem={a} />
      ))}
    </form>
  );
}
