import Link from "next/link";
import { HandCoins, Paperclip, Plus } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { lerFiltrosSangrias, listarSangrias, opcoesDeCadastro, TAMANHO_PAGINA_SANGRIAS } from "@/lib/data/sangrias";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { SITUACOES_SANGRIA, TOM_SANGRIA, type SituacaoSangria } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Sangrias" };

export default async function SangriasPage({ searchParams }: PageProps<"/sangrias">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/sangrias"), searchParams]);
  const filtros = lerFiltrosSangrias(sp);
  const supabase = await createClient();
  const [{ itens, total, somas, qtdAnexos }, { lojas, contas }, { data: todasLojas }] = await Promise.all([
    listarSangrias(filtros),
    opcoesDeCadastro(),
    // filtro de filial: financeiro/contador escolhem qualquer loja; a loja só as dela
    supabase.from("branches").select("id, codigo, nome").eq("ativo", true).order("codigo"),
  ]);
  const podeCadastrar = lojas.length > 0;
  const lojasFiltro = sessao.papel === "admin" || sessao.papel === "financeiro" || sessao.papel === "contador" ? (todasLojas ?? []) : lojas;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_SANGRIAS));
  const params = { filial: filtros.filial, conta: filtros.conta, de: filtros.de, ate: filtros.ate, situacao: filtros.situacao };

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Sangrias"
        descricao="Lance aqui o dinheiro retirado do caixa e depositado no banco, com o comprovante. A conferência com o extrato é feita pelo financeiro."
        acoes={
          podeCadastrar ? (
            <Button nativeButton={false} render={<Link href="/sangrias/nova" />}>
              <Plus data-icon="inline-start" />
              Nova sangria
            </Button>
          ) : undefined
        }
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.2fr_auto_auto_1fr_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={filtros.filial ?? ""}>
            <option value="">Todas</option>
            {lojasFiltro.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo} — {l.nome}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Banco</span>
          <SelectNativo name="conta" defaultValue={filtros.conta ?? ""}>
            <option value="">Todos</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Depósito de</span>
          <Input type="date" name="de" defaultValue={filtros.de} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <SelectNativo name="situacao" defaultValue={filtros.situacao ?? ""}>
            <option value="">Todas</option>
            {Object.entries(SITUACOES_SANGRIA).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </label>
        <div className="flex items-end">
          <Button type="submit" variant="outline" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {(["pendente", "conferida", "cancelada"] as SituacaoSangria[]).map((s) => (
          <Link
            key={s}
            href={`/sangrias?${new URLSearchParams(Object.entries({ ...params, situacao: s }).filter((e): e is [string, string] => !!e[1])).toString()}`}
            className={`rounded-xl border bg-card p-4 ${s === "cancelada" ? "hidden lg:block" : ""}`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="rotulo">{SITUACOES_SANGRIA[s]}</p>
              <Status tom={TOM_SANGRIA[s]}>{somas[s].qtd}</Status>
            </div>
            <p className="mt-1.5 numero-sm">{formatarMoeda(somas[s].valor)}</p>
            <p className="text-xs text-muted-foreground">
              no período, por data do depósito
            </p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        {itens.length === 0 ? (
          <EstadoVazio icone={HandCoins} titulo="Nenhuma sangria nesse período" descricao={podeCadastrar ? "Use “Nova sangria” para cadastrar o depósito com o comprovante." : "Mude os filtros para ver outro período."} />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filial</TableHead>
                  <TableHead>Depósito</TableHead>
                  <TableHead className="hidden md:table-cell">Retirada</TableHead>
                  <TableHead>Banco</TableHead>
                  <TableHead className="hidden lg:table-cell">Nº depósito</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="hidden sm:table-cell">Cadastro</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((s) => {
                  const anexos = qtdAnexos.get(s.id) ?? 0;
                  const filial = s.filial as { codigo: string; nome: string } | null;
                  return (
                    <TableRow key={s.id} className={s.situacao === "cancelada" ? "opacity-60" : undefined}>
                      <TableCell>
                        <Link href={`/sangrias/${s.id}`} className="font-medium hover:underline">
                          <span className="font-mono text-xs">{filial?.codigo}</span> <span className="hidden xl:inline">{filial?.nome}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        <Link href={`/sangrias/${s.id}`} className="hover:underline">
                          {formatarData(s.data_deposito)}
                        </Link>
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{formatarData(s.data_retirada)}</TableCell>
                      <TableCell>{s.conta_apelido}</TableCell>
                      <TableCell className="hidden font-mono text-xs lg:table-cell">{s.numero_deposito ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(Number(s.valor))}
                        {anexos === 0 && s.situacao === "pendente" ? (
                          <span className="block text-[11px] text-amber-800">sem comprovante</span>
                        ) : anexos > 0 ? (
                          <span className="block text-[11px] text-muted-foreground">
                            <Paperclip className="mr-0.5 inline size-3 align-[-1px]" aria-hidden />
                            {anexos}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{s.criada_por_nome ?? "—"}</TableCell>
                      <TableCell>
                        <Status tom={TOM_SANGRIA[s.situacao as SituacaoSangria] ?? "neutro"}>{SITUACOES_SANGRIA[s.situacao as SituacaoSangria] ?? s.situacao}</Status>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_SANGRIAS} params={params} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
