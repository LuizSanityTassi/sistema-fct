"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import { CATEGORIA_DOC_LABEL } from "@/lib/rh/rotulos";
import type { EstadoArquivo } from "../../documentos/actions";

type Props = { action: (prev: EstadoArquivo, fd: FormData) => Promise<EstadoArquivo> };

export function DocumentoForm({ action }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];

  return (
    <details className="group rounded-lg border border-dashed">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">Enviar documento</summary>
      <form action={formAction} noValidate className="space-y-4 border-t p-4">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="doc-arquivo" label="Arquivo" obrigatorio erro={erro("arquivo")} dica="PDF, JPG, PNG ou WebP · até 20 MB">
            <Input id="doc-arquivo" name="arquivo" type="file" accept={ACCEPT_ARQUIVO} aria-invalid={!!erro("arquivo")} />
          </Campo>
          <Campo id="doc-categoria" label="Categoria" obrigatorio erro={erro("categoria")}>
            <SelectNativo id="doc-categoria" name="categoria" defaultValue="documento_pessoal" aria-invalid={!!erro("categoria")}>
              {Object.entries(CATEGORIA_DOC_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="doc-nome" label="Nome do documento" erro={erro("nome")} dica="Se vazio, usa o nome do arquivo">
            <Input id="doc-nome" name="nome" maxLength={120} />
          </Campo>
          <Campo id="doc-data" label="Data do documento" erro={erro("data_documento")}>
            <Input id="doc-data" name="data_documento" type="date" aria-invalid={!!erro("data_documento")} />
          </Campo>
          <Campo id="doc-descricao" label="Descrição" erro={erro("descricao")} className="sm:col-span-2">
            <Input id="doc-descricao" name="descricao" maxLength={500} />
          </Campo>
        </div>
        <BotaoSalvar rotuloPendente="Enviando…">Enviar</BotaoSalvar>
      </form>
    </details>
  );
}
