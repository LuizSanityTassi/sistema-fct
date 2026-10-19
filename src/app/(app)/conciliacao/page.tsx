import Link from "next/link";
import { FolderUp, Scale } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { TIPO_ARQUIVO_LABEL, type TipoArquivoConc } from "@/lib/conciliacao/rotulos";
import { painelConciliacao } from "@/lib/data/conciliacao";
import { formatarData, formatarDataHora, formatarMoeda, pluralizar } from "@/lib/formatos";
import { BadgePrioridadePendencia } from "./badges-conc";

export const metadata = { title: "Conciliação" };

const pct = (v: number | string | null | undefined) => (v == null ? "—" : `${(Number(v) * 100).toFixed(1).replace(".", ",")}%`);

function Kpi({ rotulo, valor, nota, href, tom }: { rotulo: string; valor: string; nota?: string | null; href?: string; tom?: string }) {
  const corpo = (
    <>
      <p className="rotulo">{rotulo}</p>
      <p className={`mt-1 numero ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border bg-card p-4 transition-colors hover:border-primary/40">
      {corpo}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card p-4">{corpo}</div>
  );
}

export default async function ConciliacaoPage() {
  const sessao = await exigirAcesso("/conciliacao");
  const painel = await painelConciliacao();
  const ultima = painel.ultimas[0];
  const r = (ultima?.resumo ?? {}) as Record<string, number | undefined>;
  const escreve = podeConciliar(sessao.papel);
  const pend = painel.pendencias;

  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo="DDA Itaú × Trier"
        descricao="Boletos que o banco vai cobrar (DDA) contra as contas a pagar lançadas no Trier. O que não bate vira pendência."
        acoes={
          escreve ? (
            <>
              <Button variant="outline" nativeButton={false} render={<Link href="/conciliacao/arquivos" />}>
                <FolderUp data-icon="inline-start" />
                Enviar arquivos
              </Button>
              <Button nativeButton={false} render={<Link href="/conciliacao/nova" />}>
                <Scale data-icon="inline-start" />
                Nova conciliação
              </Button>
            </>
          ) : undefined
        }
      />

      {ultima ? (
        <section className="mb-6">
          <p className="mb-2 text-xs text-muted-foreground">
            Última conciliação: {formatarDataHora(ultima.criado_em)} · filiais {ultima.fil_min}–{ultima.fil_max} · por {ultima.quem?.nome ?? "—"} ·{" "}
            <Link href={`/conciliacao/${ultima.id}`} className="text-fct-tinta underline">
              abrir
            </Link>
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Kpi rotulo="Bateram" valor={pct(ultima.pct_bateu)} nota={`${r.bateu ?? 0} de ${ultima.qtd_trier} títulos · ${pct(ultima.pct_valor_bateu)} do valor`} href={`/conciliacao/${ultima.id}?aba=exato`} tom="text-emerald-700" />
            <Kpi rotulo="Para conferir" valor={String(r.conferir ?? 0)} nota="valor, data ou filial diferente" href={`/conciliacao/${ultima.id}?aba=aproximado`} tom={(r.conferir ?? 0) > 0 ? "text-amber-700" : undefined} />
            <Kpi rotulo="Só no Trier" valor={String(r.soTrier ?? 0)} nota={`${formatarMoeda(r.valorSoTrier ?? 0)} sem boleto no banco`} href={`/conciliacao/${ultima.id}?aba=so_trier`} tom={(r.soTrier ?? 0) > 0 ? "text-red-700" : undefined} />
            <Kpi rotulo="Só no DDA" valor={String(r.soDDA ?? 0)} nota={`${formatarMoeda(r.valorSoDDA ?? 0)} sem título no Trier`} href={`/conciliacao/${ultima.id}?aba=so_dda`} tom={(r.soDDA ?? 0) > 0 ? "text-sky-700" : undefined} />
            <Kpi rotulo="Desconto no vencimento" valor={formatarMoeda((r.descontos as unknown as { noVencimento?: { valor?: number } } | undefined)?.noVencimento?.valor ?? 0)} nota="pagando no dia" href={`/conciliacao/${ultima.id}?aba=descontos`} />
            <Kpi rotulo="Fora do padrão" valor={r.anomalias === undefined ? "—" : String(r.anomalias)} nota={r.anomalias === undefined ? "sem detecção nesta rodada" : `${r.anomaliasGraves ?? 0} grave(s) · histórico do fornecedor`} href={`/conciliacao/${ultima.id}#anomalias`} tom={(r.anomalias ?? 0) > 0 ? "text-orange-700" : undefined} />
          </div>
        </section>
      ) : (
        <section className="mb-6 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Nenhuma conciliação ainda. Envie os arquivos do banco (.RET ou planilha do portal Itaú) e o relatório do Trier em <Link href="/conciliacao/arquivos" className="text-fct-tinta underline">Arquivos</Link>, depois clique em “Nova conciliação”.
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Pendências abertas</h2>
            <Link href="/conciliacao/pendencias" className="text-xs text-fct-tinta underline">
              ver todas
            </Link>
          </div>
          <ul className="divide-y border-t text-sm">
            {([3, 2, 1] as const).map((p) => (
              <li key={p} className="flex items-center justify-between px-5 py-2.5">
                <Link href={`/conciliacao/pendencias?prioridade=${p}`} className="flex items-center gap-2 hover:underline">
                  <BadgePrioridadePendencia prioridade={p} />
                  <span>{pluralizar(pend.porPrioridade[p].qtd, "pendência", "pendências")}</span>
                </Link>
                <span className="tabular-nums text-muted-foreground">{formatarMoeda(pend.porPrioridade[p].valor)}</span>
              </li>
            ))}
            <li className="flex items-center justify-between px-5 py-2.5 font-medium">
              <span>Total em análise</span>
              <span className="tabular-nums">{formatarMoeda(pend.valorTotal)}</span>
            </li>
          </ul>
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Filiais com mais pendências</h2>
          </div>
          {pend.porFilial.length === 0 ? (
            <p className="border-t px-5 py-5 text-sm text-muted-foreground">Nenhuma pendência aberta.</p>
          ) : (
            <ul className="divide-y border-t text-sm">
              {pend.porFilial.slice(0, 8).map((f) => (
                <li key={String(f.filial)} className="flex items-center justify-between px-5 py-2.5">
                  <Link href={`/conciliacao/pendencias${f.filial != null ? `?filial=${f.filial}` : ""}`} className="hover:underline">
                    <span className="font-mono text-xs text-fct-tinta">{f.filial != null ? String(f.filial).padStart(3, "0") : "—"}</span> · {pluralizar(f.qtd, "pendência", "pendências")}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">{formatarMoeda(f.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Arquivos guardados</h2>
            <Link href="/conciliacao/arquivos" className="text-xs text-fct-tinta underline">
              ver
            </Link>
          </div>
          <ul className="divide-y border-t text-sm">
            {Object.entries(painel.arquivos.porTipo).map(([tipo, qtd]) => (
              <li key={tipo} className="flex items-center justify-between px-5 py-2.5">
                <span>{TIPO_ARQUIVO_LABEL[tipo as TipoArquivoConc] ?? tipo}</span>
                <span className="tabular-nums">{qtd}</span>
              </li>
            ))}
            <li className="px-5 py-2.5 text-xs text-muted-foreground">
              {painel.arquivos.total === 0 ? "Nenhum arquivo ainda." : `Último envio ${formatarDataHora(painel.arquivos.ultimo)}`}
            </li>
          </ul>
        </section>
      </div>

      <section className="mt-4 rounded-xl border bg-card">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold">Últimas conciliações</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead className="hidden md:table-cell">Filiais</TableHead>
              <TableHead className="text-right">Títulos Trier</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Boletos</TableHead>
              <TableHead className="text-right">Bateram</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Só Trier</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Só DDA</TableHead>
              <TableHead className="hidden xl:table-cell">Por</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {painel.ultimas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="vazio">
                  Nenhuma conciliação registrada.
                </TableCell>
              </TableRow>
            ) : (
              painel.ultimas.map((c) => {
                const rc = (c.resumo ?? {}) as Record<string, number | undefined>;
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/conciliacao/${c.id}`} className="font-medium hover:underline">
                        {c.titulo || formatarDataHora(c.criado_em)}
                      </Link>
                      {c.titulo && <p className="text-xs text-muted-foreground">{formatarDataHora(c.criado_em)}</p>}
                      {c.venc_ini && <p className="text-xs text-muted-foreground">venc. {formatarData(c.venc_ini)} a {formatarData(c.venc_fim)}</p>}
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{c.fil_min}–{c.fil_max}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.qtd_trier}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.qtd_dda}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums text-emerald-700">{pct(c.pct_bateu)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{rc.soTrier ?? 0}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{rc.soDDA ?? 0}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground xl:table-cell">{c.quem?.nome ?? "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
