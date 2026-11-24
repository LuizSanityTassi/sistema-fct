import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { obterNota } from "@/lib/data/compras";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";

export const metadata = { title: "Nota de entrada" };

const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

export default async function NotaEntradaPage({ params }: PageProps<"/compras/notas/[id]">) {
  const [, { id }] = await Promise.all([exigirAcesso("/compras/notas"), params]);
  const n = await obterNota(id);
  if (!n) notFound();
  const filial = n.filial as { nome: string } | null;
  const campos: [string, React.ReactNode][] = [
    ["Filial", `${n.filial_codigo}${filial?.nome ? ` · ${filial.nome}` : ""}`],
    ["Fornecedor", `${n.fornecedor_codigo} · ${n.fornecedor_nome ?? ""}${n.transferencia ? " (transferência entre lojas)" : ""}`],
    ["Nota fiscal", `${n.numero}${n.serie ? ` · série ${n.serie}` : ""}`],
    ["Entrada · emissão", `${formatarData(n.data_entrada)} · ${formatarData(n.data_emissao)}`],
    ["Estoque atualizado", n.estoque_atualizado === null ? "—" : n.estoque_atualizado ? "Sim" : "Não"],
    ["Mercadorias · descontos", `${formatarMoeda(Number(n.total_mercadorias ?? 0))} · ${formatarMoeda(Number(n.total_descontos ?? 0))}`],
    ["Total da nota", <span key="t" className="numero-sm">{formatarMoeda(Number(n.total_nota ?? 0))}</span>],
  ];

  return (
    <>
      <PageHeader
        eyebrow="Compras · Notas de entrada"
        titulo={`NF ${n.numero} · ${n.filial_codigo}`}
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/compras/notas" />}>
            <ChevronLeft data-icon="inline-start" />
            Notas
          </Button>
        }
      />
      <div className="grid gap-4">
        <Painel titulo="Nota">
          <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {campos.map(([r, v]) => (
              <div key={r}>
                <dt className="text-xs text-muted-foreground">{r}</dt>
                <dd className="mt-0.5 font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t px-5 py-2 text-xs text-muted-foreground">Atualizada pelo espelho em {formatarDataHora(n.atualizado_em)}.</p>
        </Painel>
        <Painel titulo="Itens" descricao={`${n.itens.length} itens`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="hidden md:table-cell">Laboratório</TableHead>
                <TableHead className="text-right">Quant.</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Unitário</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Desc.</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Líquido</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n.itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs">{i.produto_codigo}</TableCell>
                  <TableCell>{i.produto}</TableCell>
                  <TableCell className="hidden md:table-cell">{i.laboratorio ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(Number(i.quantidade))}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{i.valor_unitario === null ? "—" : formatarMoeda(Number(i.valor_unitario))}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{pct(i.desconto_pct === null ? null : Number(i.desconto_pct))}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{i.valor_liquido === null ? "—" : formatarMoeda(Number(i.valor_liquido))}</TableCell>
                  <TableCell className="text-right tabular-nums">{i.valor_total === null ? "—" : formatarMoeda(Number(i.valor_total))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Painel>
      </div>
    </>
  );
}
