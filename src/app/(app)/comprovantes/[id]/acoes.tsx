"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useActionState } from "react";
import { Ban, Upload } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EscolherComprovantes } from "../../sangrias/comprovantes";
import { registrarAnexos, type EstadoAcao } from "../actions";
import { enviarAnexos } from "../anexos";

/** Cancelar com motivo (quem cadastrou ou o financeiro). */
export function CancelarComprovante({ action }: { action: (prev: EstadoAcao, fd: FormData) => Promise<EstadoAcao> }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [aberto, setAberto] = React.useState(false);
  const idMotivo = React.useId();

  return (
    <div className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {!aberto ? (
        <Button type="button" variant="ghost" size="sm" className="text-red-700" onClick={() => setAberto(true)}>
          <Ban data-icon="inline-start" />
          Cancelar comprovante
        </Button>
      ) : (
        <form action={enviar} className="space-y-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
          <label htmlFor={idMotivo} className="text-sm font-medium">
            Por que cancelar? <span className="font-normal text-muted-foreground">(ex.: valor errado, cadastrei duas vezes)</span>
          </label>
          <Input id={idMotivo} name="motivo" maxLength={500} required minLength={5} autoFocus />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" size="sm" disabled={pendente}>
              {pendente ? "Cancelando…" : "Cancelar o comprovante"}
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

/** Anexar mais arquivos (enquanto o comprovante está ativo). */
export function AnexarArquivos({ id }: { id: string }) {
  const router = useRouter();
  const [arquivos, setArquivos] = React.useState<File[]>([]);
  const [enviando, setEnviando] = React.useState(false);
  const [msg, setMsg] = React.useState<EstadoAcao>({});

  const enviar = async () => {
    setMsg({});
    setEnviando(true);
    const envio = await enviarAnexos(id, arquivos);
    const r = envio.erro ? { erro: envio.erro } : await registrarAnexos(id, envio.enviados);
    setEnviando(false);
    setMsg(r);
    if (!r.erro) {
      setArquivos([]);
      router.refresh();
    }
  };

  return (
    <div className="space-y-2">
      <EscolherComprovantes arquivos={arquivos} onChange={setArquivos} desabilitado={enviando} idBase={`comprovante-${id}`} />
      {arquivos.length > 0 && (
        <Button type="button" size="sm" onClick={() => void enviar()} disabled={enviando}>
          <Upload data-icon="inline-start" />
          {enviando ? "Enviando…" : `Enviar ${arquivos.length === 1 ? "arquivo" : `${arquivos.length} arquivos`}`}
        </Button>
      )}
      <ErroFormulario mensagem={msg.erro} />
      <AvisoSucesso mensagem={msg.ok} />
    </div>
  );
}
