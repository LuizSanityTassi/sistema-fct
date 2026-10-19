"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { Ban, CheckCircle2, RotateCcw, Upload } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoAcao } from "../actions";
import { registrarComprovantes } from "../actions";
import { enviarComprovantes, EscolherComprovantes } from "../comprovantes";

type Acao = (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao>;

/** Conferir / desfazer (financeiro) e cancelar com motivo (quem cadastrou, antes da conferência, ou o financeiro). */
export function AcoesSangria({ action, situacao, podeConferir, podeCancelar }: { action: Acao; situacao: string; podeConferir: boolean; podeCancelar: boolean }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [cancelando, setCancelando] = React.useState(false);
  const idNota = React.useId();

  return (
    <div className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {situacao === "pendente" && podeConferir && !cancelando && (
        <form action={enviar} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <input type="hidden" name="acao" value="conferir" />
          <label className="grid flex-1 gap-1 text-sm">
            <span className="font-medium">Observação da conferência (opcional)</span>
            <Input name="nota" maxLength={500} placeholder="Ex.: bateu com o extrato de 20/10" />
          </label>
          <Button type="submit" disabled={pendente}>
            <CheckCircle2 data-icon="inline-start" />
            {pendente ? "Gravando…" : "Conferida"}
          </Button>
        </form>
      )}
      {situacao === "conferida" && podeConferir && (
        <form action={enviar}>
          <input type="hidden" name="acao" value="desfazer" />
          <Button type="submit" variant="outline" size="sm" disabled={pendente}>
            <RotateCcw data-icon="inline-start" />
            Desfazer conferência
          </Button>
        </form>
      )}
      {situacao !== "cancelada" && podeCancelar && (
        <>
          {!cancelando ? (
            <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => setCancelando(true)}>
              <Ban data-icon="inline-start" />
              Cancelar cadastro
            </Button>
          ) : (
            <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
              <input type="hidden" name="acao" value="cancelar" />
              <label htmlFor={idNota} className="text-sm font-medium">
                Por que cancelar? <span className="font-normal text-muted-foreground">(ex.: valor errado, cadastrei duas vezes)</span>
              </label>
              <Input id={idNota} name="nota" maxLength={500} required minLength={5} autoFocus />
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
                  {pendente ? "Cancelando…" : "Cancelar a sangria"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setCancelando(false)}>
                  Voltar
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/** Anexar mais comprovantes (enquanto está a conferir). */
export function AnexarComprovante({ id }: { id: string }) {
  const router = useRouter();
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [enviando, setEnviando] = React.useState(false);
  const [msg, setMsg] = React.useState<EstadoAcao>({});

  const enviar = async () => {
    setMsg({});
    setEnviando(true);
    const envio = await enviarComprovantes(id, arquivos);
    const r = envio.erro ? { erro: envio.erro } : await registrarComprovantes(id, envio.enviados);
    setEnviando(false);
    setMsg(r);
    if (!r.erro) {
      setArquivos([]);
      router.refresh();
    }
  };

  return (
    <div className="space-y-2">
      <EscolherComprovantes arquivos={arquivos} onChange={setArquivos} desabilitado={enviando} idBase={`sangria-${id}`} />
      {arquivos.length > 0 && (
        <Button type="button" size="sm" onClick={() => void enviar()} disabled={enviando}>
          <Upload data-icon="inline-start" />
          {enviando ? "Enviando…" : `Enviar ${arquivos.length === 1 ? "comprovante" : `${arquivos.length} comprovantes`}`}
        </Button>
      )}
      <ErroFormulario mensagem={msg.erro} />
      <AvisoSucesso mensagem={msg.ok} />
    </div>
  );
}
