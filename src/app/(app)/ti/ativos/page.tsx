import Link from "next/link";
import { Plus, Printer, Search } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { lerFiltrosAtivos, listarAtivos, TAMANHO_PAGINA } from "@/lib/data/ti";
import { formatarMoeda } from "@/lib/formatos";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL, TIPOS_ATIVO } from "@/lib/ti/rotulos";
import { BadgeAtivo } from "./badge-ativo";
import { MarcarTodosEtiquetas } from "./marcar-etiquetas";

export const metadata = { title: "Ativos de TI" };

export default async function AtivosPage({ searchParams }: PageProps<"/ti/ativos">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ti/ativos"), searchParams]);
  const filtros = lerFiltrosAtivos(sp);
  const [unidades, resultado] = await Promise.all([listarUnidadesParaSelecao(), listarAtivos(filtros)]);
  const podeEditar = sessao.papel === "admin" || sessao.papel === "ti";
  const params = { q: filtros.q, filial: filtros.filial, tipo: filtros.tipo, status: filtros.status };
  const temFiltro = Boolean(filtros.q || filtros.filial || filtros.tipo || filtros.status !== "ativos");

  return (
    <>
      <PageHeader
        eyebrow="Tecnologia"
        titulo="Ativos de TI"
        descricao="Equipamentos por unidade, com patrimônio, situação, rede e histórico. Etiquetas com QR Code: marque os equipamentos e clique em “Etiquetas dos marcados” (vários na mesma folha), ou filtre uma loja para imprimir todos os dela."
        acoes={
          podeEditar ? (
            <>
              <Button type="submit" form="form-etiquetas" variant="outline">
                <Printer data-icon="inline-start" />
                Etiquetas dos marcados
              </Button>
              {filtros.filial && (
                <Button variant="outline" nativeButton={false} render={<a href={`/etiquetas/ti?filial=${filtros.filial}`} target="_blank" rel="noopener" />}>
                  <Printer data-icon="inline-start" />
                  Etiquetas da loja
                </Button>
              )}
              <Button nativeButton={false} render={<Link href="/ti/ativos/novo" />}>
                <Plus data-icon="inline-start" />
                Novo ativo
              </Button>
            </>
          ) : undefined
        }
      />

      {sp.salvo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Ativo salvo." />
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Modelo, patrimônio ou nº de série" className="pl-8" aria-label="Buscar ativo" />
        </div>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="lg:w-52">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""} aria-label="Tipo" className="lg:w-48">
          <option value="">Todos os tipos</option>
          {TIPOS_ATIVO.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.rotulo}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="status" defaultValue={filtros.status} aria-label="Situação" className="lg:w-40">
          <option value="ativos">Em uso/estoque/manutenção</option>
          {Object.entries(STATUS_ATIVO_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
          <option value="todos">Todos</option>
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/ti/ativos" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      {/* etiquetas: as caixas de cada linha pertencem a este formulário (abre a impressão em outra aba) */}
      {podeEditar && <form id="form-etiquetas" action="/etiquetas/ti" method="get" target="_blank" rel="noopener" />}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {podeEditar && (
                <TableHead className="w-10">
                  <MarcarTodosEtiquetas />
                </TableHead>
              )}
              <TableHead>Equipamento</TableHead>
              <TableHead className="hidden md:table-cell">Unidade</TableHead>
              <TableHead className="hidden lg:table-cell">Patrimônio / série</TableHead>
              <TableHead className="hidden lg:table-cell">Responsável</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Valor</TableHead>
              <TableHead className="w-32">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={podeEditar ? 7 : 6} className="vazio">
                  Nenhum ativo encontrado.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((a) => (
                <TableRow key={a.id}>
                  {podeEditar && (
                    <TableCell>
                      <input type="checkbox" name="id" value={a.id} form="form-etiquetas" className="size-4 accent-fct-tinta" aria-label={`Etiqueta de ${a.descricao}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <Link href={`/ti/ativos/${a.id}`} className="font-medium hover:underline">
                      {a.descricao}
                    </Link>
                    <p className="text-xs text-muted-foreground">{TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.unidade ? (
                      <>
                        <span className="font-mono text-xs text-fct-tinta">{a.unidade.codigo}</span> {a.unidade.nome}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">
                    {a.patrimonio ?? "—"}
                    {a.numero_serie ? <span className="text-muted-foreground"> · {a.numero_serie}</span> : null}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{a.responsavel?.nome ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatarMoeda(a.valor)}</TableCell>
                  <TableCell>
                    <BadgeAtivo status={a.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} tamanho={TAMANHO_PAGINA} params={params} />
        </div>
      </div>
    </>
  );
}
