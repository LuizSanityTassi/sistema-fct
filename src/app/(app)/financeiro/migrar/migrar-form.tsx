"use client";

import * as React from "react";
import { useActionState } from "react";
import { DatabaseZap } from "lucide-react";
import { Campo, ErroFormulario } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import type { EstadoMigracao } from "./actions";

type Props = { action: (prev: EstadoMigracao, fd: FormData) => Promise<EstadoMigracao> };
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export function MigrarForm({ action }: Props) {
  const [estado, enviar, pendente] = useActionState(action, {});
  // envio manual: com <form action> o React limpa o formulário (e os arquivos) depois da prévia
  const aoEnviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    React.startTransition(() => enviar(fd));
  };
  const [qtd, setQtd] = React.useState(0);
  const p = estado.plano;

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Arquivos do sistema anterior</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Envie o <strong>fluxo-caixa.db</strong> (pasta <code>backend/data</code> do fluxo de caixa) e, junto, os arquivos <strong>seed-dre.json</strong> e <strong>seed-financeiro.json</strong> (pasta <code>backend</code>) para classificar as categorias na DRE e na visão financeira. Nada sai do servidor: o banco é lido e descartado.
        </p>
        <ErroFormulario mensagem={estado.erro} />
        <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Campo id="arquivos" label="fluxo-caixa.db + seeds (.json)" obrigatorio>
            <input
              id="arquivos"
              name="arquivos"
              type="file"
              multiple
              accept=".db,.sqlite,.sqlite3,.json"
              onChange={(e) => setQtd(e.target.files?.length ?? 0)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-fct-navy file:px-3 file:py-1.5 file:text-sm file:text-white hover:file:bg-fct-navy/90"
            />
          </Campo>
          <Button type="submit" name="etapa" value="analisar" variant="outline" disabled={pendente || qtd === 0}>
            <DatabaseZap data-icon="inline-start" />
            {pendente ? "Lendo…" : "Analisar (prévia)"}
          </Button>
        </div>
      </section>

      {p && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Lançamentos", String(p.lancamentos.total), `${p.lancamentos.jaExistem} já estão no sistema · ${dataBr(p.lancamentos.de)} a ${dataBr(p.lancamentos.ate)}`],
              ["A receber", moeda(p.lancamentos.totalReceber), `${p.lancamentos.receber} lançamentos`],
              ["A pagar", moeda(p.lancamentos.totalPagar), `${p.lancamentos.pagar} lançamentos`],
              ["Categorias", String(p.categorias.total), `${p.categorias.combosNovos} só existiam nos lançamentos · ${p.categorias.semDre} sem DRE`],
            ].map(([r, v, n]) => (
              <div key={r} className="rounded-xl border bg-card px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{r}</p>
                <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">{v}</p>
                <p className="text-xs text-muted-foreground">{n}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="mb-2 text-sm font-semibold">Unidades</h2>
            <p className="text-xs text-muted-foreground">
              {p.unidades.existentes.length} filiais do legado já existem aqui (casadas pelo CNPJ ou código).
              {p.unidades.novas.length ? ` ${p.unidades.novas.length} serão criadas:` : " Nenhuma precisa ser criada."}
            </p>
            {p.unidades.novas.length > 0 && (
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {p.unidades.novas.map((n) => (
                  <li key={n.codigo} className="text-xs">
                    <span className="font-mono text-fct-navy">{n.codigo}</span> {n.nome} · {n.empresa} · {n.regional}
                    {n.ativo ? "" : " · inativa"} <span className="text-muted-foreground">({n.qtd} lançamentos; legado: “{n.nomeLegado}”)</span>
                  </li>
                ))}
              </ul>
            )}
            {p.unidades.semMapa.length > 0 && <p className="mt-2 text-xs text-red-700">⚠ Sem regra de criação (a migração não roda até resolver): {p.unidades.semMapa.join(", ")}</p>}
          </section>

          <section className="rounded-xl border bg-card p-5 text-sm">
            <h2 className="mb-2 text-sm font-semibold">Extras</h2>
            <p className="text-xs text-muted-foreground">
              Molde da DRE: {p.extras.estruturaDre} grupos · ajustes do contador: {p.extras.overrides} · saldos: {p.extras.saldos} · orçamento: {p.extras.orcamento} · fluxo mensal: {p.extras.fluxoMensal} · fluxo diário: {p.extras.fluxoDiario} · inadimplência: {p.extras.inadimplencia}
              {!p.extras.estruturaDre && " · (seed-dre.json não enviado: a DRE fica sem molde; dá para enviar depois)"}
            </p>
          </section>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <Button type="submit" name="etapa" value="executar" disabled={pendente || qtd === 0 || p.unidades.semMapa.length > 0} className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85">
              {pendente ? "Migrando… (1 a 2 minutos)" : `Migrar ${p.lancamentos.total - p.lancamentos.jaExistem} lançamentos`}
            </Button>
            <span className="text-xs text-muted-foreground">Reexecutar não duplica: lançamentos já migrados são pulados pelo número do legado.</span>
          </div>
        </>
      )}
    </form>
  );
}
