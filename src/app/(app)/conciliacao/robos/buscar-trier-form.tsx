"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ConfigTrier } from "@/lib/conciliacao/trier-robo";
import type { EstadoTrier } from "./actions";

type Acao = (prev: EstadoTrier, fd: FormData) => Promise<EstadoTrier>;
type Props = { buscar: Acao; testar: Acao; config: ConfigTrier; configurado: boolean; podeBuscar: boolean };

export function BuscarTrierForm({ buscar, testar, config, configurado, podeBuscar }: Props) {
  const [estado, acaoBuscar, buscando] = useActionState(buscar, {});
  const [teste, acaoTestar, testando] = useActionState(testar, {});
  const bloqueado = !configurado || !podeBuscar;
  return (
    <div className="space-y-3">
      <form action={acaoBuscar} className="grid gap-3 sm:grid-cols-[auto_auto_1fr] sm:items-end">
        <Campo id="diasAntes" label="Dias para trás" dica="vencidos recentes">
          <Input id="diasAntes" name="diasAntes" type="number" min={0} max={90} defaultValue={config.diasAntes} className="w-28" />
        </Campo>
        <Campo id="diasDepois" label="Dias para a frente" dica="a vencer">
          <Input id="diasDepois" name="diasDepois" type="number" min={1} max={180} defaultValue={config.diasDepois} className="w-28" />
        </Campo>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={bloqueado || buscando || testando} className="bg-fct-yellow text-fct-tinta hover:bg-fct-yellow/85">
            <RefreshCw data-icon="inline-start" className={buscando ? "animate-spin" : ""} />
            {buscando ? "Entrando no Trier e gerando o relatório… (pode levar até 3 min)" : "Buscar do Trier agora"}
          </Button>
          <Button type="submit" variant="outline" formAction={acaoTestar} disabled={bloqueado || buscando || testando}>
            {testando ? "Testando…" : "Testar login"}
          </Button>
        </div>
      </form>
      <ErroFormulario mensagem={estado.erro ?? teste.erro} />
      {teste.ok && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="size-4" aria-hidden /> {teste.ok}
        </p>
      )}
      {estado.resultado && (
        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estado.resultado.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
          {estado.resultado.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          <div>
            <p className="font-medium">
              {estado.resultado.repetido ? "O Trier devolveu o mesmo relatório de antes (nada mudou): " : "Relatório guardado: "}
              {estado.resultado.nome}
            </p>
            <p className="text-xs">
              {estado.resultado.mensagem}
              {estado.periodo ? ` · período ${estado.periodo}` : ""}
            </p>
            {estado.resultado.ok && (
              <p className="mt-1 text-xs">
                <Link href="/conciliacao/nova" className="font-medium underline">
                  Conciliar agora
                </Link>{" "}
                ·{" "}
                <Link href="/conciliacao/arquivos?tipo=trier" className="underline">
                  ver arquivos do Trier
                </Link>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
