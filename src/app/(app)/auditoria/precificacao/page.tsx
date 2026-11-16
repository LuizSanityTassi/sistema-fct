import Link from "next/link";
import { Tags } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataHoraBrasil, formatarTaxa, SITUACOES_PRECIFICACAO, taxaDivergencia, type SituacaoPrecificacao } from "@/lib/auditoria/checklist";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosAuditoria, listarPrecificacoes, lojasAuditaveis, paramsDosFiltros, precificacoesEmAndamento, regionaisDe, TAMANHO_PAGINA_AUDITORIA } from "@/lib/data/auditoria-lojas";
import type { Tom } from "@/lib/tons";
import { AbasAuditoria } from "../abas";
import { PesquisaAuditoria } from "../pesquisa";
import { NovaPrecificacao } from "./nova";

export const metadata = { title: "Auditoria de precificação" };

const TOM_SITUACAO: Record<SituacaoPrecificacao, Tom> = { em_andamento: "atencao", finalizada: "sucesso", cancelada: "neutro" };

export default async function PrecificacaoPage({ searchParams }: PageProps<"/auditoria/precificacao">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/auditoria/precificacao"), searchParams]);
  const filtros = lerFiltrosAuditoria(sp);
  const [{ itens, total }, abertas, lojas] = await Promise.all([listarPrecificacoes(filtros), precificacoesEmAndamento(), lojasAuditaveis()]);
  const podeFazer = lojas.length > 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_AUDITORIA));

  return (
    <>
      <PageHeader
        eyebrow="Auditoria de lojas"
        titulo="Auditoria de precificação"
        descricao="O auditor confere o preço da etiqueta contra o valor no sistema e lança os produtos com diferença. O relatório sai por regional ou por filial."
      />
      <AbasAuditoria ativa="/auditoria/precificacao" papel={sessao.papel} extras={sessao.telasExtras} />

      {podeFazer && (
        <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <NovaPrecificacao lojas={lojas} />
          <div className="grid gap-1">
            <h2 className="text-sm font-semibold">Pesquisa de auditoria de precificação</h2>
            <PesquisaAuditoria acao="/auditoria/precificacao" relatorio="/imprimir/precificacao" lojas={lojas} regionais={regionaisDe(lojas)} filtros={filtros} />
          </div>
        </div>
      )}

      {abertas.length > 0 && (
        <section className="mb-4 rounded-xl border border-amber-200 bg-amber-50/40">
          <h2 className="border-b border-amber-200 px-5 py-2.5 text-sm font-semibold">Em andamento</h2>
          <ul className="divide-y divide-amber-100">
            {abertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                <span>
                  <span className="font-mono text-xs">{a.filial?.codigo}</span> {a.filial?.nome} · aberta em {dataHoraBrasil(a.aberto_em)} por {a.auditor_nome ?? "—"}
                </span>
                <Link href={`/auditoria/precificacao/${a.id}`} className="font-semibold text-amber-900 underline">
                  Continuar
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        {itens.length === 0 ? (
          <EstadoVazio icone={Tags} titulo="Nenhuma auditoria no período" descricao={podeFazer ? "Escolha a filial e clique em “Continuar” para começar, ou mude o período da pesquisa." : "Quando o auditor finalizar a auditoria de precificação da sua loja, ela aparece aqui."} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead className="hidden md:table-cell">Auditor</TableHead>
                  <TableHead className="text-right">Verificados</TableHead>
                  <TableHead className="text-right">Divergências</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((a) => {
                  const sit = a.situacao as SituacaoPrecificacao;
                  const taxa = taxaDivergencia(a.qtd_divergente, a.qtd_verificada);
                  return (
                    <TableRow key={a.id} className={sit === "cancelada" ? "opacity-60" : undefined}>
                      <TableCell className="tabular-nums">
                        <Link href={`/auditoria/precificacao/${a.id}`} className="font-medium hover:underline">
                          {dataHoraBrasil(a.finalizado_em ?? a.aberto_em)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{a.filial?.codigo}</span> <span className="hidden xl:inline">{a.filial?.nome}</span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{a.auditor_nome ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.qtd_verificada ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.qtd_divergente ?? "—"}</TableCell>
                      <TableCell className={`text-right tabular-nums ${taxa !== null && taxa >= 10 ? "font-semibold text-red-700" : ""}`}>{formatarTaxa(taxa)}</TableCell>
                      <TableCell>
                        <Status tom={TOM_SITUACAO[sit] ?? "neutro"}>{SITUACOES_PRECIFICACAO[sit] ?? sit}</Status>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_AUDITORIA} params={paramsDosFiltros(filtros)} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
