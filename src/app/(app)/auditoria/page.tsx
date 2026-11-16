import Link from "next/link";
import { ListChecks, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contarRespostas, dataHoraBrasil, lerRespostas, numeroDoc } from "@/lib/auditoria/checklist";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosAuditoria, listarChecklistsAuditoria, lojasAuditaveis, paramsDosFiltros, regionaisDe, TAMANHO_PAGINA_AUDITORIA } from "@/lib/data/auditoria-lojas";
import { AbasAuditoria } from "./abas";
import { PesquisaAuditoria } from "./pesquisa";

export const metadata = { title: "Checklist de auditoria" };

export default async function AuditoriaPage({ searchParams }: PageProps<"/auditoria">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/auditoria"), searchParams]);
  const filtros = lerFiltrosAuditoria(sp);
  const [{ itens, total }, lojas] = await Promise.all([listarChecklistsAuditoria(filtros), lojasAuditaveis()]);
  const podeFazer = lojas.length > 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_AUDITORIA));

  return (
    <>
      <PageHeader
        eyebrow="Auditoria de lojas"
        titulo="Checklist de auditoria"
        descricao="Verificação do cumprimento das normas das farmácias: o auditor responde cada item (Sim, Não, Regular ou Não utilizar) na visita à loja."
        acoes={
          podeFazer ? (
            <Button nativeButton={false} render={<Link href="/auditoria/novo" />}>
              <Plus data-icon="inline-start" />
              Novo checklist
            </Button>
          ) : undefined
        }
      />
      <AbasAuditoria ativa="/auditoria" papel={sessao.papel} extras={sessao.telasExtras} />

      {podeFazer && (
        <div className="mb-4">
          <PesquisaAuditoria acao="/auditoria" lojas={lojas} regionais={regionaisDe(lojas)} filtros={filtros} />
        </div>
      )}

      <section className="rounded-xl border bg-card">
        {itens.length === 0 ? (
          <EstadoVazio
            icone={ListChecks}
            titulo="Nenhum checklist no período"
            descricao={podeFazer ? "Use “Novo checklist” na visita à loja, ou mude o período da pesquisa." : "Quando o auditor fizer o checklist da sua loja, ele aparece aqui."}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº</TableHead>
                  <TableHead>Finalizado em</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead className="hidden md:table-cell">Gerente</TableHead>
                  <TableHead className="hidden lg:table-cell">Auditor</TableHead>
                  <TableHead className="hidden sm:table-cell">Respostas</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((c) => {
                  const cont = contarRespostas(lerRespostas(c.respostas));
                  const cancelado = c.situacao === "cancelado";
                  return (
                    <TableRow key={c.id} className={cancelado ? "opacity-60" : undefined}>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/auditoria/${c.id}`} className="hover:underline">
                          {numeroDoc(c.numero)}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <Link href={`/auditoria/${c.id}`} className="font-medium hover:underline">
                          {dataHoraBrasil(c.finalizado_em)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">{c.filial?.codigo}</span> <span className="hidden xl:inline">{c.filial?.nome}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.gerente_nome ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{c.auditor_nome ?? "—"}</TableCell>
                      <TableCell className="hidden text-xs tabular-nums sm:table-cell">
                        <span className="text-emerald-700">{cont.sim} sim</span> · <span className="text-red-700">{cont.nao} não</span> · <span className="text-amber-700">{cont.regular} reg.</span>
                        {cont.nao_utilizar > 0 && <> · {cont.nao_utilizar} N/U</>}
                      </TableCell>
                      <TableCell>
                        <Status tom={cancelado ? "neutro" : "sucesso"}>{cancelado ? "Cancelado" : "Finalizado"}</Status>
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
