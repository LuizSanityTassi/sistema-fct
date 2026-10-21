"use client";

import { useActionState } from "react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoQuebraFolha } from "./actions";

/** Interruptor: a quebra do app vai (ou não) para os Lançamentos da folha. Desligado, as quebras ficam só aqui. */
export function QuebraNaFolha({ ligado, action }: { ligado: boolean; action: (prev: EstadoQuebraFolha, fd: FormData) => Promise<EstadoQuebraFolha> }) {
  const [estado, enviar, enviando] = useActionState(action, {});
  return (
    <section
      className={`mb-4 rounded-xl border px-4 py-3 text-sm ${ligado ? "bg-card" : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"}`}
    >
      <form
        action={enviar}
        onSubmit={(e) => {
          const msg = ligado
            ? "Desligar? As quebras do app saem dos Lançamentos da folha (os lançamentos do RH ficam)."
            : "Ligar? As quebras do app (não abonadas) voltam para os Lançamentos da folha agora.";
          if (!window.confirm(msg)) e.preventDefault();
        }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
        <p>
          <span className="font-semibold">Quebra na folha: {ligado ? "ligada" : "desligada"}.</span>{" "}
          {ligado
            ? "As quebras acima da tolerância entram sozinhas no desconto “Quebra de caixa” dos Lançamentos da folha."
            : "As quebras ficam só aqui para acompanhar (justificativa e decisão); não vão para os Lançamentos da folha. Ao ligar, a folha é recalculada com elas."}
        </p>
        <Button type="submit" size="sm" variant={ligado ? "outline" : "default"} disabled={enviando}>
          {enviando ? "Aguarde…" : ligado ? "Desligar" : "Ligar"}
        </Button>
      </form>
      {(estado.erro || estado.ok) && (
        <div className="mt-2">
          <ErroFormulario mensagem={estado.erro} />
          <AvisoSucesso mensagem={estado.ok} />
        </div>
      )}
    </section>
  );
}
