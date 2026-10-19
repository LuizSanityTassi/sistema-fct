import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { CATEGORIA_CHAMADO_LABEL, PRIORIDADE_LABEL } from "@/lib/chamados/rotulos";
import { duracao, SLA_PRIMEIRA_RESPOSTA_MIN } from "@/lib/chamados/sla";
import { carregarIndicadoresChamados } from "@/lib/data/chamados-indicadores";

export const metadata = { title: "Indicadores de chamados" };

const PERIODOS = [30, 90, 365] as const;
const tempo = (min: number | null) => (min === null ? "—" : duracao(min));
const pct = (p: number | null) => (p === null ? "—" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`);

export default async function IndicadoresChamadosPage({ searchParams }: PageProps<"/chamados/indicadores">) {
  const [, sp] = await Promise.all([exigirAcesso("/chamados/indicadores"), searchParams]);
  const dias = PERIODOS.find((p) => String(p) === sp.dias) ?? 30;
  const d = await carregarIndicadoresChamados(dias);
  const g = d.geral;

  const cartoes = [
    { r: "Chamados abertos no período", v: String(g.total), nota: `${g.resolvidos} resolvidos · ${g.emAberto} em aberto` },
    { r: "1ª resposta (média)", v: tempo(g.mediaResposta) },
    { r: "Resolução (média)", v: tempo(g.mediaResolucao) },
    { r: "Dentro do SLA", v: pct(g.slaPct), nota: g.slaEstourados ? `${g.slaEstourados} estourado(s) agora` : undefined, tom: g.slaPct !== null && g.slaPct < 80 ? "text-red-700" : "text-emerald-700" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Chamados"
        titulo="Indicadores de chamados"
        descricao={`Tempo de primeira resposta e de resolução, prazo de atendimento (SLA: ${Object.entries(SLA_PRIMEIRA_RESPOSTA_MIN)
          .map(([p, m]) => `${PRIORIDADE_LABEL[p as keyof typeof PRIORIDADE_LABEL].toLowerCase()} ${duracao(m)}`)
          .join(", ")}), onde mais abre chamado e o que se repete. Tempo corrido.`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/chamados" />}>
            <ChevronLeft data-icon="inline-start" />
            Chamados
          </Button>
        }
      />

      <nav aria-label="Período" className="mb-4 flex gap-2">
        {PERIODOS.map((p) => (
          <Link key={p} href={`/chamados/indicadores?dias=${p}`} aria-current={dias === p ? "page" : undefined} className={`rounded-full border px-3 py-1 text-sm ${dias === p ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40"}`}>
            Últimos {p} dias
          </Link>
        ))}
      </nav>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.r} className="rounded-xl border bg-card p-4">
            <p className="rotulo">{c.r}</p>
            <p className={`mt-1 numero ${c.tom ?? ""}`}>{c.v}</p>
            {c.nota && <p className="text-xs text-muted-foreground">{c.nota}</p>}
          </div>
        ))}
      </section>

      {g.total === 0 ? (
        <p className="vazio rounded-xl border bg-card">Nenhum chamado aberto nesse período. Os indicadores aparecem conforme os chamados chegam.</p>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border bg-card">
            <h2 className="px-5 pt-4 text-sm font-semibold">Por loja</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loja</TableHead>
                  <TableHead className="text-right">Chamados</TableHead>
                  <TableHead className="text-right">1ª resposta</TableHead>
                  <TableHead className="text-right">Resolução</TableHead>
                  <TableHead className="text-right">SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.porLoja.slice(0, 20).map((l) => (
                  <TableRow key={l.loja}>
                    <TableCell>
                      {l.id ? (
                        <Link href={`/chamados?filial=${l.id}&status=todos`} className="font-mono text-xs text-fct-tinta hover:underline">
                          {l.loja}
                        </Link>
                      ) : (
                        <span className="text-xs">{l.loja}</span>
                      )}{" "}
                      <span className="text-xs text-muted-foreground">{l.nome}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{l.total}</TableCell>
                    <TableCell className="text-right tabular-nums">{tempo(l.mediaResposta)}</TableCell>
                    <TableCell className="text-right tabular-nums">{tempo(l.mediaResolucao)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${l.slaPct !== null && l.slaPct < 80 ? "text-red-700" : ""}`}>{pct(l.slaPct)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>

          <div className="space-y-4">
            <section className="rounded-xl border bg-card">
              <h2 className="px-5 pt-4 text-sm font-semibold">Por categoria</h2>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Chamados</TableHead>
                    <TableHead className="text-right">1ª resposta</TableHead>
                    <TableHead className="text-right">Resolução</TableHead>
                    <TableHead className="text-right">SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.porCategoria.map((c) => (
                    <TableRow key={c.categoria}>
                      <TableCell>{CATEGORIA_CHAMADO_LABEL[c.categoria]}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                      <TableCell className="text-right tabular-nums">{tempo(c.mediaResposta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{tempo(c.mediaResolucao)}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct(c.slaPct)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-1 text-sm font-semibold">Chamados recorrentes</h2>
              <p className="mb-3 text-xs text-muted-foreground">O mesmo assunto na mesma loja 3 vezes ou mais no período: sinal de equipamento ou infraestrutura com problema.</p>
              {d.recorrentes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum assunto repetido.</p>
              ) : (
                <ul className="divide-y">
                  {d.recorrentes.map((r) => (
                    <li key={`${r.loja}-${r.assunto}`} className="py-2 text-sm">
                      <p>
                        <span className="font-mono text-xs text-fct-tinta">{r.loja}</span> · {CATEGORIA_CHAMADO_LABEL[r.categoria]} · <span className="font-medium">{r.assunto}</span>
                        <span className="ml-2 rounded-full bg-orange-100 px-1.5 text-[11px] font-semibold text-orange-800">{r.total}×</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Últimos:{" "}
                        {r.ultimos.map((t, i) => (
                          <span key={t.id}>
                            {i > 0 && ", "}
                            <Link href={`/chamados/${t.id}`} className="text-fct-tinta hover:underline">
                              #{t.numero}
                            </Link>
                          </span>
                        ))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </>
  );
}
