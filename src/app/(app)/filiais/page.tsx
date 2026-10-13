import Link from "next/link";
import { Building2, Plus, Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { BadgeAtivo } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import {
  contarUnidadesPorOrganizacao,
  lerFiltros,
  listarFiliais,
  listarOrganizacoes,
  listarRegionais,
  TAMANHO_PAGINA,
} from "@/lib/data/filiais";
import { pluralizar } from "@/lib/formatos";

export const metadata = { title: "Filiais" };

export default async function FiliaisPage({ searchParams }: PageProps<"/filiais">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/filiais"), searchParams]);
  const filtros = lerFiltros(sp);
  const [organizacoes, regionais, porOrganizacao, resultado] = await Promise.all([
    listarOrganizacoes(),
    listarRegionais(),
    contarUnidadesPorOrganizacao(),
    listarFiliais(filtros),
  ]);
  const admin = sessao.papel === "admin";
  const params = { q: filtros.q, grupo: filtros.grupo, regional: filtros.regional, status: filtros.status };
  const temFiltro = Boolean(filtros.q || filtros.grupo || filtros.regional || filtros.status !== "ativas");

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Filiais"
        descricao="Grupos, unidades (lojas e empresas de apoio) e seus responsáveis. A unidade é a base de todo o sistema."
        acoes={
          admin ? (
            <Button className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85" nativeButton={false} render={<Link href="/filiais/nova" />}>
              <Plus data-icon="inline-start" />
              Nova unidade
            </Button>
          ) : undefined
        }
      />

      {sp.salvo === "grupo" && <AvisoSucesso mensagem="Grupo atualizado." />}
      {sp.erro === "sem_permissao" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Só administradores podem cadastrar ou alterar unidades.</p>
        </div>
      )}

      {/* Grupos (empresas) */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        {organizacoes.map((o) => {
          const c = porOrganizacao.get(o.id) ?? { total: 0, ativas: 0 };
          const filtrando = filtros.grupo === o.id;
          return (
            <div key={o.id} className={`rounded-xl border bg-card p-4 ${filtrando ? "border-fct-navy/40" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-fct-navy/6 text-fct-navy">
                    <Building2 className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{o.nome_fantasia ?? o.razao_social}</p>
                    <p className="truncate text-sm text-muted-foreground">{o.razao_social}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {o.cnpj ? <span className="font-mono">{o.cnpj}</span> : "CNPJ não informado"} ·{" "}
                      {pluralizar(c.ativas, "unidade ativa", "unidades ativas")}
                      {c.total !== c.ativas ? ` · ${c.total - c.ativas} inativa(s)` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/filiais?grupo=${o.id}`} />}>
                    Ver unidades
                  </Button>
                  {admin && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/filiais/empresas/${o.id}/editar`} />}>
                      Editar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* Filtros */}
      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Código, nome, razão social ou CNPJ" className="pl-8" aria-label="Buscar unidade" />
        </div>
        <SelectNativo name="grupo" defaultValue={filtros.grupo ?? ""} aria-label="Grupo" className="sm:w-40">
          <option value="">Todos os grupos</option>
          {organizacoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome_fantasia ?? o.razao_social}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="regional" defaultValue={filtros.regional ?? ""} aria-label="Regional" className="sm:w-44">
          <option value="">Todas as regionais</option>
          {regionais.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="status" defaultValue={filtros.status} aria-label="Status" className="sm:w-32">
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
          <option value="todas">Todas</option>
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/filiais" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      {/* Lista */}
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Código</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="hidden md:table-cell">Grupo</TableHead>
              <TableHead className="hidden md:table-cell">Regional</TableHead>
              <TableHead className="hidden lg:table-cell">CNPJ</TableHead>
              <TableHead className="hidden lg:table-cell">Responsável</TableHead>
              <TableHead className="text-right">Func.</TableHead>
              <TableHead className="w-24">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  Nenhuma unidade encontrada com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link href={`/filiais/${b.id}`} className="font-mono font-semibold text-fct-navy hover:underline">
                      {b.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link href={`/filiais/${b.id}`} className="font-medium hover:underline">
                      {b.nome}
                    </Link>
                    {b.razao_social && <p className="truncate text-xs text-muted-foreground">{b.razao_social}</p>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{b.organizations?.nome_fantasia ?? "—"}</TableCell>
                  <TableCell className="hidden md:table-cell">{b.regional ?? "—"}</TableCell>
                  <TableCell className="hidden font-mono text-xs lg:table-cell">{b.cnpj ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{b.responsavel?.nome ?? b.responsavel_nome ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.funcionarios}</TableCell>
                  <TableCell>
                    <BadgeAtivo ativo={b.ativo} />
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
