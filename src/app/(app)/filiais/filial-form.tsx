"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoFormulario } from "./actions";

export type OpcaoOrganizacao = { id: string; nome_fantasia: string | null; razao_social: string };
export type OpcaoFuncionario = { id: string; nome: string; cargo: string | null; unidade: string | null };

export type ValoresFilial = Partial<
  Record<
    | "organization_id"
    | "codigo"
    | "nome"
    | "razao_social"
    | "cnpj"
    | "regional"
    | "cidade"
    | "estado"
    | "endereco"
    | "telefone"
    | "email"
    | "responsavel_employee_id"
    | "responsavel_nome",
    string | null
  >
>;

type Props = {
  action: (prev: EstadoFormulario, fd: FormData) => Promise<EstadoFormulario>;
  organizacoes: OpcaoOrganizacao[];
  regionais: string[];
  funcionarios: OpcaoFuncionario[];
  valores?: ValoresFilial;
  voltarPara: string;
};

export function FilialForm({ action, organizacoes, regionais, funcionarios, valores = {}, voltarPara }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (campo: string) => estado.erros?.[campo];
  const v = (campo: keyof ValoresFilial) => valores[campo] ?? "";

  const regionalAtual = v("regional");
  const opcoesRegional = regionalAtual && !regionais.includes(regionalAtual) ? [...regionais, regionalAtual] : regionais;

  // Funcionários agrupados pela unidade onde trabalham.
  const grupos = new Map<string, OpcaoFuncionario[]>();
  for (const f of funcionarios) {
    const chave = f.unidade ?? "Sem unidade";
    grupos.set(chave, [...(grupos.get(chave) ?? []), f]);
  }
  const unidades = [...grupos.keys()].sort();

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Identificação</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="organization_id" label="Grupo" obrigatorio erro={erro("organization_id")}>
            <SelectNativo
              id="organization_id"
              name="organization_id"
              defaultValue={v("organization_id")}
              aria-invalid={!!erro("organization_id")}
            >
              <option value="">Selecione…</option>
              {organizacoes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome_fantasia ?? o.razao_social}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="codigo" label="Código" obrigatorio erro={erro("codigo")} dica="Ex.: F001, F301, ADM">
            <Input
              id="codigo"
              name="codigo"
              defaultValue={v("codigo")}
              maxLength={12}
              className="uppercase"
              aria-invalid={!!erro("codigo")}
            />
          </Campo>
          <Campo id="nome" label="Nome da unidade" obrigatorio erro={erro("nome")}>
            <Input id="nome" name="nome" defaultValue={v("nome")} maxLength={80} aria-invalid={!!erro("nome")} />
          </Campo>
          <Campo id="regional" label="Regional" erro={erro("regional")}>
            <SelectNativo id="regional" name="regional" defaultValue={regionalAtual}>
              <option value="">—</option>
              {opcoesRegional.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="razao_social" label="Razão social" erro={erro("razao_social")}>
            <Input id="razao_social" name="razao_social" defaultValue={v("razao_social")} maxLength={120} />
          </Campo>
          <Campo id="cnpj" label="CNPJ" erro={erro("cnpj")} dica="Com ou sem pontuação">
            <Input id="cnpj" name="cnpj" defaultValue={v("cnpj")} maxLength={18} aria-invalid={!!erro("cnpj")} />
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Endereço e contato</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="cidade" label="Cidade" erro={erro("cidade")}>
            <Input id="cidade" name="cidade" defaultValue={v("cidade")} maxLength={80} />
          </Campo>
          <Campo id="estado" label="UF" erro={erro("estado")}>
            <Input
              id="estado"
              name="estado"
              defaultValue={v("estado")}
              maxLength={2}
              className="w-24 uppercase"
              aria-invalid={!!erro("estado")}
            />
          </Campo>
          <Campo id="endereco" label="Endereço" erro={erro("endereco")} className="sm:col-span-2">
            <Input id="endereco" name="endereco" defaultValue={v("endereco")} maxLength={200} />
          </Campo>
          <Campo id="telefone" label="Telefone" erro={erro("telefone")}>
            <Input id="telefone" name="telefone" defaultValue={v("telefone")} maxLength={30} />
          </Campo>
          <Campo id="email" label="E-mail" erro={erro("email")}>
            <Input id="email" name="email" type="email" defaultValue={v("email")} aria-invalid={!!erro("email")} />
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Responsável</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Escolha um funcionário cadastrado ou, se a pessoa ainda não está na folha, informe só o nome.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="responsavel_employee_id" label="Funcionário" erro={erro("responsavel_employee_id")}>
            <SelectNativo
              id="responsavel_employee_id"
              name="responsavel_employee_id"
              defaultValue={v("responsavel_employee_id")}
            >
              <option value="">—</option>
              {unidades.map((u) => (
                <optgroup key={u} label={u}>
                  {grupos.get(u)!.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.cargo ? ` · ${f.cargo}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          <Campo
            id="responsavel_nome"
            label="Ou nome do responsável"
            erro={erro("responsavel_nome")}
            dica="Ignorado quando um funcionário é escolhido."
          >
            <Input id="responsavel_nome" name="responsavel_nome" defaultValue={v("responsavel_nome")} maxLength={80} />
          </Campo>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" render={<Link href={voltarPara} />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
