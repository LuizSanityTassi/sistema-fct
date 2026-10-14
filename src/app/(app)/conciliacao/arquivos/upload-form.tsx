"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert, Upload } from "lucide-react";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoUpload } from "../actions";

type Props = { action: (prev: EstadoUpload, fd: FormData) => Promise<EstadoUpload> };

export function UploadForm({ action }: Props) {
  const [estado, formAction, pendente] = useActionState(action, {});
  const [qtd, setQtd] = React.useState(0);
  const formRef = React.useRef<HTMLFormElement>(null);

  // envia e já limpa a seleção (o FormData foi capturado no submit; os resultados aparecem abaixo)
  const enviar = (fd: FormData) => {
    formAction(fd);
    formRef.current?.reset();
    setQtd(0);
  };

  return (
    <form ref={formRef} action={enviar} className="rounded-xl border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold">Enviar arquivos</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Aceita vários de uma vez: <strong>.RET</strong> do Itaú (DDA), planilha <strong>“Boletos Recebidos”</strong> do portal Itaú (.xlsx, com o número da filial no nome, ex.: “out 421.xlsx”) e o relatório do Trier
        <strong> “Contas a Pagar ou Pagas”</strong> (PDF ou Excel, detalhado). O tipo é reconhecido pelo conteúdo. Arquivo repetido não duplica.
      </p>
      <ErroFormulario mensagem={estado.erro} />
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Campo id="arquivos" label="Arquivos" obrigatorio>
          <input
            id="arquivos"
            name="arquivos"
            type="file"
            multiple
            accept=".ret,.RET,.txt,.pdf,.xlsx,.xls"
            onChange={(e) => setQtd(e.target.files?.length ?? 0)}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-fct-navy file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-fct-navy/90"
          />
        </Campo>
        <Campo id="tipo" label="Tipo" dica="Automático reconhece pelo conteúdo">
          <SelectNativo id="tipo" name="tipo" defaultValue="auto" className="sm:w-56">
            <option value="auto">Automático</option>
            <option value="dda_ret">DDA Itaú (.RET)</option>
            <option value="dda_planilha">Planilha do portal Itaú</option>
            <option value="trier">Relatório do Trier</option>
          </SelectNativo>
        </Campo>
        <Button type="submit" disabled={pendente || qtd === 0} className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85">
          <Upload data-icon="inline-start" />
          {pendente ? "Lendo e guardando…" : qtd > 0 ? `Enviar ${qtd} arquivo(s)` : "Enviar"}
        </Button>
      </div>

      {estado.resultados && (
        <ul className="mt-4 divide-y rounded-lg border text-sm">
          {estado.resultados.map((r, i) => (
            <li key={`${r.nome}-${i}`} className="flex items-start gap-2 px-3 py-2">
              {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />}
              <div className="min-w-0">
                <p className="truncate font-medium">{r.nome}</p>
                <p className={r.ok ? "text-xs text-muted-foreground" : "text-xs text-red-700"}>
                  {r.repetido ? "Repetido: " : ""}
                  {r.mensagem}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
