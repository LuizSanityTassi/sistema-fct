import { cookies } from "next/headers";
import { COOKIE_VENC, comDatasGuardadas } from "@/lib/conciliacao/datas-filtro";
import { GuardarDatas } from "../guardar-datas";
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
import { Paginacao } from "@/components/layout/paginacao";
import { barrasDasPendencias, lerFiltrosPendencias, listarPendencias, listarResponsaveis, mapaFiliais, TAMANHO_PAGINA_PENDENCIAS } from "@/lib/data/conciliacao";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { alterarStatusPendencias, atribuirPendencias } from "../actions";
import { BadgePrioridadePendencia, BadgeStatusPendencia, Filial } from "../badges-conc";
import { AcoesPendencias } from "./acoes-pendencias";
import { FiltroBeneficiarios } from "./filtro-beneficiarios";

export const metadata = { title: "Pendências da conciliação" };

export default async function PendenciasPage({ searchParams }: PageProps<"/conciliacao/pendencias">) {
  const [sessao, spEndereco, biscoitos] = await Promise.all([exigirAcesso("/conciliacao/pendencias"), searchParams, cookies()]);
  // as datas do filtro continuam valendo ao voltar para esta tela
  const sp = comDatasGuardadas(spEndereco, biscoitos.get(COOKIE_VENC)?.value);
  const filtros = lerFiltrosPendencias(sp);
  const [{ lista, beneficiarios }, responsaveis, filiais] = await Promise.all([listarPendencias(filtros, sessao.id), listarResponsaveis(), mapaFiliais()]);
  const escreve = podeConciliar(sessao.papel);
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const ok = typeof sp.ok === "string" ? Number(sp.ok) : null;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ status: filtros.status, prioridade: filtros.prioridade ? String(filtros.prioridade) : undefined, problema: filtros.problema, filial: filtros.filial !== undefined ? String(filtros.filial) : undefined, responsavel: filtros.responsavel, q: filtros.q, venc_de: filtros.vencDe, venc_ate: filtros.vencAte, ordem: filtros.ordem, empresa: filtros.empresa, sem: filtros.semBeneficiarios.join("|") || undefined })) {
    if (v) query.set(k, v);
  }
  const paginas = Math.max(1, Math.ceil(lista.length / TAMANHO_PAGINA_PENDENCIAS));
  const paginaPedida = typeof sp.pagina === "string" ? Number.parseInt(sp.pagina, 10) : 1;
  const pagina = Number.isFinite(paginaPedida) && paginaPedida > 0 ? Math.min(paginaPedida, paginas) : 1;
  const naPagina = lista.slice((pagina - 1) * TAMANHO_PAGINA_PENDENCIAS, pagina * TAMANHO_PAGINA_PENDENCIAS);
  // título só no Trier não tem boleto, logo não tem código de barras
  const barras = await barrasDasPendencias(naPagina.filter((p) => p.problema !== "SO_TRIER").map((p) => p.chave));
  const voltar = `/conciliacao/pendencias?${query.toString()}${pagina > 1 ? `&pagina=${pagina}` : ""}`;
  const totalValor = lista.reduce((s, p) => s + Number(p.valor), 0);
  const filiaisComPendencia = [...new Set(lista.map((p) => p.filial).filter((f): f is number => f != null))].sort((a, b) => a - b);
  // Varela abaixo de 300, Nazário de 300 em diante (a mesma regra do envio ao Omie)
  const opcoesFilial = [...filiais.porFilial.entries()]
    .filter(([n]) => !filtros.empresa || (filtros.empresa === "nazario" ? n >= 300 : n < 300))
    .sort(([a], [b]) => a - b);
  const tirados = beneficiarios.filter((b) => b.tirado);

  return (
    <>
      <PageHeader
        eyebrow="DDA x Trier"
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

      <form method="get" className="mb-4 grid items-end gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
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
        <SelectNativo name="empresa" defaultValue={filtros.empresa ?? ""} aria-label="Empresa">
          <option value="">Varela e Nazário</option>
          <option value="varela">Só Varela (filiais até 299)</option>
          <option value="nazario">Só Nazário (filiais 300+)</option>
        </SelectNativo>
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Filial">
          <option value="">Todas as filiais</option>
          {opcoesFilial.map(([n, f]) => (
            <option key={n} value={n}>
              {String(n).padStart(3, "0")} · {f.nome}
            </option>
          ))}
        </SelectNativo>
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
        <FiltroBeneficiarios key={filtros.semBeneficiarios.join("|")} beneficiarios={beneficiarios} />
        <label className="text-xs text-muted-foreground">
          Vencimento de
          <Input name="venc_de" type="date" defaultValue={filtros.vencDe ?? ""} className="mt-1" />
        </label>
        <label className="text-xs text-muted-foreground">
          Vencimento até
          <Input name="venc_ate" type="date" defaultValue={filtros.vencAte ?? ""} className="mt-1" />
        </label>
        <div className="flex items-center gap-2">
          <Button type="submit" variant="outline">
            Filtrar
          </Button>
          <GuardarDatas de={filtros.vencDe} ate={filtros.vencAte} />
          <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/conciliacao/pendencias?venc_de=&venc_ate=" />}>
            Limpar
          </Button>
        </div>
      </form>

      <p className="mb-3 text-xs text-muted-foreground">
        {pluralizar(lista.length, "pendência", "pendências")} · {formatarMoeda(totalValor)}
        {filiaisComPendencia.length ? ` · filiais ${filiaisComPendencia.join(", ")}` : ""}
        {tirados.length > 0 && ` · fora da lista: ${tirados.map((b) => `${b.nome} (${b.qtd})`).join(", ")}`}
      </p>

      {escreve && lista.length > 0 && <AcoesPendencias chaves={naPagina.map((p) => p.chave)} responsaveis={responsaveis} voltar={voltar} alterarStatus={alterarStatusPendencias} atribuir={atribuirPendencias} />}

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
              naPagina.map((p) => (
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
                    {barras.get(p.chave) && (
                      <p className="text-xs text-muted-foreground">
                        Código de barras: <span className="font-mono break-all select-all">{barras.get(p.chave)}</span>
                      </p>
                    )}
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
                    <p className="text-xs text-muted-foreground">aberta em {formatarData(p.criado_em)}</p>
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
        {paginas > 1 && (
          <div className="border-t px-4 py-3">
            <Paginacao pagina={pagina} paginas={paginas} total={lista.length} tamanho={TAMANHO_PAGINA_PENDENCIAS} params={Object.fromEntries(query)} />
          </div>
        )}
      </form>
    </>
  );
}
