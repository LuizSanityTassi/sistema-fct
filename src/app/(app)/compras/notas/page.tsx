import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosNotas, listarNotas, opcoesCompras, paramsNotas, TAMANHO_PAGINA_COMPRAS } from "@/lib/data/compras";
import { formatarData, formatarMoeda } from "@/lib/formatos";

export const metadata = { title: "Notas de entrada" };

/** Notas de entrada lidas do espelho do Trier. */
export default async function NotasEntradaPage({ searchParams }: PageProps<"/compras/notas">) {
  const [, sp] = await Promise.all([exigirAcesso("/compras/notas"), searchParams]);
  const filtros = lerFiltrosNotas(sp);
  const [{ notas, total }, { filiais }] = await Promise.all([listarNotas(filtros), opcoesCompras()]);
  const params = paramsNotas(filtros);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_COMPRAS));

  return (
    <>
      <PageHeader eyebrow="Compras" titulo="Notas de entrada" descricao="Notas lidas do espelho do Trier (Rel_0005), com os itens de cada uma. Por padrão sem as transferências entre lojas." />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-[auto_auto_1.2fr_1.4fr_auto_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Entrada de</span>
          <Input type="date" name="de" defaultValue={filtros.de} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={filtros.filial ?? ""}>
            <option value="">Todas</option>
            {filiais.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.codigo} — {f.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Fornecedor ou nº da nota</span>
          <Input type="search" name="busca" defaultValue={filtros.busca ?? ""} maxLength={60} placeholder="Ex.: Santa Cruz" />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" name="transferencias" value="1" defaultChecked={filtros.transferencias} className="size-4" />
          Com transferências
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <section className="rounded-xl border bg-card">
        {notas.length === 0 ? (
          <EstadoVazio icone={ReceiptText} titulo="Nenhuma nota nesse filtro" descricao="Importe o espelho das notas em Compras → Importar ou mude o período." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>NF</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Itens</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Mercadorias</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Estoque</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notas.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="tabular-nums">{formatarData(n.data_entrada)}</TableCell>
                    <TableCell className="font-mono text-xs">{n.filial_codigo}</TableCell>
                    <TableCell className="max-w-64 truncate" title={n.fornecedor_nome ?? undefined}>
                      <Link href={`/compras/notas/${n.id}`} className="hover:underline">
                        {n.fornecedor_nome ?? n.fornecedor_codigo}
                      </Link>
                      {n.transferencia && <span className="block text-[11px] text-muted-foreground">transferência</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/compras/notas/${n.id}`} className="hover:underline">
                        {n.numero}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{n.qtd_itens}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(Number(n.total_mercadorias ?? 0))}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(Number(n.total_nota ?? 0))}</TableCell>
                    <TableCell className="hidden md:table-cell">{n.estoque_atualizado === false ? <Status tom="atencao">Não atualizado</Status> : <span className="text-xs text-muted-foreground">Atualizado</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_COMPRAS} params={params} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
