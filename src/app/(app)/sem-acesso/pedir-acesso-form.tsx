"use client";

import { useActionState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoPedido } from "./actions";

export function PedirAcessoForm({ action, rota, tela }: { action: (prev: EstadoPedido, fd: FormData) => Promise<EstadoPedido>; rota: string; tela: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  if (estado.ok) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {estado.ok}
      </p>
    );
  }
  return (
    <form action={enviar} className="space-y-3 text-left">
      <input type="hidden" name="rota" value={rota} />
      <Campo id="motivo-acesso" label={`Para que você precisa de ${tela === "esta tela" ? "acesso" : tela}?`} dica="Opcional, mas ajuda o administrador a decidir mais rápido.">
        <textarea
          id="motivo-acesso"
          name="motivo"
          rows={3}
          maxLength={1000}
          placeholder="Ex.: vou cobrir a gerência da F108 nas férias do Carlos."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Campo>
      <ErroFormulario mensagem={estado.erro} />
      <Button type="submit" disabled={pendente} className="w-full sm:w-auto">
        <Send data-icon="inline-start" />
        {pendente ? "Enviando…" : "Solicitar acesso"}
      </Button>
    </form>
  );
}
