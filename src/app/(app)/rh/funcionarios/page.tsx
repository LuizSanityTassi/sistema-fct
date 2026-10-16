import Link from "next/link";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { BadgeStatusFuncionario } from "@/components/layout/badge-status";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import {
  contarPorStatus,
  lerFiltrosFuncionarios,
  listarCargos,
  listarFuncionarios,
  listarUnidadesParaSelecao,
  TAMANHO_PAGINA,
} from "@/lib/data/funcionarios";
import { formatarData } from "@/lib/formatos";

export const metadata = { title: "Funcionários" };

export default async function FuncionariosPage({ searchParams }: PageProps<"/rh/funcionarios">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/rh/funcionarios"), searchParams]);
  const filtros = lerFiltrosFuncionarios(sp);
  const [unidades, cargos, contagem, resultado] = await Promise.all([
    listarUnidadesParaSelecao(),
    listarCargos(),
    contarPorStatus(),
    listarFuncionarios(filtros),
  ]);
  const podeEditar = sessao.papel === "admin" || sessao.papel === "rh";
  const params = { q: filtros.q, filial: filtros.filial, cargo: filtros.cargo, situacao: filtros.situacao };
  const temFiltro = Boolean(filtros.q || filtros.filial || filtros.cargo || filtros.situacao !== "ativos");
  const unidadeFiltrada = filtros.filial ? unidades.find((u) => u.id === filtros.filial) : undefined;

  const grupos = new Map<string, typeof unidades>();
  for (const u of unidades) grupos.set(u.grupo, [...(grupos.get(u.grupo) ?? []), u]);

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="Funcionários"
        descricao={
          sessao.papel === "gerente"
            ? "Funcionários das unidades sob sua responsabilidade."
            : "Cadastro, situação e histórico dos funcionários — sempre vinculados a uma unidade."
        }
        acoes={
          podeEditar ? (
            <Button className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85" nativeButton={false} render={<Link href="/rh/funcionarios/novo" />}>
              <Plus data-icon="inline-start" />
              Novo funcionário
            </Button>
          ) : undefined
        }
      />

      {sp.erro === "sem_permissao" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Só Administrador e RH podem cadastrar ou alterar funcionários.</p>
        </div>
      )}

      {/* Resumo por situação */}
      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Ativos", contagem.ativo, "ativos"],
            ["Afastados", contagem.afastado, null],
            ["Em férias", contagem.ferias, null],
            ["Desligados", contagem.desligado, "desligados"],
          ] as const
        ).map(([rotulo, valor, situacao]) => (
          <div key={rotulo} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {situacao ? (
                <Link href={`/rh/funcionarios?situacao=${situacao}`} className="hover:underline">
                  {valor}
                </Link>
              ) : (
                valor
              )}
            </p>
          </div>
        ))}
      </section>

      {/* Filtros */}
      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome, matrícula ou cargo" className="pl-8" aria-label="Buscar funcionário" />
        </div>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="sm:w-52">
          <option value="">Todas as unidades</option>
          {[...grupos.entries()].map(([grupo, lista]) => (
            <optgroup key={grupo} label={grupo}>
              {lista.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} — {u.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <SelectNativo name="cargo" defaultValue={filtros.cargo ?? ""} aria-label="Cargo" className="sm:w-48">
          <option value="">Todos os cargos</option>
          {cargos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="situacao" defaultValue={filtros.situacao} aria-label="Situação" className="sm:w-36">
          <option value="ativos">Em atividade</option>
          <option value="desligados">Desligados</option>
          <option value="todos">Todos</option>
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/rh/funcionarios" />}>
            Limpar
          </Button>
        ) : (
          <span />
        )}
      </form>

      {unidadeFiltrada && (
        <p className="mb-3 text-sm text-muted-foreground">
          Mostrando a unidade <strong>{unidadeFiltrada.codigo} — {unidadeFiltrada.nome}</strong>.{" "}
          <Link href={`/filiais/${unidadeFiltrada.id}`} className="underline">
            Ver unidade
          </Link>
        </p>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Matrícula</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">Cargo</TableHead>
              <TableHead className="hidden sm:table-cell">Unidade</TableHead>
              <TableHead className="hidden lg:table-cell">Admissão</TableHead>
              <TableHead className="w-28">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  Nenhum funcionário encontrado com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-mono text-xs">{f.matricula ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/rh/funcionarios/${f.id}`} className="font-medium hover:underline">
                      {f.nome}
                    </Link>
                    <p className="text-xs text-muted-foreground md:hidden">{f.cargo ?? ""}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{f.cargo ?? "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {f.unidade ? (
                      <Link href={`/filiais/${f.unidade.id}`} className="hover:underline">
                        <span className="font-mono text-xs text-fct-navy">{f.unidade.codigo}</span> {f.unidade.nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{formatarData(f.data_admissao)}</TableCell>
                  <TableCell>
                    <BadgeStatusFuncionario status={f.status} />
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
