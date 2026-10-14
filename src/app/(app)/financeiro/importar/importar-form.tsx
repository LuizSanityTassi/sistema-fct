"use client";

import * as React from "react";
import { useActionState } from "react";
import { CheckCircle2, CircleAlert, FileSpreadsheet } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EstadoImportacao } from "./actions";

type Props = { action: (prev: EstadoImportacao, fd: FormData) => Promise<EstadoImportacao>; anoPadrao: number; hoje: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SITUACAO: Record<string, string> = { novo: "novo", dup_arquivo: "repetido no arquivo", dup_banco: "já no sistema", mes_fechado: "mês fechado", invalido: "inválido" };

export function ImportarForm({ action, anoPadrao, hoje }: Props) {
  const [estado, enviar, pendente] = useActionState(action, {});
  // envio manual: com <form action> o React limpa o formulário (e os arquivos) depois da prévia
  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    React.startTransition(() => enviar(fd));
  };
  const [qtd, setQtd] = React.useState(0);
  const a = estado.analise;

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Arquivos do Omie</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Excel exportado do Omie: <strong>Fluxo Por Filial</strong> (aba “LANÇAMENTOS DESPESAS”: FILIAL · TIPO · GRUPO · Categoria · Valor Pago · MÊS) ou <strong>Contas a Pagar/Receber</strong> (Empresa · CNPJ · Razão Social · Categoria · Emissão · Valor). A unidade sai do CNPJ; a categoria é
          ligada ao plano de categorias (as que não existirem são criadas). Tudo entra como realizado, origem “Omie”, com proteção anti-duplicidade (mesma unidade + tipo + categoria + valor + data).
        </p>
        <ErroFormulario mensagem={estado.erro} />
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
          <Campo id="arquivos" label="Arquivos (.xlsx)" obrigatorio>
            <input
              id="arquivos"
              name="arquivos"
              type="file"
              multiple
              accept=".xlsx,.xls"
              onChange={(e) => setQtd(e.target.files?.length ?? 0)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-fct-navy file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-fct-navy/90"
            />
          </Campo>
          <Campo id="ano" label="Ano (coluna MÊS)" dica="Quando o arquivo só traz o mês">
            <Input id="ano" name="ano" type="number" min={2020} max={2100} defaultValue={anoPadrao} className="w-28" />
          </Campo>
          <Campo id="referencia" label="Data de referência" dica="Para linha sem data">
            <Input id="referencia" name="referencia" type="date" defaultValue={hoje} className="w-40" />
          </Campo>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button type="submit" name="etapa" value="analisar" variant="outline" disabled={pendente || qtd === 0}>
            <FileSpreadsheet data-icon="inline-start" />
            {pendente ? "Lendo…" : "Analisar (prévia)"}
          </Button>
          <span className="text-xs text-muted-foreground">Nada é gravado na prévia.</span>
        </div>
      </section>

      {estado.leituras && (
        <ul className="rounded-xl border bg-card text-sm">
          {estado.leituras.map((l) => (
            <li key={l.nome} className="flex items-start gap-2 border-b px-4 py-2 last:border-0">
              {l.lidos > 0 ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />}
              <div>
                <p className="font-medium">
                  {l.nome} <span className="text-xs text-muted-foreground">— {l.lidos} linhas · {l.formato === "lancamentos" ? "lançamentos por filial" : l.formato === "contas" ? "contas a pagar/receber" : "formato não reconhecido"}</span>
                </p>
                {l.usaramReferencia > 0 && <p className="text-xs text-muted-foreground">{l.usaramReferencia} linha(s) sem data usaram a data de referência.</p>}
                {l.semUnidade.length > 0 && <p className="text-xs text-amber-800">⚠ Sem unidade cadastrada (ignoradas): {l.semUnidade.join(", ")}</p>}
                {l.avisos.map((av) => (
                  <p key={av} className="text-xs text-red-700">
                    {av}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {a && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              ["Novos (vão entrar)", String(a.novos), null, "text-emerald-700"],
              ["Duplicados (pulados)", String(a.dupArquivo + a.dupBanco), `${a.dupBanco} já no sistema · ${a.dupArquivo} repetidos no arquivo`, a.dupArquivo + a.dupBanco > 0 ? "text-red-700" : ""],
              ["Mês fechado", String(a.mesFechado), a.mesesFechados.length ? a.mesesFechados.join(", ") : null, a.mesFechado ? "text-amber-700" : ""],
              ["A pagar", moeda(a.totalPagar), null, "text-red-700"],
              ["A receber", moeda(a.totalReceber), null, "text-emerald-700"],
            ].map(([rotulo, valor, nota, tom]) => (
              <div key={rotulo as string} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
                <p className={`mt-1 text-xl font-semibold tabular-nums ${tom}`}>{valor}</p>
                {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
              </div>
            ))}
          </section>
          {a.invalidos > 0 && <p className="text-xs text-red-700">{a.invalidos} linha(s) inválida(s) (valor zero ou data ruim) ficam de fora.</p>}
          {a.categoriasNovas.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <p className="font-medium">{a.categoriasNovas.length} categoria(s) nova(s) serão criadas (sem classificação na DRE — classifique depois em Categorias):</p>
              <p className="text-xs">{a.categoriasNovas.map((c) => `${c.tipo === "pagar" ? "Pagar" : "Receber"} · ${c.grupo} › ${c.nome} (${c.qtd})`).join(" · ")}</p>
            </div>
          )}
          <div className="rounded-xl border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="p-2">Unidade</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Grupo › Categoria</th>
                  <th className="p-2 text-right">Valor</th>
                  <th className="p-2">Data</th>
                  <th className="p-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {a.amostra.map((i, k) => (
                  <tr key={k} className="border-b last:border-0">
                    <td className="p-2">{i.unidade}</td>
                    <td className="p-2">{i.tipo === "pagar" ? "Pagar" : "Receber"}</td>
                    <td className="p-2">
                      <span className="text-muted-foreground">{i.grupo} › </span>
                      {i.categoria}
                    </td>
                    <td className="p-2 text-right tabular-nums">{moeda(i.valor)}</td>
                    <td className="p-2 tabular-nums">{dataBr(i.data)}</td>
                    <td className={`p-2 text-xs ${i.situacao === "novo" ? "text-emerald-700" : i.situacao === "mes_fechado" ? "text-amber-700" : "text-red-700"}`}>{SITUACAO[i.situacao] ?? i.situacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {a.total > 150 && <p className="border-t px-3 py-2 text-xs text-muted-foreground">Mostrando as primeiras 150 de {a.total} linhas.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <Button type="submit" name="etapa" value="importar" disabled={pendente || qtd === 0 || a.novos === 0} className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85">
              {pendente ? "Importando…" : `Importar ${a.novos} novos`}
            </Button>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="incluir_duplicados" className="size-4 accent-fct-navy" />
              importar também os duplicados ({a.dupArquivo + a.dupBanco})
            </label>
            <span className="text-xs text-muted-foreground">Os arquivos são lidos de novo ao importar; não mude a seleção.</span>
          </div>
        </>
      )}
    </form>
  );
}
