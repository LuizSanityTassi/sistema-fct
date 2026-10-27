"use client";

import * as React from "react";
import { useActionState } from "react";
import { Ban, CheckCircle2, MessageSquareWarning, Printer } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DECLARACAO_GERENTE } from "@/lib/coordenacao/checklist";
import type { EstadoAcao } from "../actions";

type Acao = (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

/** Resposta do gerente: confirma (ciente e de acordo, comentário opcional) ou não concorda (com o motivo). */
export function RespostaGerente({ action }: { action: Acao }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [contestando, setContestando] = React.useState(false);
  if (estado.ok) return <AvisoSucesso mensagem={estado.ok} />;
  return (
    <div className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      {!contestando ? (
        <form action={enviar} className="space-y-2">
          <input type="hidden" name="acao" value="confirmar" />
          <p className="text-sm font-medium">{DECLARACAO_GERENTE}</p>
          <p className="text-xs text-muted-foreground">Ao confirmar, você declara que recebeu esta avaliação, os indicadores, os direcionamentos e o que ficou acordado.</p>
          <Input name="nota" maxLength={1000} placeholder="Comentário (opcional)" />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pendente}>
              <CheckCircle2 data-icon="inline-start" />
              {pendente ? "Gravando…" : "Confirmo e estou de acordo"}
            </Button>
            <Button type="button" variant="ghost" className="text-red-700" onClick={() => setContestando(true)}>
              <MessageSquareWarning data-icon="inline-start" />
              Não concordo
            </Button>
          </div>
        </form>
      ) : (
        <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <input type="hidden" name="acao" value="contestar" />
          <label htmlFor="motivo-contestar" className="text-sm font-medium">
            Com o que você não concorda?
          </label>
          <Input id="motivo-contestar" name="nota" maxLength={1000} required minLength={5} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
              {pendente ? "Gravando…" : "Enviar ao coordenador"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setContestando(false)}>
              Voltar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Quem fez cancela (antes da resposta do gerente), com motivo. */
export function CancelarChecklist({ action }: { action: Acao }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [aberto, setAberto] = React.useState(false);
  if (estado.ok) return <AvisoSucesso mensagem={estado.ok} />;
  return (
    <div className="space-y-2">
      <ErroFormulario mensagem={estado.erro} />
      {!aberto ? (
        <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => setAberto(true)}>
          <Ban data-icon="inline-start" />
          Cancelar checklist
        </Button>
      ) : (
        <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <input type="hidden" name="acao" value="cancelar" />
          <label htmlFor="motivo-cancelar" className="text-sm font-medium">
            Por que cancelar? <span className="font-normal text-muted-foreground">(ex.: gerente errado, nota errada)</span>
          </label>
          <Input id="motivo-cancelar" name="nota" maxLength={500} required minLength={5} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
              {pendente ? "Cancelando…" : "Cancelar o checklist"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
              Voltar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer data-icon="inline-start" />
      Imprimir
    </Button>
  );
}
