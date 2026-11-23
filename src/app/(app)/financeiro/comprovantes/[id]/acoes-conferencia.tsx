"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, RotateCcw, TriangleAlert } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAcao } from "../../../comprovantes/actions";

type Acao = (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

/**
 * Conferido (observação opcional) · Com problema (o que a loja precisa corrigir) · Desfazer. Conferido ou com problema,
 * segue para o próximo da fila (se houver), para conferir em sequência sem voltar à lista.
 */
export function AcoesConferencia({ action, conferencia, temAnexo, proximo }: { action: Acao; conferencia: string; temAnexo: boolean; proximo: string | null }) {
  const router = useRouter();
  const [modo, setModo] = React.useState<"conferir" | "problema">("conferir");
  const [seguir, setSeguir] = React.useState(true);
  const [estado, enviar, pendente] = useActionState(async (prev: EstadoAcao, fd: FormData) => {
    const r = await action(prev, fd);
    const acao = fd.get("acao");
    if (!r.erro && acao !== "desfazer" && seguir && proximo) router.push(`/financeiro/comprovantes/${proximo}`);
    return r;
  }, {});

  if (conferencia !== "pendente") {
    return (
      <div className="space-y-2">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
        <form action={enviar}>
          <input type="hidden" name="acao" value="desfazer" />
          <Button type="submit" variant="outline" size="sm" disabled={pendente}>
            <RotateCcw data-icon="inline-start" />
            {pendente ? "Desfazendo…" : "Desfazer conferência"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {!temAnexo && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />A loja não anexou o comprovante: aponte o problema para ela enviar.
        </p>
      )}
      <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm" role="tablist" aria-label="Resultado da conferência">
        <button type="button" role="tab" aria-selected={modo === "conferir"} onClick={() => setModo("conferir")} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${modo === "conferir" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>
          Está certo
        </button>
        <button type="button" role="tab" aria-selected={modo === "problema"} onClick={() => setModo("problema")} className={`flex-1 rounded-md px-3 py-1.5 font-medium ${modo === "problema" ? "bg-card text-red-800 shadow-sm" : "text-muted-foreground"}`}>
          Tem problema
        </button>
      </div>
      {modo === "conferir" ? (
        <form action={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="acao" value="conferir" />
          <label className="grid flex-1 gap-1 text-sm">
            <span className="font-medium">Observação (opcional)</span>
            <Input name="nota" maxLength={500} placeholder="Ex.: conferido com o cupom" />
          </label>
          <Button type="submit" disabled={pendente || !temAnexo}>
            <CheckCircle2 data-icon="inline-start" />
            {pendente ? "Gravando…" : "Conferido"}
          </Button>
        </form>
      ) : (
        <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <input type="hidden" name="acao" value="problema" />
          <label className="grid gap-1 text-sm">
            <span className="font-medium">O que a loja precisa corrigir?</span>
            <Input name="nota" maxLength={500} required minLength={5} placeholder="Ex.: falta a assinatura do cliente; valor diferente do cupom" autoFocus />
          </label>
          <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
            {pendente ? "Gravando…" : "Apontar problema para a loja"}
          </Button>
        </form>
      )}
      {proximo && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={seguir} onChange={(e) => setSeguir(e.target.checked)} className="size-3.5" />
          Depois de gravar, abrir o próximo a conferir
        </label>
      )}
    </div>
  );
}
