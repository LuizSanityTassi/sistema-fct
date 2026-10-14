"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DRE_SINAL_LABEL, TIPO_FIN_LABEL, TIPOS_FIN, type FinTipo } from "@/lib/financeiro/rotulos";
import type { EstadoCategoria } from "./actions";

export type OpcoesClassificacao = { grupos: string[]; dreFamilias: string[]; dreGrupos: string[]; finFamilias: string[]; finGrupos: string[] };

export type ValoresCategoria = Partial<{
  tipo: FinTipo | null;
  grupo: string | null;
  nome: string | null;
  dre_familia: string | null;
  dre_grupo: string | null;
  dre_sinal: number | null;
  fin_familia: string | null;
  fin_grupo: string | null;
  ativo: boolean;
}>;

type Props = {
  action: (prev: EstadoCategoria, fd: FormData) => Promise<EstadoCategoria>;
  opcoes: OpcoesClassificacao;
  valores?: ValoresCategoria;
  modo: "nova" | "edicao";
};

function Sugestoes({ id, itens }: { id: string; itens: string[] }) {
  return (
    <datalist id={id}>
      {itens.map((i) => (
        <option key={i} value={i} />
      ))}
    </datalist>
  );
}

export function CategoriaForm({ action, opcoes, valores = {}, modo }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const v = (c: keyof ValoresCategoria) => (valores[c] === null || valores[c] === undefined ? "" : String(valores[c]));

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Categoria</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="tipo" label="Tipo" obrigatorio erro={erro("tipo")}>
            <SelectNativo id="tipo" name="tipo" defaultValue={v("tipo") || "pagar"} aria-invalid={!!erro("tipo")}>
              {TIPOS_FIN.map((t) => (
                <option key={t} value={t}>
                  {TIPO_FIN_LABEL[t]}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="grupo" label="Grupo" obrigatorio erro={erro("grupo")} dica="Ex.: Despesas Administrativas">
            <Input id="grupo" name="grupo" list="lista-grupos" defaultValue={v("grupo")} maxLength={60} aria-invalid={!!erro("grupo")} autoFocus={modo === "nova"} />
            <Sugestoes id="lista-grupos" itens={opcoes.grupos} />
          </Campo>
          <Campo id="nome" label="Nome" obrigatorio erro={erro("nome")} dica="Ex.: Energia Elétrica">
            <Input id="nome" name="nome" defaultValue={v("nome")} maxLength={80} aria-invalid={!!erro("nome")} />
          </Campo>
          {modo === "edicao" && (
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input type="checkbox" name="ativo" defaultChecked={valores.ativo ?? true} className="size-4 accent-fct-navy" />
              Ativa (aparece ao lançar). Categorias inativas mantêm o histórico.
            </label>
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Classificação na DRE</h2>
        <p className="mb-4 text-xs text-muted-foreground">Em qual bloco do demonstrativo de resultado a categoria entra e se soma ou subtrai.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="dre_familia" label="Família (DRE)" erro={erro("dre_familia")} dica="Ex.: TOTAL RECEITAS, DESPESAS OPERACIONAIS">
            <Input id="dre_familia" name="dre_familia" list="lista-dre-familias" defaultValue={v("dre_familia")} maxLength={60} />
            <Sugestoes id="lista-dre-familias" itens={opcoes.dreFamilias} />
          </Campo>
          <Campo id="dre_grupo" label="Grupo (DRE)" erro={erro("dre_grupo")}>
            <Input id="dre_grupo" name="dre_grupo" list="lista-dre-grupos" defaultValue={v("dre_grupo")} maxLength={60} />
            <Sugestoes id="lista-dre-grupos" itens={opcoes.dreGrupos} />
          </Campo>
          <Campo id="dre_sinal" label="Sinal" erro={erro("dre_sinal")}>
            <SelectNativo id="dre_sinal" name="dre_sinal" defaultValue={v("dre_sinal")}>
              <option value="">—</option>
              {(Object.keys(DRE_SINAL_LABEL) as Array<keyof typeof DRE_SINAL_LABEL>).map((s) => (
                <option key={s} value={s}>
                  {DRE_SINAL_LABEL[s]}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Classificação financeira</h2>
        <p className="mb-4 text-xs text-muted-foreground">Visão de caixa: custo da mercadoria, despesas fixas, variáveis, financeiras…</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="fin_familia" label="Família (financeiro)" erro={erro("fin_familia")}>
            <Input id="fin_familia" name="fin_familia" list="lista-fin-familias" defaultValue={v("fin_familia")} maxLength={60} />
            <Sugestoes id="lista-fin-familias" itens={opcoes.finFamilias} />
          </Campo>
          <Campo id="fin_grupo" label="Grupo (financeiro)" erro={erro("fin_grupo")}>
            <Input id="fin_grupo" name="fin_grupo" list="lista-fin-grupos" defaultValue={v("fin_grupo")} maxLength={60} />
            <Sugestoes id="lista-fin-grupos" itens={opcoes.finGrupos} />
          </Campo>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/categorias" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
