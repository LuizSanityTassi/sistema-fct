import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import {
  contarSemRegistro,
  lerFiltrosFolha,
  listarCompetencias,
  listarFolha,
  resumoFolha,
  TAMANHO_PAGINA,
} from "@/lib/data/folha";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { formatarMoeda, pluralizar } from "@/lib/formatos";
import { competenciaAtual, competenciaValida, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import type { StatusFolha } from "@/lib/rh/rotulos";
import { alterarStatusFolha, gerarFolha } from "./actions";
import { BadgeFolha } from "./badge-folha";

export const metadata = { title: "Folha de pagamento" };

export default async function FolhaPage({ searchParams }: PageProps<"/rh/folha">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/rh/folha"), searchParams]);
  const pedido = typeof sp.competencia === "string" ? sp.competencia : undefined;
  const competencia = competenciaValida(pedido) ? pedido : competenciaAtual();
  const filtros = lerFiltrosFolha(sp);
  const [competencias, resumo, semRegistro, unidades, resultado] = await Promise.all([
    listarCompetencias(),
    resumoFolha(competencia),
    contarSemRegistro(competencia),
    listarUnidadesParaSelecao(),
    listarFolha(competencia, filtros),
  ]);
  const podeEditar = sessao.papel === "admin" || sessao.papel === "rh";
  const admin = sessao.papel === "admin";
  const params = { competencia, q: filtros.q, filial: filtros.filial };

  const statusGeral: StatusFolha | "vazia" =
    resumo.total === 0 ? "vazia" : resumo.paga === resumo.total ? "paga" : resumo.rascunho === 0 ? "fechada" : "rascunho";
  const opcoesCompetencia = [...new Set([competenciaAtual(), somarMeses(competenciaAtual(), 1), ...competencias, competencia])].sort().reverse();

  const gerados = typeof sp.gerados === "string" ? Number(sp.gerados) : null;
  const semSalario = typeof sp.sem_salario === "string" ? Number(sp.sem_salario) : 0;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const statusMsg = typeof sp.status === "string" ? sp.status : null;

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Folha de pagamento"
        descricao="Registro mensal por funcionário com INSS, IRRF e FGTS estimados pelas tabelas de 2026. A folha oficial continua sendo a da contabilidade."
      />

      {/* Competência */}
      <section className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/rh/folha?competencia=${somarMeses(competencia, -1)}`} aria-label="Mês anterior" />}>
            <ChevronLeft />
          </Button>
          <form method="get" className="flex items-center gap-2">
            <SelectNativo name="competencia" defaultValue={competencia} aria-label="Competência" className="w-48 font-medium">
              {opcoesCompetencia.map((c) => (
                <option key={c} value={c}>
                  {rotuloCompetencia(c)}
                </option>
              ))}
            </SelectNativo>
            <Button type="submit" variant="outline" size="sm">
              Ir
            </Button>
          </form>
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link href={`/rh/folha?competencia=${somarMeses(competencia, 1)}`} aria-label="Próximo mês" />}>
            <ChevronRight />
          </Button>
          {statusGeral !== "vazia" && <BadgeFolha status={statusGeral} />}
        </div>
        {podeEditar && (
          <div className="flex flex-wrap items-center gap-2">
            {semRegistro > 0 && (
              <ConfirmarAcao
                titulo={`Gerar folha de ${rotuloCompetencia(competencia)}?`}
                descricao={`Cria o registro (em elaboração) de ${pluralizar(semRegistro, "funcionário", "funcionários")} em atividade a partir do salário vigente. Quem não tem salário cadastrado fica de fora.`}
                rotuloBotao={resumo.total === 0 ? "Gerar folha" : `Gerar para ${semRegistro} sem registro`}
                rotuloConfirmar="Gerar"
                action={gerarFolha}
                campos={{ competencia }}
              />
            )}
            {statusGeral === "rascunho" && (
              <ConfirmarAcao
                titulo="Fechar competência?"
                descricao="Os registros deixam de ser editáveis. Só o administrador pode reabrir."
                rotuloBotao="Fechar competência"
                rotuloConfirmar="Fechar"
                action={alterarStatusFolha}
                campos={{ competencia, status: "fechada" }}
              />
            )}
            {statusGeral === "fechada" && (
              <ConfirmarAcao
                titulo="Marcar como paga?"
                descricao="Registra a data de pagamento da competência."
                rotuloBotao="Marcar como paga"
                rotuloConfirmar="Confirmar"
                action={alterarStatusFolha}
                campos={{ competencia, status: "paga" }}
              />
            )}
            {admin && (statusGeral === "fechada" || statusGeral === "paga") && (
              <ConfirmarAcao
                titulo="Reabrir competência?"
                descricao="Volta todos os registros para 'em elaboração' e limpa as datas de fechamento/pagamento."
                rotuloBotao="Reabrir"
                variant="destructive"
                action={alterarStatusFolha}
                campos={{ competencia, status: "rascunho" }}
              />
            )}
          </div>
        )}
      </section>

      {gerados !== null && (
        <div className="mb-4">
          <AvisoSucesso
            mensagem={`Folha gerada para ${pluralizar(gerados, "funcionário", "funcionários")}.${semSalario > 0 ? ` ${semSalario} sem salário cadastrado ficaram de fora.` : ""}`}
          />
        </div>
      )}
      {sp.salvo === "1" && (
        <div className="mb-4">
          <AvisoSucesso mensagem="Registro salvo e recalculado." />
        </div>
      )}
      {statusMsg && (
        <div className="mb-4">
          <AvisoSucesso mensagem={`Competência ${statusMsg === "rascunho" ? "reaberta" : statusMsg === "paga" ? "marcada como paga" : "fechada"}.`} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      {/* Resumo */}
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Funcionários", String(resumo.total), semRegistro > 0 ? `${semRegistro} sem registro` : null],
          ["Bruto", formatarMoeda(resumo.bruto), null],
          ["Descontos", formatarMoeda(resumo.inss + resumo.irrf + resumo.outrosDescontos), `INSS ${formatarMoeda(resumo.inss)} · IRRF ${formatarMoeda(resumo.irrf)}`],
          ["Líquido", formatarMoeda(resumo.liquido), null],
          ["FGTS (empresa)", formatarMoeda(resumo.fgts), "custo, não desconto"],
        ].map(([rotulo, valor, nota]) => (
          <div key={rotulo as string} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
            {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
          </div>
        ))}
      </section>

      {/* Filtros */}
      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
        <input type="hidden" name="competencia" value={competencia} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Nome do funcionário" className="pl-8" aria-label="Buscar funcionário" />
        </div>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="sm:w-52">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
        {filtros.q || filtros.filial ? (
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`/rh/folha?competencia=${competencia}`} />}>
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
              <TableHead className="hidden md:table-cell">Unidade</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Extras + adic.</TableHead>
              <TableHead className="hidden text-right lg:table-cell">INSS</TableHead>
              <TableHead className="hidden text-right lg:table-cell">IRRF</TableHead>
              <TableHead className="hidden text-right xl:table-cell">Outros</TableHead>
              <TableHead className="text-right">Líquido</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="w-28 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  {resumo.total === 0
                    ? `Nenhuma folha gerada para ${rotuloCompetencia(competencia)}.`
                    : "Nenhum registro encontrado com esses filtros."}
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/rh/funcionarios/${r.employees.id}`} className="font-medium hover:underline">
                      {r.employees.nome}
                    </Link>
                    {r.employees.matricula && <span className="ml-2 font-mono text-xs text-muted-foreground">{r.employees.matricula}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.employees.branches ? (
                      <>
                        <span className="font-mono text-xs text-fct-navy">{r.employees.branches.codigo}</span> {r.employees.branches.nome}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(r.salario_base)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(Number(r.horas_extras) + Number(r.adicionais))}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(r.inss)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatarMoeda(r.irrf)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">{formatarMoeda(r.outros_descontos)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatarMoeda(r.valor_liquido)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <BadgeFolha status={r.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2 text-sm">
                      {r.storage_path && (
                        <a href={`/api/arquivos/holerite/${r.id}`} className="inline-flex items-center gap-1 text-fct-navy underline" title="Holerite">
                          <Download className="size-3.5" aria-hidden />
                        </a>
                      )}
                      {podeEditar && (
                        <Link href={`/rh/folha/${r.id}`} className="text-fct-navy underline">
                          {r.status === "rascunho" ? "Editar" : "Ver"}
                        </Link>
                      )}
                    </div>
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
