"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Play } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { ResultadoAutomatica } from "@/lib/conciliacao/automatica";
import type { EstadoAutomatica } from "./actions";

type Props = { rodar: (prev: EstadoAutomatica, fd: FormData) => Promise<EstadoAutomatica>; ultima: ResultadoAutomatica | null; podeRodar: boolean };

const quando = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const pct = (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Rodada({ r }: { r: ResultadoAutomatica }) {
  const tom = r.erro ? "border-red-200 bg-red-50 text-red-900" : r.pulado ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm ${tom}`}>
      <p className="font-medium">
        {quando(r.quando)} · {r.manual ? "rodada à mão" : "rodada automática"} · {r.dda} retorno(s) do banco
        {r.trier ? ` · Trier ${r.trier.periodo}` : ""}
      </p>
      {r.erro && <p className="text-xs">{r.erro}</p>}
      {r.pulado && <p className="text-xs">{r.pulado}</p>}
      {r.faixas.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs">
          {r.faixas.map((f) => (
            <li key={f.faixa}>
              <span className="font-medium">{f.faixa}:</span>{" "}
              {f.id ? (
                <>
                  <Link href={`/conciliacao/${f.id}`} className="underline">
                    {pct(f.pctBateu ?? 0)} bateu
                  </Link>
                  {` · ${f.novas ?? 0} pendência(s) nova(s) · ${f.resolvidas ?? 0} resolvida(s) sozinha(s)`}
                </>
              ) : (
                <span className={f.erro ? "text-red-800" : "opacity-80"}>{f.erro ?? f.semDados}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AutomaticaPainel({ rodar, ultima, podeRodar }: Props) {
  const [estado, acao, rodando] = useActionState(rodar, {});
  const mostrar = estado.resultado ?? ultima;
  return (
    <div className="space-y-3">
      <form action={acao}>
        <Button type="submit" disabled={!podeRodar || rodando}>
          <Play data-icon="inline-start" className={rodando ? "animate-pulse" : ""} />
          {rodando ? "Buscando o Trier e conciliando… (pode levar até 4 min)" : "Rodar agora"}
        </Button>
      </form>
      <ErroFormulario mensagem={estado.erro} />
      {mostrar ? <Rodada r={mostrar} /> : <p className="text-sm text-muted-foreground">Ainda não rodou nenhuma vez.</p>}
    </div>
  );
}
