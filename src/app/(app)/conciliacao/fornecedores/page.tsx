import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { formatarRaiz, listarFornecedores } from "@/lib/data/fornecedores";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";

export const metadata = { title: "Fornecedores" };

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export default async function FornecedoresPage({ searchParams }: PageProps<"/conciliacao/fornecedores">) {
  const [, sp] = await Promise.all([exigirAcesso("/conciliacao/fornecedores"), searchParams]);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const lista = await listarFornecedores(q || undefined);

  return (
    <>
      <PageHeader eyebrow="Conciliação" titulo="Fornecedores" descricao="Cada fornecedor pela raiz do CNPJ: quantos boletos já passaram pela conciliação, quanto bateu direto, faixa normal de valores, bancos e CNPJs usados. É daqui que saem os avisos de “fora do padrão”." />

      <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="relative min-w-72 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={q} placeholder="Nome do beneficiário, fornecedor no Trier ou CNPJ" className="pl-8" aria-label="Buscar fornecedor" />
        </div>
        <Button type="submit" variant="outline">
          Buscar
        </Button>
        {q && (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao/fornecedores" />}>
            Limpar
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{pluralizar(lista.length, "fornecedor", "fornecedores")}{lista.length >= 300 ? " (mostrando os 300 mais recentes — refine a busca)" : ""}</span>
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fornecedor</TableHead>
              <TableHead className="text-right">Boletos</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="hidden text-right md:table-cell">Bateram direto</TableHead>
              <TableHead className="hidden text-right md:table-cell">Divergências</TableHead>
              <TableHead className="text-right">Fora do padrão</TableHead>
              <TableHead className="hidden text-right lg:table-cell">CNPJs / bancos</TableHead>
              <TableHead className="hidden lg:table-cell">Último vencimento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {q ? "Nenhum fornecedor com esse nome ou CNPJ." : "Nenhum boleto passou pela conciliação ainda. Faça uma conciliação e os fornecedores aparecem aqui."}
                </TableCell>
              </TableRow>
            ) : (
              lista.map((f) => (
                <TableRow key={f.raiz}>
                  <TableCell>
                    <Link href={`/conciliacao/fornecedores/${f.raiz}`} className="font-medium hover:underline">
                      {f.nome ?? "—"}
                    </Link>
                    <p className="font-mono text-xs text-muted-foreground">{formatarRaiz(f.raiz)}</p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.qtd}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(f.total)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-emerald-700 md:table-cell">{pct(f.exatos, f.qtd)}</TableCell>
                  <TableCell className={`hidden text-right tabular-nums md:table-cell ${f.divergencias ? "text-amber-700" : "text-muted-foreground"}`}>{f.divergencias}</TableCell>
                  <TableCell className={`text-right tabular-nums ${f.fora_padrao ? "font-semibold text-orange-700" : "text-muted-foreground"}`}>{f.fora_padrao || "—"}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">
                    {f.cnpjs} / {f.bancos}
                  </TableCell>
                  <TableCell className="hidden tabular-nums text-muted-foreground lg:table-cell">{formatarData(f.ultimo_venc)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
