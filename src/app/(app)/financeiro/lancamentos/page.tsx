import Link from "next/link";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import {
  lerFiltrosLancamentos,
  listarCategorias,
  listarCompetenciasFinanceiro,
  listarLancamentos,
  listarMesesFechados,
  listarUnidadesFinanceiro,
  paramsDosFiltros,
  TAMANHO_PAGINA,
  temFiltro,
  totaisLancamentos,
} from "@/lib/data/financeiro";
import { moedaFin } from "@/lib/financeiro/formatos";
import { podeFecharMes, podeLancar, podeReabrirMes } from "@/lib/financeiro/permissoes";
import { GRUPOS_FINANCEIROS, ORIGEM_FIN_LABEL, ordemGrupo, TIPO_FIN_LABEL, TIPOS_FIN } from "@/lib/financeiro/rotulos";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia } from "@/lib/rh/competencia";
import { Constants } from "@/lib/supabase/types";
import { BadgeMesFechado, BadgeOrigemFin, BadgeTipoFin, RotuloGrupo, ValorTipo } from "../badges-fin";
import { alterarFechamentoMes } from "./actions";

export const metadata = { title: "Lançamentos" };

export default async function LancamentosPage({ searchParams }: PageProps<"/financeiro/lancamentos">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/lancamentos"), searchParams]);
  const filtros = lerFiltrosLancamentos(sp);
  const [unidades, categorias, competencias, fechados, resultado, totais] = await Promise.all([
    listarUnidadesFinanceiro(),
    listarCategorias(),
    listarCompetenciasFinanceiro(),
    listarMesesFechados(),
    listarLancamentos(filtros),
    totaisLancamentos(filtros),
  ]);
  const escreve = podeLancar(sessao.papel);
  const params = paramsDosFiltros(filtros);
  const competencia = filtros.competencia;
  const fechamento = competencia ? fechados.find((m) => m.competencia === competencia) : undefined;
  const opcoesCompetencia = [...new Set([competenciaAtual(), ...competencias, ...(competencia ? [competencia] : [])])].sort().reverse();
  const fechadoSet = new Set(fechados.map((m) => m.competencia));

  const gruposUnidade = new Map<string, typeof unidades>();
  for (const u of unidades) gruposUnidade.set(u.grupo, [...(gruposUnidade.get(u.grupo) ?? []), u]);
  const gruposCategoria = new Map<string, typeof categorias>();
  for (const c of categorias) {
    if (!c.ativo && c.id !== filtros.categoria) continue;
    const chave = `${TIPO_FIN_LABEL[c.tipo]} · ${c.grupo}`;
    gruposCategoria.set(chave, [...(gruposCategoria.get(chave) ?? []), c]);
  }

  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const aviso =
    sp.salvo === "1"
      ? "Lançamento salvo."
      : sp.excluido === "1"
        ? "Lançamento excluído."
        : sp.fechamento === "fechado"
          ? `Competência ${competencia ? rotuloCompetencia(competencia) : ""} fechada.`
          : sp.fechamento === "reaberto"
            ? `Competência ${competencia ? rotuloCompetencia(competencia) : ""} reaberta.`
            : null;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Lançamentos"
        descricao="Entradas e saídas realizadas por unidade. Filtre por competência, grupo, unidade ou categoria; as somas seguem o filtro."
        acoes={
          escreve ? (
            <Button className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85" nativeButton={false} render={<Link href="/financeiro/lancamentos/novo" />}>
              <Plus data-icon="inline-start" />
              Novo lançamento
            </Button>
          ) : undefined
        }
      />

      {aviso && (
        <div className="mb-4">
          <AvisoSucesso mensagem={aviso} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4">
        <SelectNativo name="competencia" defaultValue={competencia ?? ""} aria-label="Competência">
          <option value="">Todo o período</option>
          {opcoesCompetencia.map((c) => (
            <option key={c} value={c}>
              {rotuloCompetencia(c)}
              {fechadoSet.has(c) ? " (fechado)" : ""}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="grupo" defaultValue={filtros.grupo ?? ""} aria-label="Grupo">
          <option value="">Todos os grupos</option>
          {GRUPOS_FINANCEIROS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade">
          <option value="">Todas as unidades</option>
          {[...gruposUnidade.keys()].sort(ordemGrupo).map((grupo) => (
            <optgroup key={grupo} label={grupo}>
              {gruposUnidade.get(grupo)!.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} — {u.nome}
                  {u.ativo ? "" : " (inativa)"}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""} aria-label="Tipo">
          <option value="">Receber e pagar</option>
          {TIPOS_FIN.map((t) => (
            <option key={t} value={t}>
              {TIPO_FIN_LABEL[t]}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="categoria" defaultValue={filtros.categoria ?? ""} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {[...gruposCategoria.entries()].map(([grupo, lista]) => (
            <optgroup key={grupo} label={grupo}>
              {lista.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <SelectNativo name="origem" defaultValue={filtros.origem ?? ""} aria-label="Origem">
          <option value="">Qualquer origem</option>
          {Constants.public.Enums.fin_origem.map((o) => (
            <option key={o} value={o}>
              {ORIGEM_FIN_LABEL[o]}
            </option>
          ))}
        </SelectNativo>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Descrição" className="pl-8" aria-label="Buscar na descrição" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          {temFiltro(filtros) && (
            <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/lancamentos" />}>
              Limpar
            </Button>
          )}
        </div>
        {filtros.de || filtros.ate ? (
          <>
            <input type="hidden" name="de" value={filtros.de ?? ""} />
            <input type="hidden" name="ate" value={filtros.ate ?? ""} />
            <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
              Período: {filtros.de ? formatarData(filtros.de) : "início"} a {filtros.ate ? formatarData(filtros.ate) : "hoje"} (a competência, se escolhida, tem prioridade).
            </p>
          </>
        ) : null}
      </form>

      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Receitas", moedaFin(totais.receber.total), pluralizar(totais.receber.qtd, "lançamento", "lançamentos"), "text-emerald-700"],
          ["Despesas", moedaFin(totais.pagar.total), pluralizar(totais.pagar.qtd, "lançamento", "lançamentos"), "text-red-700"],
          ["Resultado", moedaFin(totais.resultado), "receitas − despesas", totais.resultado < 0 ? "text-red-700" : "text-emerald-700"],
          ["Lançamentos", String(totais.qtd), competencia ? rotuloCompetencia(competencia) : "no filtro atual", ""],
        ].map(([rotulo, valor, nota, tom]) => (
          <div key={rotulo} className="rounded-xl border bg-card px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
            <p className={`mt-1 text-xl font-bold tracking-tight tabular-nums ${tom}`}>{valor}</p>
            <p className="text-xs text-muted-foreground">{nota}</p>
          </div>
        ))}
      </section>

      {competencia && (podeFecharMes(sessao.papel) || fechamento) && (
        <section className="mb-4 flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{rotuloCompetencia(competencia)}</span>
            {fechamento ? (
              <>
                <BadgeMesFechado />
                <span className="text-xs text-muted-foreground">
                  por {fechamento.quem?.nome ?? "—"} em {formatarData(fechamento.fechado_em)}
                </span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Mês aberto: lançamentos podem ser incluídos e alterados.</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!fechamento && podeFecharMes(sessao.papel) && (
              <ConfirmarAcao
                titulo={`Fechar ${rotuloCompetencia(competencia)}?`}
                descricao="Ninguém mais inclui, altera ou exclui lançamentos desse mês. Só o administrador reabre."
                rotuloBotao="Fechar mês"
                rotuloConfirmar="Fechar"
                action={alterarFechamentoMes}
                campos={{ competencia, acao: "fechar" }}
              />
            )}
            {fechamento && podeReabrirMes(sessao.papel) && (
              <ConfirmarAcao
                titulo={`Reabrir ${rotuloCompetencia(competencia)}?`}
                descricao="O mês volta a aceitar lançamentos e alterações. A reabertura fica registrada na auditoria."
                rotuloBotao="Reabrir mês"
                rotuloConfirmar="Reabrir"
                variant="destructive"
                action={alterarFechamentoMes}
                campos={{ competencia, acao: "reabrir" }}
              />
            )}
          </div>
        </section>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Data</TableHead>
              <TableHead>Unidade</TableHead>
              <TableHead className="hidden md:table-cell">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell">Descrição</TableHead>
              <TableHead className="hidden xl:table-cell">Origem</TableHead>
              <TableHead className="hidden sm:table-cell">Tipo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              {escreve && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={escreve ? 8 : 7} className="py-10 text-center text-muted-foreground">
                  {temFiltro(filtros) ? "Nenhum lançamento com esses filtros." : "Nenhum lançamento registrado ainda."}
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="tabular-nums">{formatarData(l.data)}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-fct-navy">{l.unidade?.codigo}</span> {l.unidade?.nome}
                    <p className="text-xs md:hidden">
                      {l.categoria?.grupo} › {l.categoria?.nome}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p>{l.categoria?.nome}</p>
                    <p className="text-xs text-muted-foreground">{l.categoria?.grupo}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-muted-foreground lg:table-cell" title={l.descricao ?? undefined}>
                    {l.descricao || "—"}
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <BadgeOrigemFin origem={l.origem} />
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <BadgeTipoFin tipo={l.tipo} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <ValorTipo tipo={l.tipo}>{formatarMoeda(l.valor)}</ValorTipo>
                  </TableCell>
                  {escreve && (
                    <TableCell className="text-right">
                      <Link href={`/financeiro/lancamentos/${l.id}/editar`} className="text-sm text-fct-navy underline">
                        {fechadoSet.has(l.competencia.trim()) && sessao.papel !== "admin" ? "Ver" : "Editar"}
                      </Link>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} tamanho={TAMANHO_PAGINA} params={params} />
        </div>
      </div>

      {filtros.grupo && (
        <p className="mt-3 text-xs text-muted-foreground">
          Grupo <RotuloGrupo grupo={filtros.grupo} className="text-xs" />: {pluralizar(gruposUnidade.get(filtros.grupo)?.length ?? 0, "unidade", "unidades")} consideradas.
        </p>
      )}
    </>
  );
}
