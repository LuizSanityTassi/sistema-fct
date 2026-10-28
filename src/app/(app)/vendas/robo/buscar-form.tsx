"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { AvisoAtencao, AvisoSucesso, Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoBuscaVendas } from "./actions";

type Props = { action: (prev: EstadoBuscaVendas, fd: FormData) => Promise<EstadoBuscaVendas>; ontem: string; relatorios: { chave: string; rotulo: string }[]; configurado: boolean };

export function BuscarVendasForm({ action, ontem, relatorios, configurado }: Props) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Campo id="vendas-de" label="De">
          <Input id="vendas-de" name="de" type="date" defaultValue={ontem} max={ontem} className="w-44" />
        </Campo>
        <Campo id="vendas-ate" label="Até">
          <Input id="vendas-ate" name="ate" type="date" defaultValue={ontem} className="w-44" />
        </Campo>
        <Button type="submit" disabled={!configurado || pendente}>
          <RefreshCw data-icon="inline-start" className={pendente ? "animate-spin" : ""} />
          {pendente ? "Gerando os relatórios no Trier… (até 5 min)" : "Buscar do Trier agora"}
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
      </fieldset>
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {estado.avisos?.map((a) => (
        <AvisoAtencao key={a} mensagem={a} />
      ))}
    </form>
  );
}
