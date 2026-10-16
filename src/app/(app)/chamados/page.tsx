import Link from "next/link";
import { ChartColumn, Plus, Search } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { CATEGORIA_CHAMADO_LABEL, PRIORIDADE_LABEL, STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";
import { COR_SLA, situacaoSla } from "@/lib/chamados/sla";
import { podeAcessar } from "@/lib/nav";
import { lerFiltrosChamados, listarChamados, resumoChamados, TAMANHO_PAGINA } from "@/lib/data/chamados";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { formatarDataHora } from "@/lib/formatos";
import { BadgeCategoria, BadgePrioridade, BadgeStatusChamado } from "./badges-chamado";

export const metadata = { title: "Chamados" };

export default async function ChamadosPage({ searchParams }: PageProps<"/chamados">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/chamados"), searchParams]);
  const filtros = lerFiltrosChamados(sp);
  const [resumo, unidades, resultado] = await Promise.all([
    resumoChamados(),
    listarUnidadesParaSelecao(),
    listarChamados(filtros, sessao.id),
  ]);
  const params = {
    q: filtros.q,
    visao: filtros.visao,
    status: filtros.status,
    categoria: filtros.categoria,
    prioridade: filtros.prioridade,
    filial: filtros.filial,
    sla: filtros.sla,
  };
  const temFiltro = Boolean(filtros.q || filtros.categoria || filtros.prioridade || filtros.filial || filtros.sla || filtros.status !== "abertos" || filtros.visao !== "todos");

  const cartoes = [
    { rotulo: "SLA estourado", valor: resumo.slaEstourado, href: "/chamados?sla=estourado", classe: resumo.slaEstourado ? "text-red-700" : "text-emerald-700" },
    { rotulo: "Abertos sem responsável", valor: resumo.semResponsavel, href: "/chamados?status=aberto", classe: "text-amber-700" },
    { rotulo: "Em andamento", valor: resumo.emAndamento, href: "/chamados?status=em_atendimento", classe: "text-sky-700" },
    { rotulo: "Aguardando", valor: resumo.aguardando, href: "/chamados?status=aguardando_usuario", classe: "text-violet-700" },
    { rotulo: "Resolvidos (30 dias)", valor: resumo.resolvidos30, href: "/chamados?status=resolvido", classe: "text-emerald-700" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Chamados"
        descricao="Abertura e acompanhamento de solicitações de TI, RH, financeiro, manutenção e compras."
        acoes={
          <>
            {podeAcessar(sessao.papel, "/chamados/indicadores") && (
              <Button variant="outline" nativeButton={false} render={<Link href="/chamados/indicadores" />}>
                <ChartColumn data-icon="inline-start" />
                Indicadores
              </Button>
            )}
            <Button className="bg-fct-yellow text-fct-tinta hover:bg-fct-yellow/85" nativeButton={false} render={<Link href="/chamados/novo" />}>
              <Plus data-icon="inline-start" />
              Novo chamado
            </Button>
          </>
        }
      />

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cartoes.map((c) => (
          <div key={c.rotulo} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{c.rotulo}</p>
            <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${c.classe}`}>
              <Link href={c.href} className="hover:underline">
                {c.valor}
              </Link>
            </p>
          </div>
        ))}
      </section>

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto] lg:items-center">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Número ou título" className="pl-8" aria-label="Buscar chamado" />
        </div>
        <SelectNativo name="visao" defaultValue={filtros.visao} aria-label="Visão" className="lg:w-36">
          <option value="todos">Todos que vejo</option>
          <option value="meus">Abertos por mim</option>
          <option value="atendo">Que eu atendo</option>
        </SelectNativo>
        <SelectNativo name="status" defaultValue={filtros.status} aria-label="Situação" className="lg:w-44">
          <option value="abertos">Em aberto</option>
          <option value="encerrados">Encerrados</option>
          <option value="todos">Todas as situações</option>
          <optgroup label="Específica">
            {Object.entries(STATUS_CHAMADO_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </optgroup>
        </SelectNativo>
        <SelectNativo name="categoria" defaultValue={filtros.categoria ?? ""} aria-label="Categoria" className="lg:w-36">
          <option value="">Toda categoria</option>
          {Object.entries(CATEGORIA_CHAMADO_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="prioridade" defaultValue={filtros.prioridade ?? ""} aria-label="Prioridade" className="lg:w-32">
          <option value="">Toda prioridade</option>
          {Object.entries(PRIORIDADE_LABEL).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="lg:w-44">
          <option value="">Toda unidade</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {temFiltro ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/chamados" />}>
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
              <TableHead className="w-16">Nº</TableHead>
              <TableHead>Chamado</TableHead>
              <TableHead className="hidden md:table-cell">Unidade</TableHead>
              <TableHead className="hidden lg:table-cell">Solicitante</TableHead>
              <TableHead className="hidden lg:table-cell">Responsável</TableHead>
              <TableHead className="hidden sm:table-cell">Prioridade</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="hidden md:table-cell">SLA (1ª resposta)</TableHead>
              <TableHead className="hidden xl:table-cell">Atualizado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Nenhum chamado encontrado.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">#{t.numero}</TableCell>
                  <TableCell>
                    <Link href={`/chamados/${t.id}`} className="font-medium hover:underline">
                      {t.titulo}
                    </Link>
                    <div className="mt-0.5">
                      <BadgeCategoria categoria={t.categoria} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {t.unidade ? (
                      <>
                        <span className="font-mono text-xs text-fct-tinta">{t.unidade.codigo}</span> {t.unidade.nome}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">{t.quem_abriu?.nome ?? "—"}</TableCell>
                  <TableCell className="hidden lg:table-cell">{t.quem_atende?.nome ?? <span className="text-muted-foreground">sem responsável</span>}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <BadgePrioridade prioridade={t.prioridade} />
                  </TableCell>
                  <TableCell>
                    <BadgeStatusChamado status={t.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {(() => {
                      const sla = situacaoSla(t);
                      return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${COR_SLA[sla.estado]}`}>{sla.texto}</span>;
                    })()}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground xl:table-cell">{formatarDataHora(t.updated_at)}</TableCell>
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
