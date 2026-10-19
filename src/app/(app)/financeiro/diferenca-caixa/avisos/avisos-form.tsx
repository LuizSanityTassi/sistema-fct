"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, MailCheck, Power, Send } from "lucide-react";
import { ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoAvisos } from "./actions";

type Acao = (prev: EstadoAvisos, fd: FormData) => Promise<EstadoAvisos>;

function Sucesso({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {msg}
    </p>
  );
}

/** "Enviar um teste para mim" e "Enviar agora para todos" (este pede confirmação antes). */
export function EnvioAvisos({ teste, todos, destinatarios, podeEnviar }: { teste: Acao; todos: Acao; destinatarios: number; podeEnviar: boolean }) {
  const [estTeste, acaoTeste, enviandoTeste] = useActionState(teste, {});
  const [confirmar, setConfirmar] = React.useState(false);
  // a confirmação fecha só quando o envio termina (fechar no submit desmontaria o formulário no meio)
  const [estTodos, acaoTodos, enviandoTodos] = useActionState(async (prev: EstadoAvisos, fd: FormData) => {
    const r = await todos(prev, fd);
    setConfirmar(false);
    return r;
  }, {});
  const ocupado = enviandoTeste || enviandoTodos;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={acaoTeste}>
          <Button type="submit" variant="outline" size="sm" disabled={!podeEnviar || ocupado}>
            <MailCheck data-icon="inline-start" />
            {enviandoTeste ? "Enviando teste…" : "Enviar um teste para mim"}
          </Button>
        </form>
        {!confirmar ? (
          <Button type="button" size="sm" disabled={!podeEnviar || ocupado || destinatarios === 0} onClick={() => setConfirmar(true)}>
            <Send data-icon="inline-start" />
            Enviar agora para todos
          </Button>
        ) : (
          <form action={acaoTodos} className="flex flex-wrap items-center gap-2 rounded-lg border bg-superficie px-3 py-1.5 text-sm">
            <span>
              Mandar o aviso agora para {destinatarios} {destinatarios === 1 ? "pessoa" : "pessoas"}?
            </span>
            <Button type="submit" size="sm" disabled={ocupado}>
              {enviandoTodos ? "Enviando…" : "Sim, enviar"}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={enviandoTodos} onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
          </form>
        )}
      </div>
      <ErroFormulario mensagem={estTeste.erro ?? estTodos.erro} />
      <Sucesso msg={estTeste.ok ?? estTodos.ok} />
    </div>
  );
}

/** Liga/desliga o envio automático da manhã. */
export function AlternarAvisos({ action, ligado }: { action: Acao; ligado: boolean }) {
  const [estado, formAction, pendente] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="ligar" value={ligado ? "0" : "1"} />
      <Button type="submit" variant={ligado ? "outline" : "default"} size="sm" disabled={pendente}>
        <Power data-icon="inline-start" />
        {pendente ? "Gravando…" : ligado ? "Desligar envio automático" : "Ligar envio automático"}
      </Button>
      <ErroFormulario mensagem={estado.erro} />
    </form>
  );
}
