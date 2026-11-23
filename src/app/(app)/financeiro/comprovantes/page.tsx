import Link from "next/link";
import { ReceiptText, Sheet } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Paginacao } from "@/components/layout/paginacao";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { CONFERENCIAS, TIPOS_VENDA, TOM_CONFERENCIA, type Conferencia, type TipoVenda } from "@/lib/comprovantes/rotulos";
import { lerFiltrosComprovantes, listarComprovantes, opcoesDeFiltro, paramsDosFiltros, TAMANHO_PAGINA_COMPROVANTES, totaisComprovantes } from "@/lib/data/comprovantes";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { conferirComprovantes } from "../../comprovantes/actions";
import { RedeFilial } from "../../comprovantes/rede-filial";
import { ConferenciaLista } from "./conferencia-lista";

export const metadata = { title: "Conferência de comprovantes" };

const diasAtras = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - n * 86_400_000));

/** Conferência dos comprovantes de venda (financeiro): separada do cadastro, que a loja faz em Operação → Comprovantes de venda. */
export default async function ConferenciaComprovantesPage({ searchParams }: PageProps<"/financeiro/comprovantes">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/comprovantes"), searchParams]);
  const podeConferir = sessao.papel === "admin" || sessao.papel === "financeiro";
  // padrão da conferência: os ativos A CONFERIR dos últimos 90 dias, do mais antigo para o mais novo
  const filtros = lerFiltrosComprovantes(sp, { de: diasAtras(90), conferencia: "pendente" });
  if (typeof sp.situacao !== "string") filtros.situacao = "ativo";
  // os cartões contam cada conferência com os outros filtros (sem o filtro de conferência)
  const [{ itens, total, anexos }, { redes, filiais }, porConferencia] = await Promise.all([
    listarComprovantes(filtros, { antigosPrimeiro: filtros.conferencia === "pendente" }),
    opcoesDeFiltro(true),
    totaisComprovantes({ ...filtros, conferencia: undefined }),
  ]);
  const paginas = Math.max(1, Math.ceil(total / TAMANHO_PAGINA_COMPROVANTES));
  const params = paramsDosFiltros(filtros);
  const query = (extra: Record<string, string | undefined> = {}) =>
    new URLSearchParams(Object.entries({ ...params, ...extra }).filter((e): e is [string, string] => !!e[1])).toString();

  const linhas = itens.map((c) => {
    const f = c.filial as { codigo: string; nome: string } | null;
    return {
      id: c.id,
      loja: f?.codigo ?? "—",
      lojaNome: f?.nome ?? "",
      tipo: TIPOS_VENDA[c.tipo as TipoVenda] ?? c.tipo,
      empresa: c.empresa,
      cliente: c.cliente,
      valor: formatarMoeda(Number(c.valor)),
      parcelas: c.parcelas,
      compra: formatarData(c.data_compra),
      anexos: (anexos.get(c.id) ?? []).map((a) => ({ id: a.id, nome: a.nome, imagem: !!a.mime?.startsWith("image/") })),
      conferencia: c.conferencia,
      obs: c.conferencia_obs,
      cancelado: c.situacao === "cancelado",
      cadastro: c.criada_por_nome ?? "—",
    };
  });

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Conferência de comprovantes"
        descricao="Confira cada venda no convênio e no crediário com o comprovante assinado que a loja enviou: cliente, valor, parcelas e assinatura. O cadastro fica com a loja em Operação → Comprovantes de venda."
        acoes={
          total > 0 ? (
            <Button variant="outline" nativeButton={false} render={<a href={`/api/comprovantes/planilha?${query()}`} />}>
              <Sheet data-icon="inline-start" />
              Baixar planilha
            </Button>
          ) : undefined
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
          <span className="font-medium">Conferência</span>
          <SelectNativo name="conferencia" defaultValue={filtros.conferencia ?? "todas"}>
            {(Object.keys(CONFERENCIAS) as Conferencia[]).map((c) => (
              <option key={c} value={c}>
                {CONFERENCIAS[c]}
              </option>
            ))}
            <option value="todas">Todas</option>
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
          <span className="font-medium">Cliente, empresa ou nº da venda</span>
          <Input type="search" name="busca" defaultValue={filtros.busca ?? ""} maxLength={60} />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Pesquisar
          </Button>
        </div>
      </form>

      <div className="mb-4 grid grid-cols-3 gap-4">
        {(Object.keys(CONFERENCIAS) as Conferencia[]).map((c) => (
          <Link key={c} href={`/financeiro/comprovantes?${query({ conferencia: c })}`} className={`rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40 ${filtros.conferencia === c ? "ring-2 ring-primary/20" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="rotulo">{CONFERENCIAS[c]}</p>
              <Status tom={TOM_CONFERENCIA[c]}>{porConferencia.conferencia[c].qtd}</Status>
            </div>
            <p className="mt-1.5 numero-sm">{formatarMoeda(porConferencia.conferencia[c].valor)}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-xl border bg-card">
        {linhas.length === 0 ? (
          <EstadoVazio
            icone={ReceiptText}
            titulo={filtros.conferencia === "pendente" ? "Nada a conferir" : "Nenhum comprovante com esses filtros"}
            descricao={filtros.conferencia === "pendente" ? `Todos os comprovantes de ${formatarData(filtros.de)} a ${formatarData(filtros.ate)} já foram conferidos.` : "Mude o período, a filial ou a conferência."}
          />
        ) : (
          <>
            <ConferenciaLista linhas={linhas} action={conferirComprovantes} podeConferir={podeConferir} />
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
