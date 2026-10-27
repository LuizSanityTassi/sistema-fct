import Link from "next/link";
import { ClipboardCheck, Plus } from "lucide-react";
import { AvisoAtencao, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { SITUACOES_CHECKLIST, TOM_CHECKLIST, type SituacaoChecklist } from "@/lib/coordenacao/checklist";
import { checklistsParaConfirmar, lerFiltrosChecklist, listarChecklists, opcoesChecklist, TAMANHO_PAGINA_CHECKLISTS } from "@/lib/data/coordenacao";
import { formatarData } from "@/lib/formatos";
import { AbasCoordenacao } from "./abas";
import { MostrarEstrelas } from "./estrelas";

export const metadata = { title: "Checklist da loja" };

export default async function CoordenacaoPage({ searchParams }: PageProps<"/coordenacao">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/coordenacao"), searchParams]);
  const filtros = lerFiltrosChecklist(sp);
  const [{ itens, total, qtd }, { lojas }, paraMim] = await Promise.all([listarChecklists(filtros), opcoesChecklist(), checklistsParaConfirmar(sessao.id)]);
  const podeFazer = lojas.length > 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_CHECKLISTS));
  const params = { filial: filtros.filial, situacao: filtros.situacao };
  const link = (extra: Record<string, string | undefined>) => `/coordenacao?${new URLSearchParams(Object.entries({ ...params, ...extra }).filter((e): e is [string, string] => !!e[1])).toString()}`;

  return (
    <>
      <PageHeader
        eyebrow="Coordenação"
        titulo="Checklist da loja"
        descricao="Check-list do coordenador regional: a avaliação da loja na visita (0 a 5 estrelas), os direcionamentos e o que ficou acordado, confirmados pelo gerente."
        acoes={
          podeFazer ? (
            <Button nativeButton={false} render={<Link href="/coordenacao/novo" />}>
              <Plus data-icon="inline-start" />
              Novo checklist
            </Button>
          ) : undefined
        }
      />

      <AbasCoordenacao ativa="/coordenacao" papel={sessao.papel} />

      {paraMim > 0 && (
        <div className="mb-4">
          <AvisoAtencao mensagem={`Você tem ${paraMim === 1 ? "1 checklist" : `${paraMim} checklists`} para confirmar. Abra, leia a avaliação e confirme (ou diga com o que não concorda).`} />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(Object.keys(SITUACOES_CHECKLIST) as SituacaoChecklist[]).map((s) => (
          <Link key={s} href={link({ situacao: filtros.situacao === s ? undefined : s, pagina: undefined })} className={`rounded-xl border bg-card p-4 ${filtros.situacao === s ? "border-primary ring-1 ring-primary" : "hover:border-primary/40"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="rotulo">{SITUACOES_CHECKLIST[s]}</p>
              <Status tom={TOM_CHECKLIST[s]}>{qtd[s]}</Status>
            </div>
          </Link>
        ))}
      </div>

      {lojas.length > 1 && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
          {filtros.situacao && <input type="hidden" name="situacao" value={filtros.situacao} />}
          <label className="grid min-w-64 flex-1 gap-1 text-sm sm:flex-none">
            <span className="font-medium">Loja</span>
            <SelectNativo name="filial" defaultValue={filtros.filial ?? ""}>
              <option value="">Todas</option>
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
            </SelectNativo>
          </label>
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
        </form>
      )}

      <section className="rounded-xl border bg-card">
        {itens.length === 0 ? (
          <EstadoVazio
            icone={ClipboardCheck}
            titulo="Nenhum checklist por aqui"
            descricao={podeFazer ? "Use “Novo checklist” na próxima visita à loja." : "Quando o coordenador fizer o checklist da sua loja, ele aparece aqui para você confirmar."}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead className="hidden md:table-cell">Gerente</TableHead>
                  <TableHead className="hidden lg:table-cell">Coordenador</TableHead>
                  <TableHead>Média</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((c) => {
                  const filial = c.filial as { codigo: string; nome: string } | null;
                  const situacao = c.situacao as SituacaoChecklist;
                  const media = c.media === null ? null : Number(c.media);
                  const paraConfirmar = situacao === "aguardando" && c.gerente_id === sessao.id;
                  return (
                    <TableRow key={c.id} className={situacao === "cancelado" ? "opacity-60" : paraConfirmar ? "bg-amber-50/60" : undefined}>
                      <TableCell className="tabular-nums">
                        <Link href={`/coordenacao/${c.id}`} className="font-medium hover:underline">
                          {formatarData(c.data)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/coordenacao/${c.id}`} className="hover:underline">
                          <span className="font-mono text-xs">{filial?.codigo}</span> <span className="hidden xl:inline">{filial?.nome}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{c.gerente_nome ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{c.coordenador_nome ?? "—"}</TableCell>
                      <TableCell>
                        {media === null ? (
                          "—"
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <MostrarEstrelas nota={media} tamanho="size-3.5" />
                            <span className="text-xs tabular-nums text-muted-foreground">{media.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {paraConfirmar ? (
                          <Link href={`/coordenacao/${c.id}`} className="text-sm font-semibold text-amber-800 underline">
                            Confirmar
                          </Link>
                        ) : (
                          <Status tom={TOM_CHECKLIST[situacao] ?? "neutro"}>{SITUACOES_CHECKLIST[situacao] ?? situacao}</Status>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_CHECKLISTS} params={params} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
