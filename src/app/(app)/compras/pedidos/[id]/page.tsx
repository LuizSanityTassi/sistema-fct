import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { JANELA_MAXIMA, JANELA_PADRAO, rotuloPedido, situacaoItem } from "@/lib/compras/rotulos";
import { hojeBrasil, itensDoPedido, obterPedido } from "@/lib/data/compras";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";

export const metadata = { title: "Pré-pedido" };

const num = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Itens do pré-pedido com o que chegou nas notas (e de qual nota), o que falta e o que veio a mais. */
export default async function PedidoPage({ params, searchParams }: PageProps<"/compras/pedidos/[id]">) {
  const [, { id }, sp] = await Promise.all([exigirAcesso("/compras"), params, searchParams]);
  const p = await obterPedido(id);
  if (!p) notFound();
  const j = Number.parseInt(typeof sp.janela === "string" ? sp.janela : "", 10);
  const janela = Number.isInteger(j) && j >= 0 && j <= JANELA_MAXIMA ? j : JANELA_PADRAO;
  const itens = await itensDoPedido(p, janela);
  const hoje = hojeBrasil();
  const linhas = itens.map((i) => ({ ...i, sit: situacaoItem({ pedido: Number(i.pedido), recebido: Number(i.recebido), excedente: Number(i.excedente), prazo: i.prazo }, hoje) }));
  // os que pedem atenção primeiro: não chegou / faltou, parcial, a mais, completo
  const peso = (t: string) => (t === "perigo" ? 0 : t === "info" ? 1 : t === "alerta" ? 2 : 3);
  linhas.sort((a, b) => peso(a.sit.tom) - peso(b.sit.tom) || (a.produto ?? "").localeCompare(b.produto ?? "", "pt-BR"));
  const pedida = linhas.reduce((s, i) => s + Number(i.pedido), 0);
  const recebida = linhas.reduce((s, i) => s + Number(i.recebido), 0);
  const excedente = linhas.reduce((s, i) => s + Number(i.excedente), 0);
  const valor = (k: "valor_recebido" | "valor_faltando" | "valor_excedente") => Math.round(linhas.reduce((s, i) => s + Number(i[k] ?? 0), 0) * 100) / 100;
  const semPreco = linhas.filter((i) => i.preco === null).length;
  const filial = p.filial as { nome: string } | null;
  const prazo = linhas[0]?.prazo ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Compras · Pedidos × notas"
        titulo={`${p.filial_codigo}${filial?.nome ? ` · ${filial.nome}` : ""} · ${p.laboratorio ?? "pré-pedido"} · ${formatarData(p.data_pedido)}`}
        descricao={`${rotuloPedido(p.numero)} · ${linhas.length} itens · recebido ${num(recebida)} de ${num(pedida)} unidades (${formatarMoeda(valor("valor_recebido"))}) · falta ${formatarMoeda(valor("valor_faltando"))}${excedente ? ` · +${num(excedente)} a mais (${formatarMoeda(valor("valor_excedente"))})` : ""} · prazo até ${prazo ? formatarData(prazo) : "—"} (${janela} dias)${semPreco ? ` · ${semPreco} item(ns) sem preço em nenhuma nota` : ""}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/compras" />}>
            <ChevronLeft data-icon="inline-start" />
            Pedidos × notas
          </Button>
        }
      />
      <Painel titulo="Itens" descricao="Contam as notas da mesma filial com o mesmo código de produto, da data do pedido até o prazo. Se o mesmo produto foi pedido de novo depois, as notas atendem primeiro o pedido mais antigo.">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="hidden sm:table-cell">Código</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead className="hidden lg:table-cell">Cód. barras</TableHead>
              <TableHead className="text-right">Pedido</TableHead>
              <TableHead className="text-right">Recebido</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Preço</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Valor</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="hidden md:table-cell">Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((i) => (
              <TableRow key={i.item_id}>
                <TableCell className="hidden font-mono text-xs sm:table-cell">{i.produto_codigo}</TableCell>
                <TableCell className="max-w-72">
                  {i.produto}
                  <span className="block text-[11px] text-muted-foreground sm:hidden">cód. {i.produto_codigo}</span>
                </TableCell>
                <TableCell className="hidden font-mono text-xs lg:table-cell">{i.barras ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{num(Number(i.pedido))}</TableCell>
                <TableCell className="text-right tabular-nums">{num(Number(i.recebido) + Number(i.excedente))}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {i.preco === null ? "—" : formatarMoeda(Number(i.preco))}
                  {i.preco_referencia && <span className="block text-[11px] text-muted-foreground">último preço pago</span>}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {Number(i.valor_recebido) ? formatarMoeda(Number(i.valor_recebido)) : "—"}
                  {Number(i.valor_faltando) ? <span className="block text-[11px] text-red-800">falta {formatarMoeda(Number(i.valor_faltando))}</span> : null}
                  {Number(i.valor_excedente) ? <span className="block text-[11px] text-amber-800">a mais {formatarMoeda(Number(i.valor_excedente))}</span> : null}
                </TableCell>
                <TableCell>
                  <Status tom={i.sit.tom}>{i.sit.rotulo}</Status>
                </TableCell>
                <TableCell className="hidden max-w-80 text-xs text-muted-foreground md:table-cell">
                  {i.notas ?? "—"}
                  {i.ultima_entrada ? <span className="block">última entrada {formatarData(i.ultima_entrada)}</span> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Arquivo {p.arquivo ?? "—"} · importado em {formatarDataHora(p.criado_em)}. Para outro prazo, troque “Prazo (dias)” na lista.
        </p>
      </Painel>
    </>
  );
}
