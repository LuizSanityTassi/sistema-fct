"use client";

import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Input } from "@/components/ui/input";
import type { EstadoPonto } from "@/lib/ponto/form";

export const ID_FORM_LOTE = "lote-jornada";

type Props = {
  action: (prev: EstadoPonto, fd: FormData) => Promise<EstadoPonto>;
  jornadas: { id: string; nome: string; filial: string | null }[];
  hoje: string;
};

/** Barra "aplicar jornada aos marcados" (as caixas da tabela usam form="lote-jornada"). */
export function LoteJornadaForm({ action, jornadas, hoje }: Props) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form id={ID_FORM_LOTE} action={formAction} className="space-y-2 border-t bg-muted/30 px-5 py-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="grid gap-2 sm:grid-cols-[auto_minmax(12rem,20rem)_10rem_auto] sm:items-center">
        <p className="text-sm font-medium">Aplicar aos marcados:</p>
        <SelectNativo name="jornada_id" defaultValue="" aria-label="Jornada" required>
          <option value="" disabled>
            Escolha a jornada…
          </option>
          {jornadas.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nome}
              {j.filial ? ` (só ${j.filial})` : ""}
            </option>
          ))}
        </SelectNativo>
        <Input type="date" name="inicio" defaultValue={hoje} aria-label="A partir de" title="A partir de" className="h-9" />
        <BotaoSalvar variant="outline" rotuloPendente="Aplicando…">
          Aplicar jornada
        </BotaoSalvar>
      </div>
      <p className="text-xs text-muted-foreground">A jornada anterior termina na véspera; o histórico fica guardado. Datas no passado recalculam os dias dos meses ainda abertos.</p>
    </form>
  );
}

/** Caixa "marcar todos" do cabeçalho da tabela. */
export function MarcarTodos() {
  return (
    <input
      type="checkbox"
      aria-label="Marcar todos"
      className="size-4 accent-fct-tinta"
      onChange={(e) => {
        document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name=ids][form=${ID_FORM_LOTE}]`).forEach((c) => (c.checked = e.target.checked));
      }}
    />
  );
}
