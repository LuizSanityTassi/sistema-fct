import Link from "next/link";
import { Plus } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { rpcPaginado } from "@/lib/data/dre";
import { listarCategorias, listarCompetenciasFinanceiro, listarMesesFechados, resumoPeriodo, type Agregado } from "@/lib/data/financeiro";
import { montarAlertas } from "@/lib/financeiro/alertas";
import { moedaFin } from "@/lib/financeiro/formatos";
import { createClient as supabaseRpc } from "@/lib/supabase/server";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { pluralizar } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { BadgeMesFechado, RotuloGrupo } from "./badges-fin";

export const metadata = { title: "Financeiro" };

const percentual = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function margem(a: Agregado) {
  if (a.receber <= 0) return "—";
  return `${percentual.format((a.resultado / a.receber) * 100)}%`;
}

const tomResultado = (v: number) => (v < 0 ? "text-red-700" : "text-emerald-700");

function linkLancamentos(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  return `/financeiro/lancamentos?${sp.toString()}`;
}

function Kpi({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string | null; tom?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export default async function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro"), searchParams]);
  const competencias = await listarCompetenciasFinanceiro();
  const anoAtual = String(new Date().getFullYear());
  const anos = [...new Set([anoAtual, ...competencias.map((c) => c.slice(0, 4))])].sort().reverse();
  const anoPedido = typeof sp.ano === "string" ? sp.ano : "";
  const ano = anos.includes(anoPedido) ? anoPedido : (competencias[0]?.slice(0, 4) ?? anoAtual);
  const [resumo, fechados, categorias] = await Promise.all([resumoPeriodo(`${ano}-01`, `${ano}-12`), listarMesesFechados(), listarCategorias()]);
  const fechado = new Set(fechados.map((m) => m.competencia));
  const vazio = resumo.total.qtd === 0;
  const mesRef = resumo.porMes.length ? resumo.porMes[resumo.porMes.length - 1].competencia : null;
  const alertas = mesRef
    ? montarAlertas(
        (await rpcPaginado((a, b) => supabaseRpc().then((s) => s.rpc("fin_dre", { p_de: `${ano}-01`, p_ate: `${ano}-12` }).range(a, b)))).map((l) => ({ categoria_id: l.categoria_id, competencia: l.competencia.trim(), tipo: l.tipo, total: Number(l.total) })),
        categorias,
        mesRef,
        rotuloCompetencia,
      )
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Visão geral"
        descricao="Receitas, despesas e resultado realizado por grupo, mês e unidade. Valores sem centavos, como a diretoria acompanha."
        acoes={
          podeLancar(sessao.papel) ? (
            <Button className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85" nativeButton={false} render={<Link href="/financeiro/lancamentos/novo" />}>
              <Plus data-icon="inline-start" />
              Novo lançamento
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <label htmlFor="ano" className="text-sm font-medium">
          Ano
        </label>
        <SelectNativo id="ano" name="ano" defaultValue={ano} className="w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline" size="sm">
          Ver
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {vazio ? "Sem lançamentos no período." : `${pluralizar(resumo.total.qtd, "lançamento", "lançamentos")} em ${pluralizar(resumo.unidadesComMovimento, "unidade", "unidades")}`}
        </span>
      </form>

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Receitas" valor={moedaFin(resumo.total.receber)} tom="text-emerald-700" />
        <Kpi rotulo="Despesas" valor={moedaFin(resumo.total.pagar)} tom="text-red-700" />
        <Kpi rotulo="Resultado" valor={moedaFin(resumo.total.resultado)} nota={vazio ? null : `margem ${margem(resumo.total)}`} tom={tomResultado(resumo.total.resultado)} />
        <Kpi rotulo="Meses com movimento" valor={String(resumo.porMes.length)} nota={`${resumo.porMes.filter((m) => fechado.has(m.competencia)).length} fechado(s)`} />
      </section>

      {alertas.length > 0 && (
        <section className="mb-6 space-y-2">
          {alertas.map((a) => (
            <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${a.nivel === "critico" ? "border-red-200 bg-red-50 text-red-900" : a.nivel === "atencao" ? "border-orange-200 bg-orange-50 text-orange-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <span className="text-[11px] font-semibold tracking-wide">{a.nivel === "critico" ? "🔴 CRÍTICO" : a.nivel === "atencao" ? "🟠 ATENÇÃO" : "🟡 INFO"}</span>
              <span>{a.texto}</span>
            </div>
          ))}
        </section>
      )}

      {vazio ? (
        <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <p>
            Nenhum lançamento em {ano}. Registre o primeiro lançamento ou importe o histórico do fluxo de caixa anterior com o script{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">scripts/migrar-financeiro.mjs</code> (ver README).
          </p>
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-semibold">Por grupo</h2>
              <span className="text-xs text-muted-foreground">{ano}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grupo</TableHead>
                  <TableHead className="text-right">Receitas</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.porGrupo.map((g) => (
                  <TableRow key={g.grupo}>
                    <TableCell>
                      <Link href={linkLancamentos({ grupo: g.grupo, de: `${ano}-01-01`, ate: `${ano}-12-31` })} className="hover:underline">
                        <RotuloGrupo grupo={g.grupo} />
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(g.receber)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(g.pagar)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${tomResultado(g.resultado)}`}>{moedaFin(g.resultado)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{margem(g)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-semibold">Por mês</h2>
              <span className="text-xs text-muted-foreground">{ano}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">Receitas</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.porMes.map((m) => (
                  <TableRow key={m.competencia}>
                    <TableCell>
                      <Link href={linkLancamentos({ competencia: m.competencia })} className="font-medium hover:underline">
                        {rotuloCompetencia(m.competencia)}
                      </Link>
                      {fechado.has(m.competencia) && (
                        <span className="ml-2">
                          <BadgeMesFechado />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(m.receber)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(m.pagar)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${tomResultado(m.resultado)}`}>{moedaFin(m.resultado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <section className="rounded-xl border bg-card lg:col-span-2">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-semibold">Por unidade</h2>
              <span className="text-xs text-muted-foreground">{pluralizar(resumo.porUnidade.length, "unidade", "unidades")} com movimento em {ano}</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="hidden md:table-cell">Grupo</TableHead>
                  <TableHead className="text-right">Receitas</TableHead>
                  <TableHead className="text-right">Despesas</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.porUnidade.map((u) => (
                  <TableRow key={u.unidade.id}>
                    <TableCell>
                      <Link href={linkLancamentos({ filial: u.unidade.id, de: `${ano}-01-01`, ate: `${ano}-12-31` })} className="hover:underline">
                        <span className="font-mono text-xs text-fct-navy">{u.unidade.codigo}</span> {u.unidade.nome}
                      </Link>
                      {!u.unidade.ativo && <span className="ml-2 text-xs text-muted-foreground">(inativa)</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <RotuloGrupo grupo={u.unidade.grupo} className="text-xs" />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(u.receber)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(u.pagar)}</TableCell>
                    <TableCell className={`text-right font-semibold tabular-nums ${tomResultado(u.resultado)}`}>{moedaFin(u.resultado)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{margem(u)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        </div>
      )}
    </>
  );
}
