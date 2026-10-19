import Link from "next/link";
import { Search, TriangleAlert } from "lucide-react";
import { AvisoSucesso, SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { PROBLEMA_LABEL, PROBLEMAS, STATUS_PENDENCIA, STATUS_PENDENCIA_LABEL } from "@/lib/conciliacao/rotulos";
import { lerFiltrosPendencias, listarPendencias, listarResponsaveis, mapaFiliais } from "@/lib/data/conciliacao";
import { descreverPeriodo, formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { alterarStatusPendencias, atribuirPendencias } from "../actions";
import { BadgePrioridadePendencia, BadgeStatusPendencia, Filial } from "../badges-conc";
import { AcoesPendencias } from "./acoes-pendencias";

export const metadata = { title: "Pendências da conciliação" };

export default async function PendenciasPage({ searchParams }: PageProps<"/conciliacao/pendencias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/conciliacao/pendencias"), searchParams]);
  const filtros = lerFiltrosPendencias(sp);
  const [lista, responsaveis, filiais] = await Promise.all([listarPendencias(filtros, sessao.id), listarResponsaveis(), mapaFiliais()]);
  const escreve = podeConciliar(sessao.papel);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const ok = typeof sp.ok === "string" ? Number(sp.ok) : null;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ status: filtros.status, prioridade: filtros.prioridade ? String(filtros.prioridade) : undefined, problema: filtros.problema, filial: filtros.filial !== undefined ? String(filtros.filial) : undefined, responsavel: filtros.responsavel, q: filtros.q, ordem: filtros.ordem })) {
    if (v) query.set(k, v);
  }
  const voltar = `/conciliacao/pendencias?${query.toString()}`;
  const totalValor = lista.reduce((s, p) => s + Number(p.valor), 0);
  const filiaisComPendencia = [...new Set(lista.map((p) => p.filial).filter((f): f is number => f != null))].sort((a, b) => a - b);

  return (
    <>
      <PageHeader
        eyebrow="Conciliação"
        titulo="Pendências"
        descricao="Divergências encontradas nas conciliações. Resolvem sozinhas quando conciliam ou são enviadas ao Omie; o resto é decidido aqui, com motivo."
      />

      {ok !== null && Number.isFinite(ok) && (
        <div className="mb-4">
          <AvisoSucesso mensagem={`${pluralizar(ok, "pendência atualizada", "pendências atualizadas")}.`} />
        </div>
      )}
      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <SelectNativo name="status" defaultValue={filtros.status} aria-label="Situação">
          <option value="abertas">Abertas (pendente + em análise)</option>
          {STATUS_PENDENCIA.map((s) => (
            <option key={s} value={s}>
              {STATUS_PENDENCIA_LABEL[s]}
            </option>
          ))}
          <option value="todas">Todas</option>
        </SelectNativo>
        <SelectNativo name="prioridade" defaultValue={filtros.prioridade ?? ""} aria-label="Prioridade">
          <option value="">Qualquer prioridade</option>
          <option value="3">Alta</option>
          <option value="2">Média</option>
          <option value="1">Baixa</option>
        </SelectNativo>
        <SelectNativo name="problema" defaultValue={filtros.problema ?? ""} aria-label="Problema">
          <option value="">Qualquer problema</option>
          {PROBLEMAS.map((p) => (
            <option key={p} value={p}>
              {PROBLEMA_LABEL[p]}
            </option>
          ))}
        </SelectNativo>
        <Input name="filial" type="number" min={1} max={9999} defaultValue={filtros.filial ?? ""} placeholder="Filial" aria-label="Filial" />
        <SelectNativo name="responsavel" defaultValue={filtros.responsavel ?? ""} aria-label="Responsável">
          <option value="">Qualquer responsável</option>
          <option value="eu">Minhas</option>
          <option value="sem">Sem responsável</option>
          {responsaveis.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="ordem" defaultValue={filtros.ordem} aria-label="Ordenar por">
          <option value="prioridade">Prioridade</option>
          <option value="vencimento">Vencimento</option>
          <option value="valor">Maior valor</option>
          <option value="filial">Filial</option>
          <option value="antigas">Mais antigas</option>
        </SelectNativo>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={filtros.q ?? ""} placeholder="Beneficiário, documento, motivo" className="pl-8" aria-label="Buscar" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao/pendencias" />}>
            Limpar
          </Button>
        </div>
      </form>

      <p className="mb-3 text-xs text-muted-foreground">
        {pluralizar(lista.length, "pendência", "pendências")} · {formatarMoeda(totalValor)}
        {filiaisComPendencia.length ? ` · filiais ${filiaisComPendencia.join(", ")}` : ""}
      </p>

      {escreve && lista.length > 0 && <AcoesPendencias chaves={lista.map((p) => p.chave)} responsaveis={responsaveis} voltar={voltar} alterarStatus={alterarStatusPendencias} atribuir={atribuirPendencias} />}

      <form id="form-pendencias" className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {escreve && <TableHead className="w-8"></TableHead>}
              <TableHead className="w-20">Prior.</TableHead>
              <TableHead className="w-16">Filial</TableHead>
              <TableHead>Beneficiário / problema</TableHead>
              <TableHead className="hidden lg:table-cell">Documentos</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="w-28">Vencimento</TableHead>
              <TableHead className="hidden md:table-cell">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.length === 0 ? (
              <TableRow>
                <TableCell colSpan={escreve ? 8 : 7} className="vazio">
                  Nenhuma pendência com esses filtros.
                </TableCell>
              </TableRow>
            ) : (
              lista.map((p) => (
                <TableRow key={p.chave}>
                  {escreve && (
                    <TableCell>
                      <input type="checkbox" name="chave" value={p.chave} className="size-4 accent-fct-tinta" aria-label={`Selecionar ${p.beneficiario ?? p.chave}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <BadgePrioridadePendencia prioridade={p.prioridade} />
                  </TableCell>
                  <TableCell>
                    <Filial filial={p.filial} nome={p.filial != null ? filiais.porFilial.get(p.filial)?.nome : null} />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{p.beneficiario ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROBLEMA_LABEL[p.problema as keyof typeof PROBLEMA_LABEL] ?? p.problema}
                      {p.cnpj ? ` · ${p.cnpj}` : ""}
                      {p.detalhe ? ` · ${p.detalhe}` : ""}
                    </p>
                    {p.motivo && (
                      <p className="text-xs text-foreground/80">
                        {STATUS_PENDENCIA_LABEL[p.status]}: {p.motivo}
                        {p.quem_dec?.nome ? ` (${p.quem_dec.nome}${p.decidido_em ? `, ${formatarData(p.decidido_em)}` : ""})` : ""}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground lg:hidden">{p.documento}</p>
                  </TableCell>
                  <TableCell className="hidden max-w-xs truncate text-xs text-muted-foreground lg:table-cell" title={p.documento ?? undefined}>
                    {p.documento ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(p.valor)}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatarData(p.vencimento)}
                    <p className="text-xs text-muted-foreground">há {descreverPeriodo(p.criado_em) ?? "—"}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-col items-start gap-1">
                      <BadgeStatusPendencia status={p.status} auto={p.auto} />
                      {p.quem_resp?.nome && <span className="text-xs text-muted-foreground">↳ {p.quem_resp.nome}</span>}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </form>
    </>
  );
}
