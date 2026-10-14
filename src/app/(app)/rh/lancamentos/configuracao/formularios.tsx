"use client";

import { useActionState } from "react";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { BotaoSalvar } from "@/components/form/botao-salvar";
import { Input } from "@/components/ui/input";
import type { EventoFolha } from "@/lib/rh/lancamentos";
import type { EstadoConfig } from "./actions";

type Acao = (prev: EstadoConfig, fd: FormData) => Promise<EstadoConfig>;

export function EventosForm({ action, eventos }: { action: Acao; eventos: EventoFolha[] }) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-semibold">Ordem</th>
              <th className="px-3 py-2 font-semibold">Nome (cabeçalho da coluna)</th>
              <th className="px-3 py-2 font-semibold">Código na Domínio</th>
              <th className="px-3 py-2 font-semibold">Unidade</th>
              <th className="px-3 py-2 text-center font-semibold">Na planilha</th>
              <th className="px-3 py-2 text-center font-semibold">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="px-3 py-1.5">
                  <Input name={`ordem_${e.id}`} defaultValue={e.ordem} inputMode="numeric" className="h-8 w-16" aria-label={`Ordem de ${e.nome}`} />
                </td>
                <td className="px-3 py-1.5">
                  <Input name={`nome_${e.id}`} defaultValue={e.nome} maxLength={60} className="h-8 w-56" aria-label="Nome" />
                </td>
                <td className="px-3 py-1.5">
                  <Input name={`codigo_${e.id}`} defaultValue={e.codigo ?? ""} inputMode="numeric" placeholder="sem código" className="h-8 w-28" aria-label={`Código de ${e.nome}`} />
                </td>
                <td className="px-3 py-1.5">
                  <SelectNativo name={`unidade_${e.id}`} defaultValue={e.unidade} className="h-8 w-24" aria-label={`Unidade de ${e.nome}`}>
                    <option value="horas">horas</option>
                    <option value="valor">R$</option>
                  </SelectNativo>
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" name={`planilha_${e.id}`} defaultChecked={e.naPlanilha} aria-label={`${e.nome} na planilha`} />
                </td>
                <td className="px-3 py-1.5 text-center">
                  <input type="checkbox" name={`ativo_${e.id}`} defaultChecked={e.ativo} aria-label={`${e.nome} ativo`} />
                </td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <td className="px-3 py-1.5">
                <Input name="novo_ordem" inputMode="numeric" placeholder="900" className="h-8 w-16" aria-label="Ordem do evento novo" />
              </td>
              <td className="px-3 py-1.5">
                <Input name="novo_nome" maxLength={60} placeholder="Evento novo (opcional)" className="h-8 w-56" aria-label="Nome do evento novo" />
              </td>
              <td className="px-3 py-1.5">
                <Input name="novo_codigo" inputMode="numeric" placeholder="código" className="h-8 w-28" aria-label="Código do evento novo" />
              </td>
              <td className="px-3 py-1.5">
                <SelectNativo name="novo_unidade" defaultValue="valor" className="h-8 w-24" aria-label="Unidade do evento novo">
                  <option value="horas">horas</option>
                  <option value="valor">R$</option>
                </SelectNativo>
              </td>
              <td colSpan={2} className="px-3 py-1.5 text-xs text-muted-foreground">
                vai para a planilha se tiver código
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <BotaoSalvar>Salvar eventos</BotaoSalvar>
    </form>
  );
}

export type CnpjConfig = { id: string; codigo: string; nome: string; cnpj: string; arquivo: string; codigoDominio: number | null; razaoPlanilha: string | null; razaoCadastro: string | null; funcionarios: number };

export function EmpresasForm({ action, grupos }: { action: Acao; grupos: { empresa: string; filiais: CnpjConfig[] }[] }) {
  const [estado, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <ErroFormulario mensagem={estado.erro} />
      <AvisoSucesso mensagem={estado.ok} />
      {grupos.map((g) => (
        <details key={g.empresa} className="rounded-lg border" open={g.filiais.some((f) => f.funcionarios > 0 && !f.codigoDominio)}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
            {g.empresa} · {g.filiais.length} CNPJ(s) · {g.filiais.filter((f) => f.codigoDominio).length} com código
          </summary>
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs">
                <tr>
                  <th className="px-3 py-2 font-semibold">Filial</th>
                  <th className="px-3 py-2 font-semibold">CNPJ · arquivo</th>
                  <th className="px-3 py-2 text-right font-semibold">Func.</th>
                  <th className="px-3 py-2 font-semibold">Código empresa Domínio</th>
                  <th className="px-3 py-2 font-semibold">Razão social na planilha</th>
                </tr>
              </thead>
              <tbody>
                {g.filiais.map((f) => (
                  <tr key={f.id} className="border-t">
                    <td className="px-3 py-1.5">
                      <input type="hidden" name="branch" value={f.id} />
                      <span className="font-medium">{f.codigo}</span> <span className="text-muted-foreground">{f.nome}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {f.cnpj}
                      <div className="text-muted-foreground">{f.arquivo}</div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{f.funcionarios}</td>
                    <td className="px-3 py-1.5">
                      <Input name={`codigo_${f.id}`} defaultValue={f.codigoDominio ?? ""} inputMode="numeric" placeholder="ex.: 801" className="h-8 w-28" aria-label={`Código Domínio de ${f.codigo}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input name={`razao_${f.id}`} defaultValue={f.razaoPlanilha ?? ""} maxLength={150} placeholder={f.razaoCadastro ?? ""} className="h-8 w-[26rem]" aria-label={`Razão social de ${f.codigo}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
      <BotaoSalvar>Salvar CNPJs</BotaoSalvar>
    </form>
  );
}
