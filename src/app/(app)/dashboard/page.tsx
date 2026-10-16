import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CircleCheckBig,
  FileUp,
  KeyRound,
  LifeBuoy,
  ListChecks,
  MonitorCog,
  Scale,
  Stethoscope,
  TriangleAlert,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BoasVindas } from "@/components/layout/boas-vindas";
import { getSessao } from "@/lib/auth/session";
import { PRIORIDADE_LABEL, STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";
import { carregarDashboard } from "@/lib/data/dashboard";
import { carregarComparativos, type Comparativo } from "@/lib/data/dashboard-comparativos";
import { carregarPendencias } from "@/lib/data/pendencias";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { navParaPapel, podeAcessar } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { ASO_TIPO_LABEL } from "@/lib/rh/rotulos";
import { COR_SEVERIDADE, ROTULO_SEVERIDADE } from "@/lib/pendencias-visual";
import { PAPEL_LABEL } from "@/lib/roles";
import { BadgeAso } from "../rh/funcionarios/[id]/documentos-aso";

export const metadata = { title: "Dashboard" };

function Kpi({ rotulo, valor, nota, href, tom, icone: Icone }: { rotulo: string; valor: string | number; nota?: string | null; href?: string; tom?: string; icone?: LucideIcon }) {
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{rotulo}</p>
        {Icone && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fct-navy/6 text-fct-navy">
            <Icone className="size-4" aria-hidden />
          </span>
        )}
      </div>
      <p className={`mt-1 text-2xl font-bold tracking-tight tabular-nums ${tom ?? ""}`}>{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-xl border bg-card px-4 py-3 transition-all hover:-translate-y-px hover:border-fct-navy/30 hover:shadow-md">
      {conteudo}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card px-4 py-3">{conteudo}</div>
  );
}

/** Atalhos para o que cada perfil faz todo dia (só aparecem os que o papel abre). */
const ACOES: { rotulo: string; href: string; icone: LucideIcon; papeis?: AppRole[] }[] = [
  { rotulo: "Buscar caixas no Trier", href: "/financeiro/diferenca-caixa", icone: Banknote },
  { rotulo: "Lançar quebra manual", href: "/financeiro/diferenca-caixa/nova", icone: Banknote },
  { rotulo: "Justificar quebras", href: "/caixa", icone: Banknote, papeis: ["gerente"] },
  { rotulo: "Nova conciliação", href: "/conciliacao/nova", icone: Scale, papeis: ["admin", "financeiro"] },
  { rotulo: "Enviar arquivos do banco", href: "/conciliacao/arquivos", icone: FileUp, papeis: ["admin", "financeiro"] },
  { rotulo: "Lançamentos da folha", href: "/rh/lancamentos", icone: ListChecks },
  { rotulo: "Novo funcionário", href: "/rh/funcionarios/novo", icone: UserPlus, papeis: ["admin", "rh"] },
  { rotulo: "Novo equipamento", href: "/ti/ativos/novo", icone: MonitorCog },
  { rotulo: "Pedir acesso a sistema", href: "/ti/acessos/novo", icone: KeyRound, papeis: ["gerente", "usuario", "rh", "financeiro", "contador"] },
  { rotulo: "Abrir chamado", href: "/chamados/novo", icone: LifeBuoy },
];

function valorComparativo(c: Comparativo, v: number) {
  if (c.formato === "moeda") return formatarMoeda(v);
  if (c.formato === "pct") return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("pt-BR");
}

/** Seta, variação e cor: verde quando melhorou, vermelho quando piorou, cinza quando é só informativo. */
function variacao(c: Comparativo) {
  if (c.anterior === null) return <p className="text-xs text-muted-foreground">sem base para comparar ainda</p>;
  const dif = c.atual - c.anterior;
  if (Math.abs(dif) < 0.005) return <p className="text-xs text-muted-foreground">igual a {c.comparadoCom}</p>;
  const subiu = dif > 0;
  const bom = c.melhor === "neutro" ? null : (c.melhor === "maior") === subiu;
  const cor = bom === null ? "text-muted-foreground" : bom ? "text-emerald-700" : "text-red-700";
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;
  const quanto =
    c.formato === "pct"
      ? `${Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
      : c.anterior === 0 || Math.sign(c.atual) !== Math.sign(c.anterior) // virou de sinal: porcentagem não diz nada
        ? valorComparativo(c, Math.abs(dif))
        : `${Math.abs((100 * dif) / Math.abs(c.anterior)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  return (
    <p className={`flex flex-wrap items-center gap-x-1 text-xs ${cor}`}>
      <Seta className="size-3.5" aria-hidden />
      <span>
        {subiu ? "subiu" : "caiu"} {quanto}
      </span>
      <span className="text-muted-foreground">
        × {c.comparadoCom} ({valorComparativo(c, c.anterior)})
      </span>
    </p>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const [sessao, params] = await Promise.all([getSessao(), searchParams]);
  const erro = typeof params.erro === "string" ? params.erro : undefined;
  const primeiroNome = sessao.nome.split(" ")[0];
  const veRh = sessao.papel === "admin" || sessao.papel === "rh" || sessao.papel === "gerente";
  const veFolha = sessao.papel === "admin" || sessao.papel === "rh";
  const [d, pendencias, comparativos] = await Promise.all([carregarDashboard({ incluirFolha: veFolha }), carregarPendencias(sessao), carregarComparativos(sessao)]);
  const acoes = ACOES.filter((a) => (!a.papeis || a.papeis.includes(sessao.papel)) && podeAcessar(sessao.papel, a.href)).slice(0, 6);
  const grupos = navParaPapel(sessao.papel).filter((g) => g.titulo);
  const emAtividade = d.funcionarios.ativo + d.funcionarios.afastado + d.funcionarios.ferias;
  const hojeTexto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = hojeTexto.charAt(0).toUpperCase() + hojeTexto.slice(1);

  return (
    <>
      <BoasVindas data={hoje} titulo={`Olá, ${primeiroNome}`}>
        {PAPEL_LABEL[sessao.papel]} · {sessao.papel === "gerente" || sessao.papel === "usuario" ? "números da sua unidade" : "números de todas as unidades"}
        {" · "}
        {pendencias.length ? pluralizar(pendencias.length, "pendência esperando ação", "pendências esperando ação") : "nada pendente agora"}.
      </BoasVindas>

      {erro === "sem_permissao" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Acesso não permitido.</strong> Seu perfil não tem permissão para a página solicitada.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section aria-labelledby="t-pendencias" className="rounded-xl border bg-card lg:col-span-2">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
            <h2 id="t-pendencias" className="text-sm font-semibold">
              Pendências de hoje
            </h2>
            <Link href="/pendencias" className="inline-flex items-center gap-1 text-sm font-medium text-fct-navy hover:underline">
              {pendencias.length ? `Ver todas (${pendencias.length})` : "Central de pendências"}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          {pendencias.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
              <CircleCheckBig className="size-4 text-emerald-600" aria-hidden />
              Tudo certo por aqui: nenhuma pendência nos módulos que você usa.
            </p>
          ) : (
            <ul className="divide-y">
              {pendencias.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link href={p.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40">
                    <span className={`size-2.5 shrink-0 rounded-full ${COR_SEVERIDADE[p.severidade].ponto}`} aria-hidden />
                    <span className="sr-only">{ROTULO_SEVERIDADE[p.severidade]}:</span>
                    <span className="min-w-0 flex-1 truncate text-sm">{p.titulo}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{p.area}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="t-acoes" className="rounded-xl border bg-card">
          <h2 id="t-acoes" className="border-b px-4 py-3 text-sm font-semibold">
            Ações rápidas
          </h2>
          <ul className="grid gap-1 p-2">
            {acoes.map((a) => {
              const Icone = a.icone;
              return (
                <li key={a.href}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-fct-navy/6 text-fct-navy">
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1 font-medium">{a.rotulo}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {comparativos.length > 0 && (
        <section aria-labelledby="t-comparativos" className="mb-6">
          <h2 id="t-comparativos" className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Como está o mês
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {comparativos.map((c) => (
              <Link key={c.id} href={c.href} className="block rounded-xl border bg-card px-4 py-3 transition-all hover:-translate-y-px hover:border-fct-navy/30 hover:shadow-md">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{c.titulo}</p>
                <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{valorComparativo(c, c.atual)}</p>
                {variacao(c)}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {c.periodo}
                  {c.nota ? ` · ${c.nota}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {veRh && (
          <Kpi
            rotulo="Funcionários em atividade"
            valor={emAtividade}
            nota={d.funcionarios.afastado + d.funcionarios.ferias > 0 ? `${d.funcionarios.afastado} afastados · ${d.funcionarios.ferias} em férias` : null}
            href="/rh/funcionarios"
            icone={Users}
          />
        )}
        <Kpi rotulo="Unidades ativas" valor={d.unidadesAtivas} href="/filiais" icone={Building2} />
        <Kpi
          rotulo="Chamados em aberto"
          valor={d.chamados.abertos}
          nota={d.chamados.abertos > 0 ? `${d.chamados.semResponsavel} sem responsável · ${d.chamados.urgentes} alta/crítica` : "nenhum pendente"}
          href="/chamados"
          icone={LifeBuoy}
          tom={d.chamados.urgentes > 0 ? "text-amber-700" : undefined}
        />
        {veRh && (
          <Kpi
            rotulo="ASO vencidos"
            valor={d.aso.vencidos}
            nota={`${d.aso.proximos} vencem em 30 dias · ${d.aso.semAso} sem ASO`}
            href="/rh/aso?situacao=vencidos"
            icone={Stethoscope}
            tom={d.aso.vencidos > 0 ? "text-red-700" : "text-emerald-700"}
          />
        )}
        {veFolha && d.folha && (
          <Kpi
            rotulo={`Folha ${rotuloCompetencia(d.competencia)}`}
            valor={d.folha.total === 0 ? "não gerada" : formatarMoeda(d.folha.liquido)}
            nota={
              d.folha.total === 0
                ? "gere a folha do mês"
                : d.folha.paga === d.folha.total
                  ? `${d.folha.total} registros · paga`
                  : d.folha.rascunho === 0
                    ? `${d.folha.total} registros · fechada`
                    : `${d.folha.total} registros · em elaboração`
            }
            href={`/rh/folha?competencia=${d.competencia}`}
            icone={Wallet}
          />
        )}
      </section>

      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {veRh && (
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-sm font-semibold">ASO para resolver</h2>
              <Link href="/rh/aso" className="text-xs text-fct-navy underline">
                ver todos
              </Link>
            </div>
            {d.asoVencendo.length === 0 ? (
              <p className="border-t px-5 py-5 text-sm text-muted-foreground">
                {d.aso.semAso > 0 ? `Nenhum ASO vencendo, mas ${pluralizar(d.aso.semAso, "funcionário", "funcionários")} sem ASO cadastrado.` : "Nada vencendo nos próximos 30 dias."}
              </p>
            ) : (
              <ul className="divide-y border-t">
                {d.asoVencendo.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/rh/funcionarios/${a.employees.id}#aso`} className="block truncate font-medium hover:underline">
                        {a.employees.nome}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {ASO_TIPO_LABEL[a.tipo]} · {formatarData(a.data_validade)}
                      </p>
                    </div>
                    <BadgeAso validade={a.data_validade} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">Chamados urgentes</h2>
            <Link href="/chamados?prioridade=alta" className="text-xs text-fct-navy underline">
              ver fila
            </Link>
          </div>
          {d.chamadosUrgentes.length === 0 ? (
            <p className="border-t px-5 py-5 text-sm text-muted-foreground">Nenhum chamado de prioridade alta ou crítica em aberto.</p>
          ) : (
            <ul className="divide-y border-t">
              {d.chamadosUrgentes.map((c) => (
                <li key={c.id} className="px-5 py-2.5 text-sm">
                  <Link href={`/chamados/${c.id}`} className="block truncate font-medium hover:underline">
                    #{c.numero} {c.titulo}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {PRIORIDADE_LABEL[c.prioridade]} · {STATUS_CHAMADO_LABEL[c.status]}
                    {c.unidade ? ` · ${c.unidade.codigo}` : ""} · aberto em {formatarData(c.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {veRh && d.regionais.length > 0 && (
          <section className="rounded-xl border bg-card">
            <div className="px-5 py-4">
              <h2 className="text-sm font-semibold">Funcionários por regional</h2>
            </div>
            <ul className="border-t px-5 py-3">
              {d.regionais.map(([regional, qtd]) => {
                const pct = emAtividade > 0 ? Math.round((qtd / emAtividade) * 100) : 0;
                return (
                  <li key={regional} className="py-1.5 text-sm">
                    <div className="flex items-center justify-between">
                      <span>{regional}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {qtd} · {pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted" role="presentation">
                      <div className="h-1.5 rounded-full bg-fct-navy" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="mb-8">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{grupo.titulo}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {grupo.itens.map((item) => {
              const Icone = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-xl border bg-card p-4 transition-colors outline-none hover:border-fct-navy/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between">
                    <span className="flex size-9 items-center justify-center rounded-md bg-fct-navy/6 text-fct-navy">
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-fct-navy" aria-hidden />
                  </div>
                  <p className="mt-3 font-medium">{item.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{item.descricao}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
