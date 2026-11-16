import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dataHoraBrasil, formatarTaxa, SITUACOES_PRECIFICACAO, taxaDivergencia, type SituacaoPrecificacao } from "@/lib/auditoria/checklist";
import { exigirAcesso } from "@/lib/auth/session";
import { obterPrecificacao } from "@/lib/data/auditoria-lojas";
import { formatarMoeda } from "@/lib/formatos";
import { cancelarPrecificacao } from "../../actions";
import { CancelarAuditoria } from "../../cancelar";
import { ProdutosPrecificacao } from "./produtos";

export const metadata = { title: "Auditoria de precificação" };

export default async function PrecificacaoDetalhePage({ params }: PageProps<"/auditoria/precificacao/[id]">) {
  const [sessao, { id }] = await Promise.all([exigirAcesso("/auditoria/precificacao"), params]);
  const a = await obterPrecificacao(id);
  if (!a) notFound();
  const sit = a.situacao as SituacaoPrecificacao;
  const dono = sessao.papel === "admin" || a.auditor_id === sessao.id;
  const editavel = sit === "em_andamento" && dono;
  const filial = `${a.filial?.codigo ?? ""} - ${a.filial?.nome ?? ""}`;
  const taxa = taxaDivergencia(a.qtd_divergente, a.qtd_verificada);
  const itens = a.itens.map((i) => ({ ...i, valor_sistema: Number(i.valor_sistema), valor_etiqueta: Number(i.valor_etiqueta), diferenca: Number(i.diferenca) }));

  return (
    <>
      <PageHeader
        eyebrow={`Auditoria de precificação · aberta em ${dataHoraBrasil(a.aberto_em)}`}
        titulo={filial}
        descricao={`Auditor: ${a.auditor_nome ?? "—"}`}
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/auditoria/precificacao" />}>
              <ArrowLeft data-icon="inline-start" />
              Voltar
            </Button>
            {sit === "finalizada" && (
              <Button nativeButton={false} render={<Link href={`/imprimir/precificacao?id=${a.id}`} target="_blank" />}>
                <Printer data-icon="inline-start" />
                Relatório / PDF
              </Button>
            )}
          </>
        }
      />

      {editavel ? (
        <ProdutosPrecificacao id={a.id} filial={filial} itens={itens} />
      ) : (
        <>
          <section className="mb-4 grid gap-3 rounded-xl border bg-card p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="rotulo block">Situação</span>
              <Status tom={sit === "finalizada" ? "sucesso" : sit === "em_andamento" ? "atencao" : "neutro"}>{SITUACOES_PRECIFICACAO[sit] ?? sit}</Status>
            </p>
            <p>
              <span className="rotulo block">Finalizada em</span>
              {dataHoraBrasil(a.finalizado_em)}
            </p>
            <p>
              <span className="rotulo block">Produtos verificados</span>
              {a.qtd_verificada ?? "—"}
            </p>
            <p>
              <span className="rotulo block">Divergências encontradas</span>
              {a.qtd_divergente ?? itens.length}
            </p>
            <p>
              <span className="rotulo block">Taxa de divergência</span>
              <span className={taxa !== null && taxa >= 10 ? "font-semibold text-red-700" : undefined}>{formatarTaxa(taxa)}</span>
            </p>
            <p className="sm:col-span-2 lg:col-span-3">
              <span className="rotulo block">Observação</span>
              <span className="whitespace-pre-line">{a.observacao || "—"}</span>
            </p>
            {sit === "cancelada" && (
              <p className="text-red-800 sm:col-span-2 lg:col-span-3">
                Cancelada em {dataHoraBrasil(a.cancelado_em)}: {a.motivo_cancelamento}
              </p>
            )}
            {sit === "em_andamento" && <p className="text-amber-800 sm:col-span-2 lg:col-span-3">Em andamento: só quem abriu a auditoria lança os produtos e finaliza.</p>}
          </section>

          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-5 py-3 text-sm font-semibold">Produtos com divergência</h2>
            {itens.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">Nenhuma divergência encontrada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Etiqueta</TableHead>
                    <TableHead className="text-right">Sistema</TableHead>
                    <TableHead className="text-right">Diferença</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <span className="font-mono text-xs">{i.codigo}</span> — {i.produto}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(i.valor_etiqueta)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(i.valor_sistema)}</TableCell>
                      <TableCell className={`text-right tabular-nums ${i.diferenca < 0 ? "text-red-700" : "text-amber-700"}`}>{formatarMoeda(i.diferenca)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </>
      )}

      {dono && sit !== "cancelada" && (
        <div className="mt-6">
          <CancelarAuditoria action={cancelarPrecificacao.bind(null, a.id)} rotulo="Cancelar auditoria" />
        </div>
      )}
    </>
  );
}
