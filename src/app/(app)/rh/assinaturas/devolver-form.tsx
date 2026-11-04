"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import { AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Input } from "@/components/ui/input";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import type { EstadoArquivo } from "../documentos/actions";

type Props = { action: (prev: EstadoArquivo, fd: FormData) => Promise<EstadoArquivo>; nome: string };

/** Depois que o funcionário assina: envia o arquivo assinado (PDF ou foto). */
export function DevolverForm({ action, nome }: Props) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-2">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input name="arquivo" type="file" accept={ACCEPT_ARQUIVO} required aria-label={`Documento assinado: ${nome}`} className="w-full sm:w-64" />
        <BotaoSalvar rotuloPendente="Enviando…">
          <Upload data-icon="inline-start" /> Devolver assinado
        </BotaoSalvar>
      </div>
    </form>
  );
}
