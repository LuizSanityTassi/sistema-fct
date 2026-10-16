import Link from "next/link";
import { Download, Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosDocumentos, listarDocumentos, TAMANHO_PAGINA } from "@/lib/data/documentos";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { CATEGORIA_DOC_LABEL } from "@/lib/rh/rotulos";

export const metadata = { title: "Documentos" };

export default async function DocumentosPage({ searchParams }: PageProps<"/rh/documentos">) {
  const [, sp] = await Promise.all([exigirAcesso("/rh/documentos"), searchParams]);
  const filtros = lerFiltrosDocumentos(sp);
  const [unidades, resultado] = await Promise.all([listarUnidadesParaSelecao(), listarDocumentos(filtros)]);
  const params = { q: filtros.q, filial: filtros.filial, categoria: filtros.categoria };
  const temFiltro = Boolean(filtros.q || filtros.filial || filtros.categoria);

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="Documentos"
        descricao="Todos os documentos enviados para as fichas dos funcionários. O envio é feito na ficha de cada um."
      />

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome do funcionário" className="pl-8" aria-label="Buscar por funcionário" />
        </div>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="sm:w-52">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="categoria" defaultValue={filtros.categoria ?? ""} aria-label="Categoria" className="sm:w-44">
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIA_DOC_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/rh/documentos" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead className="hidden sm:table-cell">Unidade</TableHead>
              <TableHead>Documento</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">Data</TableHead>
              <TableHead className="hidden lg:table-cell">Enviado em</TableHead>
              <TableHead className="w-20 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhum documento encontrado.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <Link href={`/rh/funcionarios/${d.employees.id}#documentos`} className="font-medium hover:underline">
                      {d.employees.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {d.employees.branches ? (
                      <>
                        <span className="font-mono text-xs text-fct-tinta">{d.employees.branches.codigo}</span> {d.employees.branches.nome}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{d.nome}</TableCell>
                  <TableCell className="hidden md:table-cell">{CATEGORIA_DOC_LABEL[d.categoria]}</TableCell>
                  <TableCell className="hidden lg:table-cell">{formatarData(d.data_documento)}</TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">{formatarDataHora(d.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <a href={`/api/arquivos/documento/${d.id}`} className="inline-flex items-center gap-1 text-sm text-fct-tinta underline">
                      <Download className="size-3.5" aria-hidden /> Baixar
                    </a>
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
