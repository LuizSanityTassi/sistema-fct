"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ordemGrupo, TIPO_FIN_LABEL, TIPOS_FIN, type FinTipo } from "@/lib/financeiro/rotulos";
import { hojeIso } from "@/lib/formatos";
import type { EstadoLancamento } from "./actions";

export type OpcaoUnidadeFin = { id: string; codigo: string; nome: string; ativo: boolean; grupo: string };
export type OpcaoCategoriaFin = { id: string; tipo: FinTipo; grupo: string; nome: string; ativo: boolean };

export type ValoresLancamento = Partial<{
  branch_id: string | null;
  tipo: FinTipo | null;
  categoria_id: string | null;
  valor: number | string | null;
  data: string | null;
  descricao: string | null;
}>;

type Props = {
  action: (prev: EstadoLancamento, fd: FormData) => Promise<EstadoLancamento>;
  unidades: OpcaoUnidadeFin[];
  categorias: OpcaoCategoriaFin[];
  valores?: ValoresLancamento;
  voltarPara: string;
  /** Competência fechada para quem não é administrador: mostra, mas não deixa salvar. */
  somenteLeitura?: boolean;
};

const br = (n: number) => n.toFixed(2).replace(".", ",");

export function LancamentoForm({ action, unidades, categorias, valores = {}, voltarPara, somenteLeitura }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const [tipo, setTipo] = React.useState<FinTipo>(valores.tipo ?? "pagar");
  const [categoria, setCategoria] = React.useState(valores.categoria_id ?? "");

  const aoTrocarTipo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const novo = e.target.value as FinTipo;
    setTipo(novo);
    if (categoria && categorias.find((c) => c.id === categoria)?.tipo !== novo) setCategoria("");
  };

  const gruposUnidade = new Map<string, OpcaoUnidadeFin[]>();
  for (const u of unidades) gruposUnidade.set(u.grupo, [...(gruposUnidade.get(u.grupo) ?? []), u]);
  const gruposCategoria = new Map<string, OpcaoCategoriaFin[]>();
  for (const c of categorias) {
    if (c.tipo !== tipo || (!c.ativo && c.id !== categoria)) continue;
    gruposCategoria.set(c.grupo, [...(gruposCategoria.get(c.grupo) ?? []), c]);
  }

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <fieldset disabled={somenteLeitura} className="space-y-6 disabled:opacity-70">
        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">O que aconteceu</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Campo id="tipo" label="Tipo" obrigatorio erro={erro("tipo")}>
              <SelectNativo id="tipo" name="tipo" value={tipo} onChange={aoTrocarTipo} aria-invalid={!!erro("tipo")}>
                {TIPOS_FIN.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_FIN_LABEL[t]}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo id="data" label="Data" obrigatorio erro={erro("data")} dica="A competência é o mês da data">
              <Input id="data" name="data" type="date" defaultValue={valores.data ?? hojeIso()} aria-invalid={!!erro("data")} />
            </Campo>
            <Campo id="valor" label="Valor (R$)" obrigatorio erro={erro("valor")}>
              <Input
                id="valor"
                name="valor"
                inputMode="decimal"
                placeholder="0,00"
                defaultValue={typeof valores.valor === "number" ? br(valores.valor) : (valores.valor ?? "")}
                aria-invalid={!!erro("valor")}
                autoFocus={!valores.valor}
              />
            </Campo>
            <Campo id="categoria_id" label="Categoria" obrigatorio erro={erro("categoria_id")} className="sm:col-span-2 lg:col-span-1">
              <SelectNativo id="categoria_id" name="categoria_id" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-invalid={!!erro("categoria_id")}>
                <option value="">Selecione…</option>
                {[...gruposCategoria.entries()].map(([grupo, lista]) => (
                  <optgroup key={grupo} label={grupo}>
                    {lista.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.ativo ? "" : " (inativa)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectNativo>
            </Campo>
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Onde</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo id="branch_id" label="Unidade" obrigatorio erro={erro("branch_id")}>
              <SelectNativo id="branch_id" name="branch_id" defaultValue={valores.branch_id ?? ""} aria-invalid={!!erro("branch_id")}>
                <option value="">Selecione…</option>
                {[...gruposUnidade.keys()].sort(ordemGrupo).map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {gruposUnidade.get(grupo)!.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.codigo} — {u.nome}
                        {u.ativo ? "" : " (inativa)"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </SelectNativo>
            </Campo>
            <Campo id="descricao" label="Descrição" erro={erro("descricao")} dica="Opcional: fornecedor, documento, observação">
              <Input id="descricao" name="descricao" defaultValue={valores.descricao ?? ""} maxLength={300} aria-invalid={!!erro("descricao")} />
            </Campo>
          </div>
        </section>
      </fieldset>

      <div className="flex items-center gap-2">
        {!somenteLeitura && <BotaoSalvar />}
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={voltarPara} />}>
          {somenteLeitura ? "Voltar" : "Cancelar"}
        </Button>
      </div>
    </form>
  );
}
