import Link from "next/link";
import {
  Banknote,
  Building2,
  CalendarX2,
  CircleCheckBig,
  ClipboardCheck,
  FileUp,
  HandCoins,
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
import { BarraProporcao, BarrasDuplas } from "@/components/graficos";
import { BoasVindas, type SituacaoFaixa } from "@/components/layout/boas-vindas";
import { EstadoVazio, Indicador, LinkPainel, Painel, type VariacaoIndicador } from "@/components/layout/painel";
import { SetaLink } from "@/components/layout/seta-link";
import { Status } from "@/components/layout/status";
import { getSessao } from "@/lib/auth/session";
import { PRIORIDADE_LABEL, STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";
import { carregarDashboard } from "@/lib/data/dashboard";
import { carregarComparativos, periodos, type Comparativo } from "@/lib/data/dashboard-comparativos";
import { carregarFiliaisOperacao } from "@/lib/data/dashboard-filiais";
import { carregarPendencias, modulosMonitorados } from "@/lib/data/pendencias";
import { horaNoBrasil, MESES as MESES_NOME } from "@/lib/data/vendas";
import { formatarData, formatarMoeda, pluralizar } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";
import { rotuloCargo } from "@/lib/roles";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { ASO_TIPO_LABEL } from "@/lib/rh/rotulos";
import { BadgeAso } from "../rh/funcionarios/[id]/documentos-aso";
import { contarStatus, moedaInteira, pctTexto, TabelaFiliais } from "./desempenho-filiais";
import { ListaPrioridades, NiveisPrioridade, resumirNiveis } from "./prioridades";
import { ResumoExecutivo, type MetricaResumo } from "./resumo-executivo";

export const metadata = { title: "Painel geral" };

/** Atalhos para o que cada perfil faz todo dia (só aparecem os que o papel abre), na ordem de uso; o que tem pendência
 * esperando sobe para o topo e mostra quantas. */
const ACOES: { rotulo: string; href: string; icone: LucideIcon; papeis?: AppRole[]; pendencias?: string[] }[] = [
  { rotulo: "Justificar quebras", href: "/caixa", icone: Banknote, papeis: ["gerente"], pendencias: ["caixa-justificar"] },
  { rotulo: "Quebras da regional", href: "/caixa", icone: Banknote, papeis: ["coordenador"], pendencias: ["caixa-regional"] },
  { rotulo: "Lançar sangria", href: "/sangrias/nova", icone: HandCoins, papeis: ["gerente", "usuario"] },
  { rotulo: "Buscar caixas no Trier", href: "/financeiro/diferenca-caixa", icone: Banknote, pendencias: ["caixa-ontem"] },
  { rotulo: "Conferir sangrias", href: "/financeiro/sangrias", icone: ClipboardCheck, papeis: ["admin", "financeiro"], pendencias: ["sangrias-conferir"] },
  { rotulo: "Nova conciliação", href: "/conciliacao/nova", icone: Scale, papeis: ["admin", "financeiro"] },
  { rotulo: "Enviar arquivos do banco", href: "/conciliacao/arquivos", icone: FileUp, papeis: ["admin", "financeiro"] },
  { rotulo: "Lançar quebra manual", href: "/financeiro/diferenca-caixa/nova", icone: Banknote },
  { rotulo: "Lançamentos da folha", href: "/rh/lancamentos", icone: ListChecks, pendencias: ["folha-obs-anterior", "folha-obs-atual"] },
  { rotulo: "Novo funcionário", href: "/rh/funcionarios/novo", icone: UserPlus, papeis: ["admin", "rh"] },
  { rotulo: "Novo equipamento", href: "/ti/ativos/novo", icone: MonitorCog },
  { rotulo: "Pedir acesso a sistema", href: "/ti/acessos/novo", icone: KeyRound, papeis: ["gerente", "usuario", "rh", "financeiro", "contador", "coordenador", "manutencao", "compras", "marketing"] },
  { rotulo: "Abrir chamado", href: "/chamados/novo", icone: LifeBuoy },
];

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}`;

function valorComparativo(c: Comparativo, v: number) {
  if (c.formato === "moeda") return formatarMoeda(v);
  if (c.formato === "pct") return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return v.toLocaleString("pt-BR");
}

/** Variação contra o período anterior: verde quando melhorou, vermelho quando piorou, cinza quando é só informativo. */
function variacaoDe(c: Comparativo): VariacaoIndicador | null {
  if (c.anterior === null) return null;
  const dif = c.atual - c.anterior;
  if (Math.abs(dif) < 0.005) return { texto: "igual", direcao: "igual", tom: "neutro" };
  const subiu = dif > 0;
  const bom = c.melhor === "neutro" ? null : (c.melhor === "maior") === subiu;
  const quanto =
    c.formato === "pct"
      ? `${Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`
      : c.anterior === 0 || Math.sign(c.atual) !== Math.sign(c.anterior) // virou de sinal: porcentagem não diz nada
        ? valorComparativo(c, Math.abs(dif))
        : `${Math.abs((100 * dif) / Math.abs(c.anterior)).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
  return {
    texto: quanto,
    direcao: subiu ? "sobe" : "desce",
    tom: bom === null ? "neutro" : bom ? "sucesso" : "perigo",
    dica: `${subiu ? "Subiu" : "Caiu"} ${quanto} em relação a ${c.comparadoCom} (${valorComparativo(c, c.anterior)})`,
  };
}

/** Linha do painel "Agora": ícone, nome, número e uma nota curta. */
function LinhaAgora({ icone: Icone, rotulo, valor, nota, href, tom }: { icone: LucideIcon; rotulo: string; valor: React.ReactNode; nota?: string | null; href: string; tom?: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 px-5 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
          <Icone className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{rotulo}</span>
          {nota && <span className="block truncate text-xs text-muted-foreground">{nota}</span>}
        </span>
        <span className={`numero-sm ${tom ?? ""}`}>{valor}</span>
      </Link>
    </li>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const [sessao, params] = await Promise.all([getSessao(), searchParams]);
  const erro = typeof params.erro === "string" ? params.erro : undefined;
  const primeiroNome = sessao.nome.split(" ")[0];
  const veRh = sessao.papel === "admin" || sessao.papel === "rh" || sessao.papel === "gerente";
  const veFolha = sessao.papel === "admin" || sessao.papel === "rh";
  const [d, pendencias, comparativos, operacao] = await Promise.all([carregarDashboard({ incluirFolha: veFolha }), carregarPendencias(sessao), carregarComparativos(sessao), carregarFiliaisOperacao(sessao)]);
  const pode = (rota: string) => podeAcessar(sessao.papel, rota, sessao.telasExtras, sessao.bloqueios);
  const quantasEsperando = (ids?: string[]) => (ids ?? []).reduce((s, id) => s + (pendencias.find((p) => p.id === id)?.quantidade ?? 0), 0);
  const acoes = ACOES.filter((a) => (!a.papeis || a.papeis.includes(sessao.papel)) && pode(a.href))
    .map((a) => ({ ...a, esperando: quantasEsperando(a.pendencias) }))
    .sort((a, b) => Number(b.esperando > 0) - Number(a.esperando > 0))
    .slice(0, 6);
  const emAtividade = d.funcionarios.ativo + d.funcionarios.afastado + d.funcionarios.ferias;
  const hojeTexto = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());
  const hoje = hojeTexto.charAt(0).toUpperCase() + hojeTexto.slice(1);
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const mensal = comparativos.find((c) => c.mensal?.length)?.mensal;
  const niveis = resumirNiveis(pendencias, modulosMonitorados(sessao));
  const qtdNivel = (n: (typeof niveis)[number]["nivel"]) => niveis.find((x) => x.nivel === n)?.quantidade ?? 0;
  const rotuloMes = periodos().rotulo;

  // ---------- como está a operação agora: resumo executivo e a frase da faixa ----------
  const contagem = contarStatus(operacao.linhas);
  const mostraFiliais = !operacao.erro && contagem.total >= 2;
  const nomeMesAtual = MESES_NOME[Number(periodos().hoje.slice(5, 7)) - 1].toLowerCase();
  const vencidas = pendencias.filter((p) => p.prazo === "vencido");
  const totalVencidas = vencidas.reduce((s, p) => s + p.quantidade, 0);
  const cartao = (id: string) => comparativos.find((c) => c.id === id);
  const metricas: MetricaResumo[] = [];
  const cartaoCaixa = cartao("caixa");
  const quebrasAbertas = operacao.linhas.reduce((s, l) => s + l.quebrasAbertas, 0);
  const quebrasTotal = operacao.linhas.reduce((s, l) => s + l.quebrasTotal, 0);
  if (cartaoCaixa && quebrasTotal > 0)
    metricas.push({
      chave: "quebras",
      rotulo: "Quebras em aberto",
      icone: Banknote,
      valor: moedaInteira(operacao.linhas.reduce((s, l) => s + l.quebrasValor, 0)),
      contexto: `${pluralizar(quebrasAbertas, "quebra", "quebras")} · ${pctTexto((100 * quebrasAbertas) / quebrasTotal)} do total`,
      variacao: variacaoDe(cartaoCaixa),
      comparado: `novas em ${nomeMesAtual}: ${moedaInteira(cartaoCaixa.atual)}${cartaoCaixa.anterior === null ? " (sem base para comparar)" : ""}`,
      href: cartaoCaixa.href,
    });
  const cartaoConc = cartao("conc-auto");
  if (cartaoConc)
    metricas.push({
      chave: "conciliacao",
      rotulo: "Conciliação",
      icone: Scale,
      valor: pctTexto(cartaoConc.atual),
      tom: cartaoConc.atual < 50 ? "perigo" : undefined,
      contexto: cartaoConc.nota,
      variacao: variacaoDe(cartaoConc),
      comparado: cartaoConc.anterior === null ? "sem base para comparar" : `vs. ${cartaoConc.comparadoCom}`,
      href: cartaoConc.href,
    });
  const concVencidas = vencidas.find((p) => p.id === "conc-vencidas");
  if (vencidas.length || pode("/conciliacao/pendencias") || pode("/rh/aso"))
    metricas.push({
      chave: "vencidas",
      rotulo: "Pendências vencidas",
      icone: CalendarX2,
      valor: totalVencidas.toLocaleString("pt-BR"),
      tom: totalVencidas ? "perigo" : "sucesso",
      contexto: concVencidas?.total ? `${pctTexto((100 * concVencidas.quantidade) / concVencidas.total)} das ${concVencidas.total.toLocaleString("pt-BR")} de conciliação em aberto` : totalVencidas ? vencidas.map((p) => `${p.quantidade} em ${p.area}`).join(" · ") : "Nenhum prazo estourado",
      href: "/pendencias?nivel=critico",
    });
  const filiaisResumo = mostraFiliais
    ? {
        contagem,
        meta: operacao.comMeta ? (
          <>
            <strong className="font-medium text-foreground tabular-nums">
              {operacao.dentroMeta} de {operacao.comMeta}
            </strong>{" "}
            filiais com meta estão dentro do ritmo de venda.
          </>
        ) : (
          <>
            Nenhuma filial com meta de venda em {nomeMesAtual}.{" "}
            {pode("/vendas/metas") && (
              <Link href="/vendas/metas" className="font-medium text-foreground underline underline-offset-2">
                Cadastrar metas
              </Link>
            )}
          </>
        ),
      }
    : null;
  const motivos = [contagem.critica && mostraFiliais ? pluralizar(contagem.critica, "filial crítica", "filiais críticas") : null, totalVencidas ? pluralizar(totalVencidas, "pendência vencida", "pendências vencidas") : null].filter(Boolean).join(" · ");
  const situacao: SituacaoFaixa =
    qtdNivel("critico") || (mostraFiliais && contagem.critica)
      ? { tom: "perigo", rotulo: "Exige ação", texto: motivos || niveis[0].texto }
      : qtdNivel("atencao") || qtdNivel("vencendo") || (mostraFiliais && contagem.atencao)
        ? { tom: "atencao", rotulo: "Pontos de atenção", texto: pluralizar(pendencias.length, "assunto em aberto", "assuntos em aberto") }
        : { tom: "sucesso", rotulo: "Operação em dia", texto: "nada pendente agora" };

  return (
    <>
      <BoasVindas data={hoje} titulo={`${saudacao}, ${primeiroNome}`} situacao={situacao}>
        {rotuloCargo(sessao.cargo, sessao.adminSistema)} · {sessao.papel === "coordenador" ? `números da regional ${sessao.regional ?? "—"}` : sessao.papel === "gerente" || sessao.papel === "usuario" ? "números das suas unidades" : sessao.papel === "manutencao" || sessao.papel === "compras" || sessao.papel === "marketing" ? "chamados do seu setor em todas as lojas" : "números de todas as unidades"}
      </BoasVindas>

      {erro === "sem_permissao" && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>Acesso não permitido.</strong> Seu perfil não tem permissão para a página solicitada.
          </p>
        </div>
      )}

      {/* 1. como está a operação agora */}
      {(filiaisResumo || metricas.length >= 2) && <ResumoExecutivo filiais={filiaisResumo} metricas={metricas} atualizadoAs={horaNoBrasil(new Date().toISOString())} />}

      {/* 2. o que precisa de ação */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <Painel
          id="atencao"
          titulo={<span className="text-base">Central de prioridades</span>}
          descricao="O que precisa da sua atenção. Clique em um nível para abrir a lista filtrada."
          acao={<LinkPainel href="/pendencias">{pendencias.length > 4 ? `Ver todas (${pendencias.length})` : "Central"}</LinkPainel>}
          className="lg:col-span-2"
        >
          <NiveisPrioridade resumo={niveis} className="px-5 pb-4" />
          {pendencias.length === 0 ? <EstadoVazio compacto icone={CircleCheckBig} titulo="Tudo em dia" descricao="Nenhuma pendência nos módulos que você usa." className="border-t" /> : <ListaPrioridades pendencias={pendencias.slice(0, 4)} />}
        </Painel>

        <Painel id="acoes" titulo={<span className="text-base">Ações rápidas</span>} descricao="Atalhos para o que você mais faz no dia a dia">
          <ul className="grid gap-0.5 px-2 pb-2">
            {acoes.map((a) => {
              const Icone = a.icone;
              return (
                <li key={a.href}>
                  <Link href={a.href} className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] active:bg-muted">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-fct-red-fundo group-hover:text-white">
                      <Icone className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 font-medium">{a.rotulo}</span>
                    {a.esperando > 0 && (
                      <span className="rounded-full bg-fct-tinta/8 px-2 py-0.5 text-xs font-semibold text-fct-tinta tabular-nums" title={`${a.esperando} esperando`}>
                        {a.esperando.toLocaleString("pt-BR")}
                      </span>
                    )}
                    <SetaLink className="size-3.5" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Painel>
      </div>

      {/* 3. tendência do mês */}
      {comparativos.length > 0 && (
        <section aria-labelledby="t-mes" className="mb-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="t-mes" className="text-base font-semibold">
                Como está o mês
              </h2>
              <p className="text-xs text-muted-foreground">{rotuloMes} comparado ao mesmo período do mês anterior</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {comparativos.map((c) => {
              const v = variacaoDe(c);
              return (
                <Indicador
                  key={c.id}
                  href={c.href}
                  rotulo={c.titulo}
                  valor={valorComparativo(c, c.atual)}
                  variacao={v}
                  comparadoCom={c.anterior === null ? "sem base para comparar ainda" : `${v?.tom === "sucesso" ? "melhor que" : v?.tom === "perigo" ? "pior que" : "vs."} ${c.comparadoCom}`}
                  detalhe={[c.periodo !== rotuloMes ? c.periodo : null, c.nota].filter(Boolean).join(" · ") || null}
                  meta={c.meta ? { texto: moedaInteira(c.meta.valor), pct: c.meta.pct, ritmo: c.meta.ritmo } : undefined}
                  serie={c.serie}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 4. desempenho por filial */}
      {(operacao.erro || mostraFiliais) && (
        <Painel
          id="desempenho"
          titulo={<span className="text-base">Desempenho por filial</span>}
          descricao={operacao.erro ? undefined : `As ${Math.min(8, contagem.total)} que mais pedem atenção agora`}
          acao={operacao.erro ? undefined : <LinkPainel href="/dashboard/filiais">Ver todas as filiais ({contagem.total})</LinkPainel>}
          className="mb-8"
        >
          {operacao.erro ? (
            <div role="alert">
              <EstadoVazio
                compacto
                icone={TriangleAlert}
                titulo="Não consegui carregar as filiais"
                descricao="Os outros números do painel não foram afetados."
                acao={
                  <Link href="/dashboard" className="text-sm font-medium underline underline-offset-2">
                    Tentar de novo
                  </Link>
                }
              />
            </div>
          ) : (
            <TabelaFiliais linhas={operacao.linhas.slice(0, 8)} veConciliacao={pode("/conciliacao")} abreFicha={pode("/filiais")} />
          )}
        </Painel>
      )}

      {/* 5. financeiro + situação agora */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        {mensal && mensal.length > 1 && (
          <Painel
            id="financeiro"
            titulo="Receitas × despesas"
            descricao={`Últimos ${mensal.length} meses lançados no financeiro`}
            acao={<LinkPainel href="/financeiro">Financeiro</LinkPainel>}
            className="lg:col-span-2"
          >
            <div className="px-5 pb-5">
              <BarrasDuplas
                titulo="Receitas e despesas por mês"
                rotuloA="Receitas"
                rotuloB="Despesas"
                dados={mensal.map((m) => ({ rotulo: mesCurto(m.competencia), a: m.receber, b: m.pagar, textoA: formatarMoeda(m.receber), textoB: formatarMoeda(m.pagar) }))}
              />
            </div>
          </Painel>
        )}

        <Painel id="agora" titulo="Agora" descricao="Situação neste momento" className={mensal && mensal.length > 1 ? undefined : "lg:col-span-3"}>
          <ul className={`divide-y border-t ${mensal && mensal.length > 1 ? "" : "lg:grid lg:grid-cols-2 lg:divide-y-0 xl:grid-cols-3"}`}>
            {veRh && (
              <LinhaAgora
                icone={Users}
                rotulo="Funcionários em atividade"
                valor={emAtividade}
                nota={d.funcionarios.afastado + d.funcionarios.ferias > 0 ? `${d.funcionarios.afastado} afastados · ${d.funcionarios.ferias} em férias` : null}
                href="/rh/funcionarios"
              />
            )}
            <LinhaAgora icone={Building2} rotulo="Unidades ativas" valor={d.unidadesAtivas} href="/filiais" />
            <LinhaAgora
              icone={LifeBuoy}
              rotulo="Chamados em aberto"
              valor={d.chamados.abertos}
              nota={d.chamados.abertos > 0 ? `${d.chamados.semResponsavel} sem responsável · ${d.chamados.urgentes} alta/crítica` : "nenhum pendente"}
              href="/chamados"
              tom={d.chamados.urgentes > 0 ? "text-amber-700" : undefined}
            />
            {veRh && (
              <LinhaAgora
                icone={Stethoscope}
                rotulo="ASO vencidos"
                valor={d.aso.vencidos}
                nota={`${d.aso.proximos} vencem em 30 dias · ${d.aso.semAso} sem ASO`}
                href="/rh/aso?situacao=vencidos"
                tom={d.aso.vencidos > 0 ? "text-red-700" : "text-emerald-700"}
              />
            )}
            {veFolha && d.folha && (
              <LinhaAgora
                icone={Wallet}
                rotulo={`Folha ${rotuloCompetencia(d.competencia)}`}
                valor={d.folha.total === 0 ? "—" : formatarMoeda(d.folha.liquido)}
                nota={
                  d.folha.total === 0
                    ? "ainda não gerada"
                    : d.folha.paga === d.folha.total
                      ? `${d.folha.total} registros · paga`
                      : d.folha.rascunho === 0
                        ? `${d.folha.total} registros · fechada`
                        : `${d.folha.total} registros · em elaboração`
                }
                href={`/rh/folha?competencia=${d.competencia}`}
              />
            )}
          </ul>
        </Painel>
      </div>

      {/* 6. listas de acompanhamento */}
      <div className="grid gap-4 lg:grid-cols-3">
        {veRh && (
          <Painel id="aso" titulo="ASO para resolver" descricao="Vencidos e vencendo nos próximos 30 dias" acao={<LinkPainel href="/rh/aso">Ver todos</LinkPainel>}>
            {d.asoVencendo.length === 0 ? (
              <EstadoVazio
                compacto
                icone={Stethoscope}
                titulo="Nada vencendo"
                descricao={d.aso.semAso > 0 ? `Mas ${pluralizar(d.aso.semAso, "funcionário está", "funcionários estão")} sem ASO cadastrado.` : "Nenhum ASO vence nos próximos 30 dias."}
              />
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
          </Painel>
        )}

        <Painel id="urgentes" titulo="Chamados urgentes" descricao="Prioridade alta ou crítica, mais antigos primeiro" acao={<LinkPainel href="/chamados?prioridade=alta">Ver fila</LinkPainel>}>
          {d.chamadosUrgentes.length === 0 ? (
            <EstadoVazio compacto icone={LifeBuoy} titulo="Nenhum chamado urgente" descricao="Nada de prioridade alta ou crítica em aberto." />
          ) : (
            <ul className="divide-y border-t">
              {d.chamadosUrgentes.map((c) => (
                <li key={c.id}>
                  <Link href={`/chamados/${c.id}`} className="block px-5 py-2.5 text-sm transition-colors hover:bg-muted/50">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">#{c.numero}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{c.titulo}</span>
                      <Status tom={c.prioridade === "critica" ? "perigo" : "alerta"}>{PRIORIDADE_LABEL[c.prioridade]}</Status>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {STATUS_CHAMADO_LABEL[c.status]}
                      {c.unidade ? ` · ${c.unidade.codigo}` : ""} · aberto em {formatarData(c.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Painel>

        {veRh && d.regionais.length > 0 && (
          <Painel id="regionais" titulo="Funcionários por regional" descricao={`${emAtividade} em atividade`}>
            <ul className="space-y-3 border-t px-5 py-4">
              {d.regionais.map(([regional, qtd]) => {
                const pct = emAtividade > 0 ? Math.round((qtd / emAtividade) * 100) : 0;
                return (
                  <li key={regional} className="text-sm">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span>{regional}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {qtd} <span className="text-xs">· {pct}%</span>
                      </span>
                    </div>
                    <BarraProporcao pct={pct} />
                  </li>
                );
              })}
            </ul>
          </Painel>
        )}
      </div>
    </>
  );
}
