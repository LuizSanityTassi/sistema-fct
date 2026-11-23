import Link from "next/link";
import { Download, FileText, ImageIcon, Plus, Receipt, Sheet } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { CONFERENCIAS, TIPOS_VENDA, TOM_CONFERENCIA, type Conferencia, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { Status } from "@/components/layout/status";
import { lerFiltrosComprovantes, listarComprovantes, opcoesDeFiltro, paramsDosFiltros, TAMANHO_PAGINA_COMPROVANTES } from "@/lib/data/comprovantes";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { formatarCnpj } from "@/lib/validacao/cnpj";
import { RedeFilial } from "./rede-filial";

export const metadata = { title: "Comprovantes de venda" };

type FilialDoComprovante = { codigo: string; nome: string; cnpj: string | null; rede: { nome_fantasia: string | null } | null } | null;

export default async function ComprovantesPage({ searchParams }: PageProps<"/comprovantes">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/comprovantes"), searchParams]);
  const filtros = lerFiltrosComprovantes(sp);
  const verTodas = ["admin", "financeiro", "contador", "coordenador"].includes(sessao.papel);
  const [{ itens, total, somas, anexos }, { redes, filiais, lojasDeCadastro }] = await Promise.all([listarComprovantes(filtros), opcoesDeFiltro(verTodas)]);
  const podeCadastrar = lojasDeCadastro.length > 0;
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_COMPROVANTES));
  const params = paramsDosFiltros(filtros);
  const query = (extra: Record<string, string | undefined> = {}) =>
    new URLSearchParams(Object.entries({ ...params, ...extra }).filter((e): e is [string, string] => !!e[1])).toString();

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Comprovantes de venda"
        descricao="Vendas no convênio e no crediário com o comprovante assinado pelo cliente. A loja cadastra; o financeiro pesquisa e baixa."
        acoes={
          <>
            {total > 0 && (
              <Button variant="outline" nativeButton={false} render={<a href={`/api/comprovantes/planilha?${query()}`} />}>
                <Sheet data-icon="inline-start" />
                Baixar planilha
              </Button>
            )}
            {podeCadastrar && (
              <Button nativeButton={false} render={<Link href="/comprovantes/novo" />}>
                <Plus data-icon="inline-start" />
                Novo comprovante
              </Button>
            )}
          </>
        }
      />

      <form method="get" className="mb-4 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <RedeFilial redes={redes} filiais={filiais} rede={filtros.rede} filial={filtros.filial} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Compra de</span>
          <Input type="date" name="de" defaultValue={filtros.de} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Tipo de venda</span>
          <SelectNativo name="tipo" defaultValue={filtros.tipo ?? ""}>
            <option value="">Todos</option>
            {(Object.keys(TIPOS_VENDA) as TipoVenda[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS_VENDA[t]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Situação</span>
          <SelectNativo name="situacao" defaultValue={filtros.situacao ?? "todos"}>
            <option value="ativo">Ativos</option>
            <option value="cancelado">Cancelados</option>
            <option value="todos">Todos</option>
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Conferência do financeiro</span>
          <SelectNativo name="conferencia" defaultValue={filtros.conferencia ?? "todas"}>
            <option value="todas">Todas</option>
            {(Object.keys(CONFERENCIAS) as Conferencia[]).map((c) => (
              <option key={c} value={c}>
                {CONFERENCIAS[c]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Cliente, empresa ou nº da venda</span>
          <Input type="search" name="busca" defaultValue={filtros.busca ?? ""} maxLength={60} placeholder="Ex.: Salvaro" />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {(["convenio", "crediario"] as TipoVenda[]).map((t) => (
          <Link key={t} href={`/comprovantes?${query({ tipo: t, pagina: undefined })}`} className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40">
            <div className="flex items-center justify-between gap-2">
              <p className="rotulo">{TIPOS_VENDA[t]}</p>
              <span className="text-xs text-muted-foreground tabular-nums">{somas[t].qtd}</span>
            </div>
            <p className="mt-1.5 numero-sm">{formatarMoeda(somas[t].valor)}</p>
            <p className="text-xs text-muted-foreground">no período, pela data da compra</p>
          </Link>
        ))}
        <div className="col-span-2 rounded-xl border bg-card p-4 lg:col-span-1">
          <div className="flex items-center justify-between gap-2">
            <p className="rotulo">Total</p>
            <span className="text-xs text-muted-foreground tabular-nums">{somas.total.qtd}</span>
          </div>
          <p className="mt-1.5 numero-sm">{formatarMoeda(somas.total.valor)}</p>
          <p className="text-xs text-muted-foreground">
            {formatarData(filtros.de)} a {formatarData(filtros.ate)}
          </p>
        </div>
      </div>

      <section className="rounded-xl border bg-card">
        {itens.length === 0 ? (
          <EstadoVazio
            icone={Receipt}
            titulo="Nenhum comprovante nesse filtro"
            descricao={podeCadastrar ? "Use “Novo comprovante” para cadastrar a venda com o comprovante assinado." : "Mude os filtros para ver outro período."}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filial</TableHead>
                  <TableHead className="hidden lg:table-cell">Cadastrado por</TableHead>
                  <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Empresa</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Parcelas</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead className="text-center">Anexo</TableHead>
                  <TableHead className="hidden md:table-cell">Conferência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((c) => {
                  const filial = c.filial as FilialDoComprovante;
                  const lista = anexos.get(c.id) ?? [];
                  const cancelado = c.situacao === "cancelado";
                  return (
                    <TableRow key={c.id} className={cancelado ? "opacity-60" : undefined}>
                      <TableCell>
                        <Link href={`/comprovantes/${c.id}`} className="font-medium hover:underline">
                          <span className="font-mono text-xs">{filial?.codigo}</span> <span className="hidden xl:inline">{filial?.nome}</span>
                        </Link>
                        {filial?.cnpj && <span className="hidden text-[11px] text-muted-foreground xl:block">{formatarCnpj(filial.cnpj)}</span>}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{c.criada_por_nome ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">{TIPOS_VENDA[c.tipo as TipoVenda] ?? c.tipo}</TableCell>
                      <TableCell className="hidden max-w-56 truncate md:table-cell" title={c.empresa ?? undefined}>
                        {c.empresa ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/comprovantes/${c.id}`} className="hover:underline">
                          {c.cliente}
                        </Link>
                        {cancelado && <span className="block text-[11px] text-red-800">cancelado</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(Number(c.valor))}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{c.parcelas}</TableCell>
                      <TableCell className="tabular-nums">{formatarData(c.data_compra)}</TableCell>
                      <TableCell className="text-center">
                        {lista.length === 0 ? (
                          <span className="text-[11px] text-amber-800">sem anexo</span>
                        ) : (
                          <span className="inline-flex gap-1">
                            {lista.map((a) => {
                              const Icone = a.mime?.startsWith("image/") ? ImageIcon : a.mime === "application/pdf" ? FileText : Download;
                              return (
                                <a
                                  key={a.id}
                                  href={`/api/arquivos/comprovante/${a.id}`}
                                  target="_blank"
                                  rel="noopener"
                                  className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  title={`Baixar ${a.nome}`}
                                  aria-label={`Baixar ${a.nome}`}
                                >
                                  <Icone className="size-4" aria-hidden />
                                </a>
                              );
                            })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {cancelado ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <Link href={`/comprovantes/${c.id}`} className="hover:underline">
                            <Status tom={TOM_CONFERENCIA[c.conferencia as Conferencia] ?? "neutro"}>{CONFERENCIAS[c.conferencia as Conferencia] ?? c.conferencia}</Status>
                          </Link>
                        )}
                        {!cancelado && c.conferencia === "divergente" && c.conferencia_obs && (
                          <span className="mt-0.5 block max-w-52 truncate text-[11px] text-red-800" title={c.conferencia_obs}>
                            {c.conferencia_obs}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {paginas > 1 && (
              <div className="border-t px-5 py-3">
                <Paginacao pagina={filtros.pagina} paginas={paginas} total={total} tamanho={TAMANHO_PAGINA_COMPROVANTES} params={params} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
