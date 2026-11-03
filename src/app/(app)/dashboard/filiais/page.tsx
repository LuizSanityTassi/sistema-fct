import Link from "next/link";
import { ArrowLeft, Store, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { getSessao } from "@/lib/auth/session";
import { carregarFiliaisOperacao, ehStatusFilial, ORDEM_STATUS, REGRA_STATUS, ROTULO_STATUS } from "@/lib/data/dashboard-filiais";
import { podeAcessar } from "@/lib/nav";
import { BarraSituacao, contarStatus, moedaInteira, TabelaFiliais } from "../desempenho-filiais";

export const metadata = { title: "Desempenho por filial" };

export default async function DesempenhoFiliaisPage({ searchParams }: PageProps<"/dashboard/filiais">) {
  const [sessao, sp] = await Promise.all([getSessao(), searchParams]);
  const operacao = await carregarFiliaisOperacao(sessao);
  const pode = (rota: string) => podeAcessar(sessao.papel, rota, sessao.telasExtras, sessao.bloqueios);
  const status = ehStatusFilial(sp.status) ? sp.status : "";
  const regionais = [...new Set(operacao.linhas.map((l) => l.regional).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b));
  const regional = typeof sp.regional === "string" && regionais.includes(sp.regional) ? sp.regional : "";
  const daRegional = operacao.linhas.filter((l) => !regional || l.regional === regional);
  const linhas = daRegional.filter((l) => !status || l.status === status);
  const contagem = contarStatus(daRegional);
  const link = (extra: { status?: string; regional?: string }) => {
    const q = new URLSearchParams();
    const s = extra.status ?? status;
    const r = extra.regional ?? regional;
    if (s) q.set("status", s);
    if (r) q.set("regional", r);
    const t = q.toString();
    return t ? `/dashboard/filiais?${t}` : "/dashboard/filiais";
  };
  const chip = (ativo: boolean) => cn("rounded-full border px-3 py-1 text-sm transition-colors active:scale-[0.98]", ativo ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary/40");

  return (
    <>
      <PageHeader
        eyebrow="Início"
        titulo="Desempenho por filial"
        descricao="A situação de cada loja agora: quebras em aberto, conciliação e principais pendências."
        acoes={
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Painel geral
          </Link>
        }
      />

      {operacao.erro ? (
        <div role="alert" className="rounded-xl border bg-card">
          <EstadoVazio
            icone={TriangleAlert}
            titulo="Não consegui carregar as filiais"
            descricao="Pode ser uma falha momentânea na conexão com o banco."
            acao={
              <Link href="/dashboard/filiais" className="text-sm font-medium underline">
                Tentar de novo
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <BarraSituacao contagem={contagem} className="mb-3" />
          <nav aria-label="Filtros" className="mb-4 flex flex-wrap items-center gap-2">
            <Link href={link({ status: "" })} aria-current={!status ? "page" : undefined} className={chip(!status)}>
              Todas ({contagem.total})
            </Link>
            {ORDEM_STATUS.map((s) => (
              <Link key={s} href={link({ status: s })} aria-current={status === s ? "page" : undefined} className={chip(status === s)}>
                {ROTULO_STATUS[s]} ({contagem[s]})
              </Link>
            ))}
            {regionais.length > 1 && <span className="mx-1 h-5 w-px bg-border" aria-hidden />}
            {regionais.length > 1 &&
              [{ v: "", r: "Todas as regionais" }, ...regionais.map((r) => ({ v: r, r }))].map((x) => (
                <Link key={x.v || "todas"} href={link({ regional: x.v })} aria-current={regional === x.v ? "page" : undefined} className={chip(regional === x.v)}>
                  {x.r}
                </Link>
              ))}
          </nav>

          <section className="rounded-xl border bg-card">
            {linhas.length ? (
              <TabelaFiliais linhas={linhas} veConciliacao={pode("/conciliacao")} abreFicha={pode("/filiais")} />
            ) : (
              <EstadoVazio icone={Store} titulo="Nenhuma filial nesse filtro" descricao={operacao.linhas.length ? "Tire o filtro para ver as outras filiais." : "Você ainda não tem filiais com dados para acompanhar."} />
            )}
          </section>

          <section aria-label="Como a situação é calculada" className="mt-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Como a situação é calculada</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong className="font-medium text-foreground">Crítica:</strong> {moedaInteira(REGRA_STATUS.quebrasValor)} ou mais em quebras abertas, {REGRA_STATUS.quebrasParadas} ou mais quebras paradas há mais de 5 dias, {REGRA_STATUS.concVencidas} ou mais conciliações vencidas, ou venda abaixo de {REGRA_STATUS.ritmoCritico}% do ritmo da meta.
              </li>
              <li>
                <strong className="font-medium text-foreground">Atenção:</strong> alguma quebra parada há mais de 5 dias, conciliação ou ASO vencido, ou venda abaixo de {REGRA_STATUS.ritmoAtencao}% do ritmo da meta.
              </li>
              <li>
                <strong className="font-medium text-foreground">Em dia:</strong> nada disso.
              </li>
            </ul>
            <p className="mt-2">O % de conciliação só existe na matriz de cada empresa (F001 e F301), onde ficam os títulos do Trier; nas outras lojas aparecem só as pendências ligadas a elas.</p>
          </section>
        </>
      )}
    </>
  );
}
