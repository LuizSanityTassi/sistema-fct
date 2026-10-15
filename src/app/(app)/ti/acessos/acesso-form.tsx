"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SISTEMAS_ACESSO, TIPOS_SOLICITACAO_ACESSO } from "@/lib/ti/rotulos";
import type { EstadoAcesso } from "./actions";

type OpcaoUnidade = { id: string; codigo: string; nome: string; grupo: string };

type Props = {
  action: (prev: EstadoAcesso, fd: FormData) => Promise<EstadoAcesso>;
  unidades: OpcaoUnidade[];
  unidadePadrao: string | null;
  nomePadrao: string;
};

export function AcessoForm({ action, unidades, unidadePadrao, nomePadrao }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const grupos = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="tipo" label="O que você precisa" obrigatorio erro={erro("tipo")}>
            <SelectNativo id="tipo" name="tipo" defaultValue="novo" aria-invalid={!!erro("tipo")}>
              {Object.entries(TIPOS_SOLICITACAO_ACESSO).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="sistema" label="Sistema" obrigatorio erro={erro("sistema")}>
            <SelectNativo id="sistema" name="sistema" defaultValue={SISTEMAS_ACESSO[0]} aria-invalid={!!erro("sistema")}>
              {SISTEMAS_ACESSO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="pessoa" label="Para quem" obrigatorio erro={erro("pessoa")} dica="Nome completo da pessoa que vai usar o acesso">
            <Input id="pessoa" name="pessoa" defaultValue={nomePadrao} maxLength={120} aria-invalid={!!erro("pessoa")} />
          </Campo>
          <Campo id="branch_id" label="Unidade" erro={erro("branch_id")}>
            <SelectNativo id="branch_id" name="branch_id" defaultValue={unidadePadrao ?? ""}>
              <option value="">—</option>
              {[...grupos.entries()].map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="perfil" label="Perfil / permissões" erro={erro("perfil")} className="sm:col-span-2" dica="Ex.: mesmo acesso do gerente; só consulta; caixa + estoque">
            <Input id="perfil" name="perfil" maxLength={200} />
          </Campo>
          <Campo id="justificativa" label="Justificativa" obrigatorio erro={erro("justificativa")} className="sm:col-span-2">
            <textarea
              id="justificativa"
              name="justificativa"
              rows={4}
              maxLength={2000}
              aria-invalid={!!erro("justificativa")}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </Campo>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="urgente" className="size-4 accent-fct-navy" />
            Urgente (a pessoa não consegue trabalhar sem o acesso)
          </label>
        </div>
      </section>
      <div className="flex items-center gap-2">
        <BotaoSalvar rotuloPendente="Enviando…">Enviar solicitação</BotaoSalvar>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/chamados" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
