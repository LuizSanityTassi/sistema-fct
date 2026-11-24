import Link from "next/link";
import { ClipboardList, Upload } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { DESCRICAO_PEDIDO, JANELA_MAXIMA, SITUACOES_PEDIDO, TOM_PEDIDO, type SituacaoPedido } from "@/lib/compras/rotulos";
import { lerFiltrosPedidos, listarPedidos, opcoesCompras, paramsPedidos, TAMANHO_PAGINA_COMPRAS } from "@/lib/data/compras";
import { formatarData, formatarMoeda } from "@/lib/formatos";

export const metadata = { title: "Pedidos × notas" };

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Pré-pedidos do Trier cruzados com as notas de entrada: o que chegou, o que falta e o que veio a mais, por filial e produto. */
export default async function PedidosNotasPage({ searchParams }: PageProps<"/compras">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/compras"), searchParams]);
  const filtros = lerFiltrosPedidos(sp);
  const [{ pedidos, total, porSituacao, geral }, { filiais, laboratorios }] = await Promise.all([listarPedidos(filtros), opcoesCompras()]);
  const params = paramsPedidos(filtros);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_COMPRAS));
  const link = (extra: Record<string, string | undefined>) =>
    `/compras?${new URLSearchParams(Object.entries({ ...params, ...extra }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const podeImportar = sessao.papel === "admin" || sessao.papel === "compras";

  return (
    <>
      <PageHeader
        eyebrow="Compras"
        titulo="Pedidos × notas"
        descricao={`Cada pré-pedido do Trier cruzado com as notas de entrada da mesma filial, produto a produto (pelo código do Trier). Contam as notas que chegaram até ${filtros.janela} dias depois do pedido; transferências entre lojas ficam de fora. Os valores usam o preço das notas (o que falta, o último preço pago).`}
        acoes={
          podeImportar ? (
            <Button nativeButton={false} render={<Link href="/compras/importar" />}>
              <Upload data-icon="inline-start" />
              Importar
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3 lg:grid-cols-[auto_auto_1.2fr_1fr_1fr_6rem_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Pedido de</span>
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
          <span className="font-medium">Laboratório</span>
          <SelectNativo name="laboratorio" defaultValue={filtros.laboratorio ?? ""}>
            <option value="">Todos</option>
            {laboratorios.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <SelectNativo name="situacao" defaultValue={filtros.situacao ?? ""}>
            <option value="">Todas</option>
            {(Object.keys(SITUACOES_PEDIDO) as SituacaoPedido[]).map((s) => (
              <option key={s} value={s}>
                {SITUACOES_PEDIDO[s]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Prazo (dias)</span>
          <Input type="number" name="janela" min={0} max={JANELA_MAXIMA} defaultValue={filtros.janela} />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm">
        <span>
          Recebido <strong className="tabular-nums">{formatarMoeda(geral.valorRecebido)}</strong>
        </span>
        <span>
          Falta <strong className="tabular-nums text-red-800">{formatarMoeda(geral.valorFaltando)}</strong>
        </span>
        <span>
          Veio a mais <strong className="tabular-nums text-amber-800">{formatarMoeda(geral.valorExcedente)}</strong>
        </span>
        <span className="text-muted-foreground">
          {geral.pedidos} pré-pedidos · {num(geral.recebida)} de {num(geral.pedida)} unidades
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(Object.keys(SITUACOES_PEDIDO) as SituacaoPedido[]).map((s) => {
          const t = porSituacao[s];
          return (
            <Link key={s} href={link({ situacao: filtros.situacao === s ? undefined : s })} className={`rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 ${filtros.situacao === s ? "ring-2 ring-primary/20" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="rotulo">{SITUACOES_PEDIDO[s]}</p>
                <Status tom={TOM_PEDIDO[s]}>{t.pedidos}</Status>
              </div>
              <p className="mt-1.5 numero-sm">
                {num(t.recebida)} <span className="text-sm font-normal text-muted-foreground">de {num(t.pedida)} un.</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {DESCRICAO_PEDIDO[s]}
                {s === "a_mais" && t.excedente ? ` · +${num(t.excedente)} un. (${formatarMoeda(t.valorExcedente)})` : ""}
                {(s === "faltou" || s === "aguardando") && t.valorFaltando ? ` · falta ${formatarMoeda(t.valorFaltando)}` : ""}
              </p>
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border bg-card">
        {pedidos.length === 0 ? (
          <EstadoVazio
            icone={ClipboardList}
            titulo="Nenhum pré-pedido nesse filtro"
            descricao={podeImportar ? "Importe os pré-pedidos do dia e o espelho das notas em Compras → Importar." : "Mude o período ou os filtros."}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead className="hidden md:table-cell">Laboratório</TableHead>
                  <TableHead className="hidden sm:table-cell">Pré-pedido</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                  <TableHead className="text-right">Recebido</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Falta</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">A mais</TableHead>
                  <TableHead className="hidden xl:table-cell">Última nota</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pedidos.map((p) => {
                  const href = `/compras/pedidos/${p.pedido_id}?janela=${filtros.janela}`;
                  const pedida = Number(p.qtd_pedida);
                  const recebida = Number(p.qtd_recebida);
                  const pct = pedida ? Math.round((recebida / pedida) * 100) : 0;
                  const sit = p.situacao as SituacaoPedido;
                  return (
                    <TableRow key={p.pedido_id}>
                      <TableCell className="tabular-nums">
                        <Link href={href} className="hover:underline">
                          {formatarData(p.data_pedido)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={href} className="font-mono text-xs font-medium hover:underline">
                          {p.filial_codigo}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{p.laboratorio ?? "—"}</TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">{p.numero}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(p.itens)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(recebida)} / {num(pedida)}
                        <span className="block text-[11px] text-muted-foreground">
                          {pct}% · {formatarMoeda(Number(p.valor_recebido))}
                        </span>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {Number(p.itens_nao_chegaram) + Number(p.itens_parciais) ? (
                          <>
                            {Number(p.itens_nao_chegaram) + Number(p.itens_parciais)} itens
                            <span className="block text-[11px] text-muted-foreground">{formatarMoeda(Number(p.valor_faltando))}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {Number(p.qtd_excedente) ? (
                          <>
                            +{num(Number(p.qtd_excedente))}
                            <span className="block text-[11px] text-muted-foreground">{formatarMoeda(Number(p.valor_excedente))}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="hidden tabular-nums xl:table-cell">{p.ultima_entrada ? formatarData(p.ultima_entrada) : "—"}</TableCell>
                      <TableCell>
                        <Status tom={TOM_PEDIDO[sit] ?? "neutro"}>{SITUACOES_PEDIDO[sit] ?? p.situacao}</Status>
                        {sit === "aguardando" && <span className="block text-[11px] text-muted-foreground">prazo {formatarData(p.prazo)}</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
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
