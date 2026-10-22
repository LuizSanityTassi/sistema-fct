"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROBLEMA_LABEL, PROBLEMAS } from "@/lib/conciliacao/rotulos";
import type { EstadoRegra } from "./actions";

export type ValoresRegra = {
  nome?: string;
  ordem?: number;
  ativo?: boolean;
  nome_contem?: string | null;
  cnpj_raiz?: string | null;
  filiais?: number[];
  valor_min?: number | null;
  valor_max?: number | null;
  problemas?: string[];
  categoria_omie?: string | null;
  departamento_omie?: string | null;
  pendencia_acao?: string | null;
  pendencia_motivo?: string | null;
};

type Props = {
  action: (prev: EstadoRegra, fd: FormData) => Promise<EstadoRegra>;
  valores?: ValoresRegra;
  modo: "nova" | "edicao";
  opcoes: { categorias: string[]; departamentos: string[]; buscou: boolean };
};

const valorTxt = (v: number | null | undefined) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function RegraForm({ action, valores = {}, modo, opcoes }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />

      <section className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Campo id="nome" label="Nome da regra" obrigatorio erro={erro("nome")} dica="Aparece na pendência e na observação da conta na Omie. Ex.: Telefonia Claro">
            <Input id="nome" name="nome" defaultValue={valores.nome ?? ""} maxLength={80} autoFocus={modo === "nova"} />
          </Campo>
          <Campo id="ordem" label="Ordem" erro={erro("ordem")} dica="Menor vale primeiro.">
            <Input id="ordem" name="ordem" type="number" inputMode="numeric" min={0} max={9999} defaultValue={valores.ordem ?? 100} />
          </Campo>
        </div>
        {modo === "edicao" && (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="hidden" name="ativo_presente" value="1" />
            <input type="checkbox" name="ativo" defaultChecked={valores.ativo ?? true} className="size-4 accent-fct-tinta" />
            Ativa (usada nas próximas conciliações e envios à Omie)
          </label>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Quando</h2>
        <p className="mb-4 text-xs text-muted-foreground">Todas as condições preenchidas precisam bater. Preencha pelo menos uma.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="nome_contem" label="Nome contém" erro={erro("nome_contem")} dica="Procura no beneficiário do boleto, no fornecedor do Trier e no fornecedor real do de-para. Ex.: CLARO">
            <Input id="nome_contem" name="nome_contem" defaultValue={valores.nome_contem ?? ""} maxLength={80} />
          </Campo>
          <Campo id="cnpj_raiz" label="CNPJ do beneficiário" erro={erro("cnpj_raiz")} dica="O CNPJ inteiro ou só os 8 primeiros dígitos (vale para todas as filiais do fornecedor).">
            <Input id="cnpj_raiz" name="cnpj_raiz" defaultValue={valores.cnpj_raiz?.trim() ?? ""} maxLength={18} inputMode="numeric" />
          </Campo>
          <Campo id="filiais" label="Filiais" erro={erro("filiais")} dica="Vazio = todas. Ex.: 301, 302">
            <Input id="filiais" name="filiais" defaultValue={(valores.filiais ?? []).join(", ")} maxLength={200} />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo id="valor_min" label="Valor a partir de" erro={erro("valor_min")}>
              <Input id="valor_min" name="valor_min" defaultValue={valorTxt(valores.valor_min)} inputMode="decimal" placeholder="0,00" />
            </Campo>
            <Campo id="valor_max" label="Valor até" erro={erro("valor_max")}>
              <Input id="valor_max" name="valor_max" defaultValue={valorTxt(valores.valor_max)} inputMode="decimal" placeholder="0,00" />
            </Campo>
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium">Tipo de divergência</legend>
          <p className="mb-2 text-xs text-muted-foreground">Vazio = qualquer conta. Marcando, a regra só vale para contas com essa divergência.</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PROBLEMAS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="problemas" value={p} defaultChecked={(valores.problemas ?? []).includes(p)} className="size-4 accent-fct-tinta" />
                {PROBLEMA_LABEL[p]}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Então</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Escolha pelo menos uma ação. {opcoes.buscou ? "Os nomes sugeridos vêm dos cadastros buscados da Omie." : "O envio da GI à Omie ainda não está ligado: digite os nomes exatamente como estão na Omie da GI."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="categoria_omie" label="Categoria na Omie" erro={erro("categoria_omie")} dica="No lugar da categoria padrão. Precisa ser igual à da Omie. Ex.: Telefonia">
            <Input id="categoria_omie" name="categoria_omie" defaultValue={valores.categoria_omie ?? ""} maxLength={70} list="regra-categorias" autoComplete="off" />
          </Campo>
          <Campo id="departamento_omie" label="Departamento na Omie" erro={erro("departamento_omie")} dica="No lugar do departamento da filial. Ex.: 423 - ADMINISTRATIVO 20-82">
            <Input id="departamento_omie" name="departamento_omie" defaultValue={valores.departamento_omie ?? ""} maxLength={80} list="regra-departamentos" autoComplete="off" />
          </Campo>
          <Campo id="pendencia_acao" label="Pendência" erro={erro("pendencia_acao")} dica="Só pendência em aberto. Decisão de uma pessoa nunca é trocada.">
            <SelectNativo id="pendencia_acao" name="pendencia_acao" defaultValue={valores.pendencia_acao ?? ""}>
              <option value="">Não mexer</option>
              <option value="resolvido">Resolver sozinha</option>
              <option value="justificado">Justificar (ignorar e não enviar à Omie)</option>
            </SelectNativo>
          </Campo>
          <Campo id="pendencia_motivo" label="Motivo" erro={erro("pendencia_motivo")} dica="Obrigatório quando a regra trata a pendência. Ex.: Débito automático, não vem boleto">
            <Input id="pendencia_motivo" name="pendencia_motivo" defaultValue={valores.pendencia_motivo ?? ""} maxLength={200} />
          </Campo>
        </div>
        <datalist id="regra-categorias">
          {opcoes.categorias.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id="regra-departamentos">
          {opcoes.departamentos.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </section>

      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao-gi/regras" />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
