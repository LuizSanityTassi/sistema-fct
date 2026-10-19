import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { BadgeAtivo } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { filtrarCategorias, lerFiltrosCategorias, listarCategorias } from "@/lib/data/financeiro";
import { podeEditarCategorias } from "@/lib/financeiro/permissoes";
import { TIPO_FIN_LABEL, TIPOS_FIN } from "@/lib/financeiro/rotulos";
import { BadgeTipoFin } from "../badges-fin";

export const metadata = { title: "Categorias" };

export default async function CategoriasPage({ searchParams }: PageProps<"/financeiro/categorias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/categorias"), searchParams]);
  const filtros = lerFiltrosCategorias(sp);
  const todas = await listarCategorias();
  const lista = filtrarCategorias(todas, filtros);
  const escreve = podeEditarCategorias(sessao.papel);
  const ativas = todas.filter((c) => c.ativo);
  const semDre = ativas.filter((c) => !c.dre_familia).length;
  const temFiltro = Boolean(filtros.q || filtros.tipo || filtros.inativas);

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Categorias"
        descricao="Plano de categorias dos lançamentos e como cada uma entra na DRE e na visão financeira."
        acoes={
          escreve ? (
            <Button nativeButton={false} render={<Link href="/financeiro/categorias/nova" />}>
              <Plus data-icon="inline-start" />
              Nova categoria
            </Button>
          ) : undefined
        }
      />

      {sp.salvo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Categoria salva." />
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[1fr_auto_auto_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Grupo, nome ou classificação" className="pl-8" aria-label="Buscar categoria" />
        </div>
        <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""} aria-label="Tipo" className="lg:w-44">
          <option value="">Receber e pagar</option>
          {TIPOS_FIN.map((t) => (
            <option key={t} value={t}>
              {TIPO_FIN_LABEL[t]}
            </option>
          ))}
        </SelectNativo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="inativas" value="1" defaultChecked={filtros.inativas} className="size-4 accent-fct-tinta" />
          Incluir inativas
        </label>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/categorias" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      <p className="mb-3 text-xs text-muted-foreground">
        {ativas.length} categorias ativas ({ativas.filter((c) => c.tipo === "receber").length} a receber · {ativas.filter((c) => c.tipo === "pagar").length} a pagar)
        {semDre > 0 ? ` · ${semDre} sem classificação na DRE` : ""} · mostrando {lista.length}
      </p>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">DRE</TableHead>
              <TableHead className="hidden xl:table-cell">Financeiro</TableHead>
              <TableHead className="hidden w-24 sm:table-cell">Situação</TableHead>
              {escreve && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={escreve ? 6 : 5} className="py-10 text-center text-muted-foreground">
                  Nenhuma categoria encontrada.
                </TableCell>
              </TableRow>
            ) : (
              lista.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <BadgeTipoFin tipo={c.tipo} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.grupo}</p>
                  </TableCell>
                  <TableCell className="hidden text-sm lg:table-cell">
                    {c.dre_familia ? (
                      <>
                        {c.dre_familia}
                        {c.dre_grupo ? <span className="text-muted-foreground"> › {c.dre_grupo}</span> : null}
                        {c.dre_sinal ? <span className="ml-1 font-mono text-xs text-muted-foreground">{c.dre_sinal > 0 ? "+" : "−"}</span> : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm xl:table-cell">
                    {c.fin_familia ? (
                      <>
                        {c.fin_familia}
                        {c.fin_grupo ? <span className="text-muted-foreground"> › {c.fin_grupo}</span> : null}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <BadgeAtivo ativo={c.ativo} />
                  </TableCell>
                  {escreve && (
                    <TableCell className="text-right">
                      <Link href={`/financeiro/categorias/${c.id}/editar`} className="text-sm text-fct-tinta underline">
                        Editar
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
