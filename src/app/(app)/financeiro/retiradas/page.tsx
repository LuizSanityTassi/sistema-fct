import Link from "next/link";
import { ArrowLeftRight, ChevronLeft, TriangleAlert } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { caixasColetadosAte, detalheRetiradas, lerFiltrosRetiradas, paramsRetiradas, resumoRetiradas } from "@/lib/data/retiradas";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";
import { salvarConferenciaRetirada } from "./actions";
import { ConferenciaRetiradaForm } from "./conferencia-form";

export const metadata = { title: "Retiradas de caixa" };

const tomDiferenca = (v: number) => (Math.abs(v) < 0.005 ? "text-emerald-700" : "text-red-700");
const query = (p: Record<string, string | undefined>) => new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();

/** Retiradas de dinheiro dos caixas (Trier) × depósitos declarados pelas lojas (sangrias) — a tela "Pesquisar Retirada de Caixa" da Zanini. */
export default async function RetiradasPage({ searchParams }: PageProps<"/financeiro/retiradas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/retiradas"), searchParams]);
  const f = lerFiltrosRetiradas(sp);
  const params = paramsRetiradas(f);
  const supabase = await createClient();
  const [{ data: lojas }, { data: contas }, coletadoAte] = await Promise.all([
    supabase.from("branches").select("id, codigo, nome, ativo").order("codigo"),
    supabase.from("fin_contas_bancarias").select("id, apelido").eq("ativa", true).eq("aceita_sangria", true).order("apelido"),
    caixasColetadosAte(),
  ]);
  const porId = new Map((lojas ?? []).map((l) => [l.id, l]));
  const filial = f.filial ? porId.get(f.filial) : undefined;
  const podeConferir = sessao.papel === "admin" || sessao.papel === "financeiro";
  const faltaColetar = !coletadoAte || coletadoAte < f.retAte;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo={filial ? `Retiradas de caixa · ${filial.codigo} ${filial.nome}` : "Retiradas de caixa"}
        descricao="Dinheiro retirado dos caixas para depósito (Trier) × o que a loja declarou nas sangrias. A diferença é retirada − declarado."
        acoes={
          filial ? (
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/retiradas?${query({ ...params, filial: undefined })}`} />}>
              <ChevronLeft data-icon="inline-start" />
              Todas as filiais
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_auto_auto_auto_auto_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={f.filial ?? ""}>
            <option value="">Todas</option>
            {(lojas ?? [])
              .filter((l) => l.ativo || l.id === f.filial)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} — {l.nome}
                </option>
              ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Banco do depósito</span>
          <SelectNativo name="conta" defaultValue={f.conta ?? ""}>
            <option value="">Todos</option>
            {(contas ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Retirada de</span>
          <Input type="date" name="ret_de" defaultValue={f.retDe} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="ret_ate" defaultValue={f.retAte} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Depósito de</span>
          <Input type="date" name="dep_de" defaultValue={f.depDe} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="dep_ate" defaultValue={f.depAte} />
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      {faltaColetar && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Os caixas do Trier foram buscados até {coletadoAte ? formatarData(coletadoAte) : "—"}: as retiradas depois disso ainda não aparecem e a diferença sai errada.{" "}
            <Link href="/financeiro/diferenca-caixa" className="font-medium underline">
              Buscar do Trier em Diferença de caixa
            </Link>
            .
          </span>
        </p>
      )}

      {filial && f.filial ? (
        <DetalheFilial filtros={f} params={params} podeConferir={podeConferir} />
      ) : (
        <ResumoFiliais filtros={f} params={params} porId={porId} />
      )}
    </>
  );
}

async function ResumoFiliais({
  filtros,
  params,
  porId,
}: {
  filtros: ReturnType<typeof lerFiltrosRetiradas>;
  params: Record<string, string | undefined>;
  porId: Map<string, { codigo: string; nome: string }>;
}) {
  const r = await resumoRetiradas(filtros);
  const linhas = r.linhas
    .map((l) => ({ ...l, loja: porId.get(l.branchId) }))
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || (a.loja?.codigo ?? "").localeCompare(b.loja?.codigo ?? ""));
  const comDiferenca = linhas.filter((l) => Math.abs(l.diferenca) >= 0.005).length;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cartao rotulo="Total de retirada" valor={formatarMoeda(r.totalRetirada)} nota={`${formatarData(filtros.retDe)} a ${formatarData(filtros.retAte)}`} />
        <Cartao rotulo="Total declarado" valor={formatarMoeda(r.totalDeclarado)} nota={`depósitos de ${formatarData(filtros.depDe)} a ${formatarData(filtros.depAte)}`} />
        <Cartao rotulo="Diferença" valor={formatarMoeda(r.diferenca)} tom={tomDiferenca(r.diferenca)} nota="retirada − declarado" />
        <Cartao rotulo="Filiais com diferença" valor={String(comDiferenca)} nota={`de ${linhas.length} com movimento`} />
      </div>
      <section className="rounded-xl border bg-card">
        {linhas.length === 0 ? (
          <EstadoVazio icone={ArrowLeftRight} titulo="Nenhuma retirada nem depósito nesse período" descricao="Mude as datas ou busque os caixas do Trier em Diferença de caixa." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Retirada</TableHead>
                <TableHead className="text-right">Declarado</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Conferência</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.branchId}>
                  <TableCell>
                    <Link href={`/financeiro/retiradas?${query({ ...params, filial: l.branchId })}`} className="font-medium hover:underline">
                      <span className="font-mono text-xs">{l.loja?.codigo ?? "?"}</span> {l.loja?.nome}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarMoeda(l.retirada)}
                    <span className="block text-[11px] text-muted-foreground">{l.caixas === 1 ? "1 caixa" : `${l.caixas} caixas`}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarMoeda(l.declarado)}
                    <span className="block text-[11px] text-muted-foreground">{l.depositos === 1 ? "1 depósito" : `${l.depositos} depósitos`}</span>
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${tomDiferenca(l.diferenca)}`}>{formatarMoeda(l.diferenca)}</TableCell>
                  <TableCell>
                    {l.conferido ? <Status tom="sucesso">Conferido</Status> : l.comentarios ? <Status tom="info">Comentado</Status> : <Status tom="atencao">A conferir</Status>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </>
  );
}

async function DetalheFilial({ filtros, params, podeConferir }: { filtros: ReturnType<typeof lerFiltrosRetiradas> & { filial?: string }; params: Record<string, string | undefined>; podeConferir: boolean }) {
  const d = await detalheRetiradas(filtros, filtros.filial!);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel id="retiradas" titulo="Retiradas dos caixas" descricao={`Trier · fechamento de ${formatarData(filtros.retDe)} a ${formatarData(filtros.retAte)}`}>
          {d.retiradas.length === 0 ? (
            <EstadoVazio compacto icone={ArrowLeftRight} titulo="Nenhum caixa com retirada no período" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caixa</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="hidden sm:table-cell">Operador</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.retiradas.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.caixa ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(r.data)}</TableCell>
                    <TableCell className="hidden text-xs sm:table-cell">{r.operador}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total de retirada</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(d.totalRetirada)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </Painel>
        <Painel id="declarado" titulo="Depósitos declarados (sangrias)" descricao={`Depósito de ${formatarData(filtros.depDe)} a ${formatarData(filtros.depAte)}, sem as canceladas`}>
          {d.declarados.length === 0 ? (
            <EstadoVazio compacto icone={ArrowLeftRight} titulo="A loja não lançou sangria nesse período" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Depósito</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead className="hidden sm:table-cell">Observação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.declarados.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">
                      <Link href={`/financeiro/sangrias/${s.id}`} className="hover:underline">
                        {formatarData(s.deposito)}
                      </Link>
                      <span className="block text-[11px] text-muted-foreground">retirada {formatarData(s.retirada)}</span>
                    </TableCell>
                    <TableCell>
                      {s.banco}
                      <span className="block">
                        <Status tom={TOM_SANGRIA[s.situacao as SituacaoSangria] ?? "neutro"}>{SITUACOES_SANGRIA[s.situacao as SituacaoSangria] ?? s.situacao}</Status>
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{s.observacao ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarMoeda(s.valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total declarado</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(d.totalDeclarado)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </Painel>
      </div>

      <Painel id="conferencia" titulo="Conferência" descricao="Retirada − declarado no período pesquisado">
        <div className="grid gap-4 px-5 pb-5">
          <div className="grid grid-cols-3 gap-3">
            <Cartao rotulo="Total de retirada" valor={formatarMoeda(d.totalRetirada)} />
            <Cartao rotulo="Total declarado" valor={formatarMoeda(d.totalDeclarado)} />
            <Cartao rotulo="Diferença" valor={formatarMoeda(d.diferenca)} tom={tomDiferenca(d.diferenca)} />
          </div>
          {podeConferir && <ConferenciaRetiradaForm action={salvarConferenciaRetirada} filtros={params} />}
        </div>
      </Painel>

      <Painel id="comentarios" titulo="Comentários" descricao="Conferências e comentários salvos desta filial (o mais recente primeiro)">
        {d.conferencias.length === 0 ? (
          <EstadoVazio compacto titulo="Nenhum comentário ainda" />
        ) : (
          <ul className="divide-y border-t">
            {d.conferencias.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p>
                    {c.conferido && (
                      <Status tom="sucesso" className="mr-2">
                        Conferido
                      </Status>
                    )}
                    {c.comentario ?? <span className="text-muted-foreground">Sem comentário</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Retirada {formatarData(c.retirada_de)}–{formatarData(c.retirada_ate)} · depósito {formatarData(c.deposito_de)}–{formatarData(c.deposito_ate)} · retirada {formatarMoeda(Number(c.total_retirada))} · declarado{" "}
                    {formatarMoeda(Number(c.total_declarado))} · diferença <span className={tomDiferenca(Number(c.diferenca))}>{formatarMoeda(Number(c.diferenca))}</span>
                  </p>
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {c.criado_por_nome ?? "—"} · {formatarDataHora(c.criado_em)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Painel>
    </div>
  );
}

function Cartao({ rotulo, valor, nota, tom }: { rotulo: string; valor: string; nota?: string; tom?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="rotulo">{rotulo}</p>
      <p className={`mt-1.5 numero-sm ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}
