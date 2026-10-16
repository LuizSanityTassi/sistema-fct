import Link from "next/link";
import { Download, Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosAso, listarAsos, resumoAso, TAMANHO_PAGINA } from "@/lib/data/documentos";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { formatarData } from "@/lib/formatos";
import { ASO_TIPO_LABEL } from "@/lib/rh/rotulos";
import { BadgeAso } from "../funcionarios/[id]/documentos-aso";

export const metadata = { title: "ASO" };

export default async function AsoPage({ searchParams }: PageProps<"/rh/aso">) {
  const [, sp] = await Promise.all([exigirAcesso("/rh/aso"), searchParams]);
  const filtros = lerFiltrosAso(sp);
  const [unidades, resumo, resultado] = await Promise.all([listarUnidadesParaSelecao(), resumoAso(), listarAsos(filtros)]);
  const params = { q: filtros.q, filial: filtros.filial, tipo: filtros.tipo, situacao: filtros.situacao };
  const temFiltro = Boolean(filtros.q || filtros.filial || filtros.tipo || filtros.situacao !== "todos");

  const cartoes = [
    { rotulo: "Vencidos", valor: resumo.vencidos, href: "/rh/aso?situacao=vencidos", classe: "text-red-700" },
    { rotulo: "Vencem em 30 dias", valor: resumo.proximos, href: "/rh/aso?situacao=proximos", classe: "text-amber-700" },
    { rotulo: "Válidos", valor: resumo.validos, href: "/rh/aso?situacao=validos", classe: "text-emerald-700" },
    { rotulo: "Funcionários sem ASO", valor: resumo.semAso, href: null, classe: "" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="ASO"
        descricao="Atestados de Saúde Ocupacional dos funcionários em atividade. O registro é feito na ficha de cada um."
      />

      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{c.rotulo}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${c.classe}`}>
              {c.href ? (
                <Link href={c.href} className="hover:underline">
                  {c.valor}
                </Link>
              ) : (
                c.valor
              )}
            </p>
          </div>
        ))}
      </section>

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-center">
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
        <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""} aria-label="Tipo" className="sm:w-44">
          <option value="">Todos os tipos</option>
          {Object.entries(ASO_TIPO_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="situacao" defaultValue={filtros.situacao} aria-label="Situação" className="sm:w-40">
          <option value="todos">Todas as situações</option>
          <option value="vencidos">Vencidos</option>
          <option value="proximos">Vencem em 30 dias</option>
          <option value="validos">Válidos</option>
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/rh/aso" />}>
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
              <TableHead>Tipo</TableHead>
              <TableHead className="hidden md:table-cell">Exame</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="w-20 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Nenhum ASO encontrado.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <Link href={`/rh/funcionarios/${a.employees.id}#aso`} className="font-medium hover:underline">
                      {a.employees.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {a.employees.branches ? (
                      <>
                        <span className="font-mono text-xs text-fct-tinta">{a.employees.branches.codigo}</span> {a.employees.branches.nome}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{ASO_TIPO_LABEL[a.tipo]}</TableCell>
                  <TableCell className="hidden md:table-cell">{formatarData(a.data_realizacao)}</TableCell>
                  <TableCell>{formatarData(a.data_validade)}</TableCell>
                  <TableCell>
                    <BadgeAso validade={a.data_validade} />
                  </TableCell>
                  <TableCell className="text-right">
                    {a.storage_path && (
                      <a href={`/api/arquivos/aso/${a.id}`} className="inline-flex items-center gap-1 text-sm text-fct-tinta underline">
                        <Download className="size-3.5" aria-hidden /> Laudo
                      </a>
                    )}
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
