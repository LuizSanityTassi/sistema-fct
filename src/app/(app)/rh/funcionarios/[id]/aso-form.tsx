"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import { ACCEPT_ARQUIVO } from "@/lib/rh/arquivos";
import { ASO_TIPO_LABEL } from "@/lib/rh/rotulos";
import type { EstadoArquivo } from "../../documentos/actions";

type Props = { action: (prev: EstadoArquivo, fd: FormData) => Promise<EstadoArquivo> };

export function AsoForm({ action }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];

  return (
    <details className="group rounded-lg border border-dashed">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium select-none">Registrar ASO</summary>
      <form action={formAction} noValidate className="space-y-4 border-t p-4">
        <ErroFormulario mensagem={estado.erro} />
        <AvisoSucesso mensagem={estado.ok} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="aso-tipo" label="Tipo de exame" obrigatorio erro={erro("tipo")}>
            <SelectNativo id="aso-tipo" name="tipo" defaultValue="periodico" aria-invalid={!!erro("tipo")}>
              {Object.entries(ASO_TIPO_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="aso-arquivo" label="Laudo (opcional)" erro={erro("arquivo")} dica="PDF, JPG, PNG ou WebP · até 20 MB">
            <Input id="aso-arquivo" name="arquivo" type="file" accept={ACCEPT_ARQUIVO} aria-invalid={!!erro("arquivo")} />
          </Campo>
          <Campo id="aso-realizacao" label="Data do exame" obrigatorio erro={erro("data_realizacao")}>
            <Input id="aso-realizacao" name="data_realizacao" type="date" aria-invalid={!!erro("data_realizacao")} />
          </Campo>
          <Campo id="aso-validade" label="Válido até" erro={erro("data_validade")} dica="O sistema avisa 30 dias antes de vencer">
            <Input id="aso-validade" name="data_validade" type="date" aria-invalid={!!erro("data_validade")} />
          </Campo>
          <Campo id="aso-obs" label="Observações" erro={erro("observacoes")} className="sm:col-span-2">
            <Input id="aso-obs" name="observacoes" maxLength={500} />
          </Campo>
        </div>
        <BotaoSalvar rotuloPendente="Salvando…">Registrar</BotaoSalvar>
      </form>
    </details>
  );
}
