"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";
import { AvisoSucesso, Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoManual } from "../actions";

export type GrupoColaboradores = { loja: string; opcoes: { id: string; rotulo: string; branchId: string }[] };
type Loja = { id: string; codigo: string; nome: string };

export function QuebraManualForm({ action, grupos, lojas, hoje }: { action: (prev: EstadoManual, fd: FormData) => Promise<EstadoManual>; grupos: GrupoColaboradores[]; lojas: Loja[]; hoje: string }) {
  const [estado, enviar, pendente] = useActionState(action, {});
  const [colaborador, setColaborador] = React.useState("");
  const lojaDoColaborador = grupos.flatMap((g) => g.opcoes).find((o) => o.id === colaborador)?.branchId ?? "";
  const [loja, setLoja] = React.useState("");
  const erro = (c: string) => estado.erros?.[c];

  if (estado.ok && estado.id) {
    return (
      <div className="space-y-4">
        <AvisoSucesso mensagem="Quebra lançada: já entrou no desconto da folha do mês e foi para o gestor da loja justificar." />
        <div className="flex flex-wrap gap-2">
          <Button nativeButton={false} render={<Link href={`/financeiro/diferenca-caixa/${estado.id}`} />}>
            Ver a quebra
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Lançar outra
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        React.startTransition(() => enviar(fd));
      }}
      className="space-y-4"
      noValidate
    >
      <ErroFormulario mensagem={estado.erro} />
      <Campo id="employee_id" label="Colaborador" obrigatorio erro={erro("employee_id")} dica="Farmacêutico não aparece: não tem quebra de caixa.">
        <SelectNativo id="employee_id" name="employee_id" value={colaborador} onChange={(e) => setColaborador(e.target.value)}>
          <option value="">Escolha…</option>
          {grupos.map((g) => (
            <optgroup key={g.loja} label={g.loja}>
              {g.opcoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="branch_id" label="Loja da quebra" dica="Muda se o colaborador trabalhou em outra loja. Define o gestor que vai justificar.">
          <SelectNativo id="branch_id" name="branch_id" value={loja || lojaDoColaborador} onChange={(e) => setLoja(e.target.value)}>
            <option value="">A do cadastro do colaborador</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} — {l.nome}
              </option>
            ))}
          </SelectNativo>
        </Campo>
        <Campo id="dia" label="Data" obrigatorio erro={erro("dia")} dica="O mês da data é o mês do desconto na folha.">
          <Input id="dia" name="dia" type="date" defaultValue={hoje} />
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-sm font-medium">
            Tipo <span className="text-red-700">*</span>
          </legend>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="tipo" value="falta" defaultChecked className="size-4 accent-fct-navy" />
              Faltou dinheiro
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="tipo" value="sobra" className="size-4 accent-fct-navy" />
              Sobrou dinheiro
            </label>
          </div>
          {erro("tipo") && <p className="text-xs text-red-700">{erro("tipo")}</p>}
        </fieldset>
        <Campo id="valor" label="Valor (R$)" obrigatorio erro={erro("valor")} dica="Vale mesmo abaixo de R$ 2,00.">
          <Input id="valor" name="valor" inputMode="decimal" placeholder="Ex.: 15,40" className="w-40" />
        </Campo>
      </div>
      <Campo id="descricao" label="Motivo" obrigatorio erro={erro("descricao")} dica="O gestor vê este texto ao justificar.">
        <textarea
          id="descricao"
          name="descricao"
          rows={3}
          maxLength={2000}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"
        />
      </Campo>
      <Button type="submit" disabled={pendente}>
        <Save data-icon="inline-start" />
        {pendente ? "Lançando…" : "Lançar quebra"}
      </Button>
    </form>
  );
}
