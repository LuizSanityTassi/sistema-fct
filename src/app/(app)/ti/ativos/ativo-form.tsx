"use client";

import Link from "next/link";
import * as React from "react";
import { useActionState } from "react";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Campo, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUS_ATIVO_LABEL, TIPOS_ATIVO } from "@/lib/ti/rotulos";
import type { EstadoAtivo } from "./actions";

type OpcaoUnidade = { id: string; codigo: string; nome: string; ativo: boolean; grupo: string };
type OpcaoFuncionario = { id: string; nome: string; cargo: string | null; unidade: string | null };

export type ValoresAtivo = Partial<{
  branch_id: string | null;
  tipo: string | null;
  descricao: string | null;
  patrimonio: string | null;
  numero_serie: string | null;
  status: string | null;
  responsavel_employee_id: string | null;
  data_aquisicao: string | null;
  valor: number | string | null;
  fornecedor: string | null;
  observacoes: string | null;
}>;

type Props = {
  action: (prev: EstadoAtivo, fd: FormData) => Promise<EstadoAtivo>;
  unidades: OpcaoUnidade[];
  funcionarios: OpcaoFuncionario[];
  valores?: ValoresAtivo;
  voltarPara: string;
};

const br = (n: number) => n.toFixed(2).replace(".", ",");

export function AtivoForm({ action, unidades, funcionarios, valores = {}, voltarPara }: Props) {
  const [estado, formAction] = useActionState(action, {});
  const erro = (c: string) => estado.erros?.[c];
  const v = (c: keyof ValoresAtivo) => (valores[c] === null || valores[c] === undefined ? "" : String(valores[c]));

  const [tipo, setTipo] = React.useState(v("tipo") || "computador");
  const [valor, setValor] = React.useState(typeof valores.valor === "number" ? br(valores.valor) : v("valor"));
  const infoTipo = TIPOS_ATIVO.find((t) => t.codigo === tipo);

  const aoTrocarTipo = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const novo = e.target.value;
    setTipo(novo);
    const ref = TIPOS_ATIVO.find((t) => t.codigo === novo)?.valorReferencia;
    if (ref !== null && ref !== undefined && (valor === "" || valor === (infoTipo?.valorReferencia !== null && infoTipo?.valorReferencia !== undefined ? br(infoTipo.valorReferencia) : ""))) {
      setValor(br(ref));
    }
  };

  const gruposUnidade = new Map<string, OpcaoUnidade[]>();
  for (const u of unidades) gruposUnidade.set(u.grupo, [...(gruposUnidade.get(u.grupo) ?? []), u]);
  const gruposFunc = new Map<string, OpcaoFuncionario[]>();
  for (const f of funcionarios) gruposFunc.set(f.unidade ?? "Sem unidade", [...(gruposFunc.get(f.unidade ?? "Sem unidade") ?? []), f]);

  return (
    <form action={formAction} noValidate className="space-y-6">
      <ErroFormulario mensagem={estado.erro} />
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Equipamento</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="tipo" label="Tipo" obrigatorio erro={erro("tipo")} dica={infoTipo?.valorReferencia != null ? `Referência: R$ ${br(infoTipo.valorReferencia)}${infoTipo.mensal ? " por mês" : ""}` : "Sem valor de referência"}>
            <SelectNativo id="tipo" name="tipo" value={tipo} onChange={aoTrocarTipo} aria-invalid={!!erro("tipo")}>
              {TIPOS_ATIVO.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="descricao" label="Marca / modelo" obrigatorio erro={erro("descricao")} className="lg:col-span-2">
            <Input id="descricao" name="descricao" defaultValue={v("descricao")} maxLength={120} aria-invalid={!!erro("descricao")} />
          </Campo>
          <Campo id="patrimonio" label="Patrimônio" erro={erro("patrimonio")} dica="Etiqueta/código interno, único">
            <Input id="patrimonio" name="patrimonio" defaultValue={v("patrimonio")} maxLength={40} aria-invalid={!!erro("patrimonio")} />
          </Campo>
          <Campo id="numero_serie" label="Número de série" erro={erro("numero_serie")}>
            <Input id="numero_serie" name="numero_serie" defaultValue={v("numero_serie")} maxLength={80} />
          </Campo>
          <Campo id="status" label="Situação" obrigatorio erro={erro("status")}>
            <SelectNativo id="status" name="status" defaultValue={v("status") || "em_uso"}>
              {Object.entries(STATUS_ATIVO_LABEL).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </SelectNativo>
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Onde está e com quem</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo id="branch_id" label="Unidade" obrigatorio erro={erro("branch_id")}>
            <SelectNativo id="branch_id" name="branch_id" defaultValue={v("branch_id")} aria-invalid={!!erro("branch_id")}>
              <option value="">Selecione…</option>
              {[...gruposUnidade.entries()].map(([grupo, lista]) => (
                <optgroup key={grupo} label={grupo}>
                  {lista.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nome}
                      {u.ativo ? "" : " (inativa)"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
          <Campo id="responsavel_employee_id" label="Responsável (funcionário)" erro={erro("responsavel_employee_id")}>
            <SelectNativo id="responsavel_employee_id" name="responsavel_employee_id" defaultValue={v("responsavel_employee_id")}>
              <option value="">—</option>
              {[...gruposFunc.keys()].sort().map((u) => (
                <optgroup key={u} label={u}>
                  {gruposFunc.get(u)!.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                      {f.cargo ? ` · ${f.cargo}` : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectNativo>
          </Campo>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-4 text-sm font-semibold">Aquisição</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo id="valor" label={infoTipo?.mensal ? "Valor mensal (R$)" : "Valor (R$)"} erro={erro("valor")} dica="Preenchido com a referência ao escolher o tipo">
            <Input id="valor" name="valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-invalid={!!erro("valor")} />
          </Campo>
          <Campo id="data_aquisicao" label="Data de aquisição" erro={erro("data_aquisicao")}>
            <Input id="data_aquisicao" name="data_aquisicao" type="date" defaultValue={v("data_aquisicao")} aria-invalid={!!erro("data_aquisicao")} />
          </Campo>
          <Campo id="fornecedor" label="Fornecedor" erro={erro("fornecedor")}>
            <Input id="fornecedor" name="fornecedor" defaultValue={v("fornecedor")} maxLength={80} />
          </Campo>
          <Campo id="observacoes" label="Observações" erro={erro("observacoes")} className="sm:col-span-3">
            <Input id="observacoes" name="observacoes" defaultValue={v("observacoes")} maxLength={1000} />
          </Campo>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <BotaoSalvar />
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={voltarPara} />}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
