"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed } from "lucide-react";

export type ItemAutomatico = {
  id: string;
  rotulo: string;
  feito: boolean;
  detalhe?: string;
  href?: string;
  acao?: string;
};
export type ItemManual = {
  item: string;
  rotulo: string;
  feito: boolean;
  quem?: string | null;
  quando?: string | null;
  detalhe?: string;
  href?: string;
  acao?: string;
};

/**
 * Checklist do desligamento: o sistema confere sozinho o que dá (usuário bloqueado, quebras em aberto) e o RH marca
 * o resto. Cada marcação fica com quem marcou e quando.
 */
export function ChecklistDesligamento({
  automaticos,
  manuais,
  marcar,
  podeMarcar,
}: {
  automaticos: ItemAutomatico[];
  manuais: ItemManual[];
  marcar: (item: string, feito: boolean) => Promise<{ erro?: string }>;
  podeMarcar: boolean;
}) {
  const [pendente, iniciar] = React.useTransition();
  const [erro, setErro] = React.useState<string | null>(null);
  const total = automaticos.length + manuais.length;
  const feitos = automaticos.filter((a) => a.feito).length + manuais.filter((m) => m.feito).length;

  const linha = (
    chave: string,
    {
      feito,
      rotulo,
      detalhe,
      href,
      acao,
      controle,
    }: {
      feito: boolean;
      rotulo: string;
      detalhe?: string;
      href?: string;
      acao?: string;
      controle?: React.ReactNode;
    },
  ) => (
    <li key={chave} className="flex items-start gap-3 py-2">
      {controle ??
        (feito ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="feito" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-amber-600" aria-label="pendente" />)}
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${feito ? "text-muted-foreground line-through decoration-muted-foreground/40" : "font-medium"}`}>{rotulo}</span>
        {detalhe && <span className="block text-xs text-muted-foreground">{detalhe}</span>}
      </span>
      {href && !feito && (
        <Link href={href} className="shrink-0 text-xs font-medium text-fct-tinta underline">
          {acao ?? "Abrir"}
        </Link>
      )}
    </li>
  );

  return (
    <section aria-labelledby="t-desligamento" className="mb-4 rounded-xl border border-amber-300 bg-card p-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="t-desligamento" className="text-sm font-semibold">
          Checklist do desligamento
        </h2>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs font-medium ${feitos === total ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {feitos} de {total} feitos
        </span>
      </div>
      {erro && <p className="mb-2 text-xs text-red-700">{erro}</p>}
      <ul className="divide-y">
        {automaticos.map((a) =>
          linha(a.id, {
            feito: a.feito,
            rotulo: a.rotulo,
            detalhe: a.detalhe ? `${a.detalhe} (conferido pelo sistema)` : "Conferido pelo sistema",
            href: a.href,
            acao: a.acao,
          }),
        )}
        {manuais.map((m) =>
          linha(m.item, {
            feito: m.feito,
            rotulo: m.rotulo,
            detalhe: m.feito && m.quem ? `Marcado por ${m.quem}${m.quando ? ` em ${m.quando}` : ""}` : m.detalhe,
            href: m.href,
            acao: m.acao,
            controle: (
              <input
                type="checkbox"
                checked={m.feito}
                disabled={!podeMarcar || pendente}
                aria-label={m.rotulo}
                onChange={(e) => {
                  const feito = e.target.checked;
                  setErro(null);
                  iniciar(async () => {
                    const r = await marcar(m.item, feito);
                    if (r.erro) setErro(r.erro);
                  });
                }}
                className="mt-0.5 size-5 shrink-0 accent-emerald-600"
              />
            ),
          }),
        )}
      </ul>
    </section>
  );
}
