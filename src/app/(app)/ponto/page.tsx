import Link from "next/link";
import { AlarmClock, CalendarClock, Clock, Coffee, Gauge, Hourglass, TimerReset, TriangleAlert, UserRoundCheck, UserX, Users } from "lucide-react";
import { BarraProporcao, ColunasResultado } from "@/components/graficos";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, LinkPainel, Painel } from "@/components/layout/painel";
import { Ponto } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, bancoDeHoras, listarAjustes, listarEquipe, lerMes, rotuloMes } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { duracao, hojeLocal, limitesMes, saldoTexto, type ApuracaoDia } from "@/lib/ponto/calculo";
import { situacaoAgora } from "@/lib/ponto/situacao";
import { createClient } from "@/lib/supabase/server";
import type { Tom } from "@/lib/tons";
import { BarraFiltrosPonto, lerFiltrosPonto } from "./_ui/filtros";

export const metadata = { title: "Painel do ponto" };

type Alerta = { chave: string; tom: Tom; texto: string; detalhe?: string; href: string };

export default async function PainelPontoPage({ searchParams }: PageProps<"/ponto">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const agora = new Date();
  const hoje = hojeLocal(agora);
  const mes = lerMes(sp.mes, agora);
  const { de, ate: fimMes } = limitesMes(mes);
  const ate = fimMes > hoje ? hoje : fimMes;
  const mesCorrente = mes === hoje.slice(0, 7);
  const supabase = await createClient();

  const equipe = await listarEquipe({ filial: filtros.filial, departamento: filtros.departamento, q: filtros.q });
  if (!equipe.length) {
    return (
      <>
        <PageHeader eyebrow="Ponto" titulo="Painel do ponto" />
        <BarraFiltrosPonto rota="/ponto" filtros={filtros} mes={mes} />
        <Painel>
          <EstadoVazio icone={Users} titulo="Nenhum funcionário neste filtro" descricao="Troque a filial ou limpe os filtros." />
        </Painel>
      </>
    );
  }

  const [aps, bancos, pendentes, { data: comPin }] = await Promise.all([
    de <= ate ? apurar(equipe, de, ate, { agora }) : Promise.resolve([]),
    bancoDeHoras(equipe, { agora }),
    listarAjustes({ status: "pendente", filial: filtros.filial }),
    supabase.rpc("ponto_tem_pin", { p_employees: equipe.map((f) => f.id) }),
  ]);
  const comPinSet = new Set(comPin ?? []);
  const doDia = mesCorrente ? aps.map((a) => ({ a, dia: a.dias[a.dias.length - 1] })) : [];
  const agoraSit = doDia.map(({ a, dia }) => ({ func: a.func, dia, s: situacaoAgora(dia, agora) }));
  const conta = (c: string) => agoraSit.filter((x) => x.s.codigo === c).length;

  // totais do mês
  const tot = aps.reduce(
    (t, a) => ({
      trabalhado: t.trabalhado + a.totais.trabalhado,
      extra: t.extra + a.totais.extra,
      extra100: t.extra100 + a.totais.extra100,
      debito: t.debito + a.totais.debito,
      faltas: t.faltas + a.totais.faltas,
      atrasos: t.atrasos + a.totais.atrasos,
      inconsistencias: t.inconsistencias + a.totais.inconsistencias,
      incompletos: t.incompletos + a.totais.incompletos,
    }),
    { trabalhado: 0, extra: 0, extra100: 0, debito: 0, faltas: 0, atrasos: 0, inconsistencias: 0, incompletos: 0 },
  );
  const bancoTotal = bancos.reduce((s, b) => s + b.total, 0);

  // série diária: saldo da equipe (extra − débito) por dia
  const porDia = new Map<string, number>();
  for (const a of aps) for (const d of a.dias) if (d.situacao !== "futuro" && d.situacao !== "em_andamento") porDia.set(d.data, (porDia.get(d.data) ?? 0) + d.saldo);
  const serie = [...porDia.entries()].sort().map(([d, v]) => ({ rotulo: d.slice(8, 10), valor: v, texto: saldoTexto(v) }));

  // rankings
  const porFilial = new Map<string, { nome: string; extra: number; faltas: number; atrasos: number }>();
  for (const a of aps) {
    const k = `${a.func.filialCodigo} ${a.func.filialNome}`;
    const r = porFilial.get(k) ?? { nome: k, extra: 0, faltas: 0, atrasos: 0 };
    r.extra += a.totais.extra;
    r.faltas += a.totais.faltas;
    r.atrasos += a.totais.atrasos;
    porFilial.set(k, r);
  }
  const variasFiliais = porFilial.size > 1;
  const rankingExtras = variasFiliais
    ? [...porFilial.values()].sort((x, y) => y.extra - x.extra).slice(0, 8).map((r) => ({ nome: r.nome, valor: r.extra, href: undefined as string | undefined }))
    : aps
        .map((a) => ({ nome: a.func.nome, valor: a.totais.extra, href: `/ponto/espelho?funcionario=${a.func.id}&mes=${mes}` }))
        .sort((x, y) => y.valor - x.valor)
        .slice(0, 8);
  const maxExtra = Math.max(1, ...rankingExtras.map((r) => r.valor));
  const rankingFaltas = aps
    .filter((a) => a.totais.faltas || a.totais.atrasos)
    .sort((x, y) => y.totais.faltas - x.totais.faltas || y.totais.atrasos - x.totais.atrasos)
    .slice(0, 8);

  // alertas
  const alertas: Alerta[] = [];
  for (const x of agoraSit.filter((y) => y.s.codigo === "nao_marcou").slice(0, 10))
    alertas.push({ chave: `nm${x.func.id}`, tom: "perigo", texto: `${x.func.nome} não marcou a entrada`, detalhe: `${x.s.texto} · ${x.func.filialCodigo}`, href: `/ponto/espelho?funcionario=${x.func.id}` });
  const diasGraves: { func: (typeof aps)[number]["func"]; dia: ApuracaoDia }[] = aps.flatMap((a) => a.dias.filter((d) => d.ocorrencias.some((o) => o.grave) && d.data < hoje).map((dia) => ({ func: a.func, dia })));
  for (const { func, dia } of diasGraves.sort((x, y) => y.dia.data.localeCompare(x.dia.data)).slice(0, 12)) {
    const o = dia.ocorrencias.find((x) => x.grave)!;
    alertas.push({ chave: `g${func.id}${dia.data}`, tom: o.codigo === "falta" ? "perigo" : "alerta", texto: `${func.nome}: ${o.texto.toLowerCase()}`, detalhe: `${formatarData(dia.data)} · ${func.filialCodigo}`, href: `/ponto/espelho?funcionario=${func.id}&mes=${dia.data.slice(0, 7)}` });
  }
  for (const b of bancos.filter((x) => x.total > 40 * 60).slice(0, 5))
    alertas.push({ chave: `b${b.func.id}`, tom: "atencao", texto: `${b.func.nome} tem ${saldoTexto(b.total)} no banco`, detalhe: "Programe a compensação ou o pagamento", href: `/ponto/banco?funcionario=${b.func.id}` });
  const semJornada = aps.filter((a) => !a.jornadaAtual).length;
  const semPin = equipe.filter((f) => !comPinSet.has(f.id)).length;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Painel do ponto"
        descricao={`${equipe.length} funcionário(s) · ${rotuloMes(mes)}${mesCorrente ? " até hoje" : ""}. Os números vêm das marcações, com as mesmas regras do espelho.`}
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/ponto/relatorios" />}>
              Relatórios
            </Button>
            <Button nativeButton={false} render={<Link href="/ponto/relogio" />}>
              <Clock aria-hidden /> Relógio da filial
            </Button>
          </>
        }
      />
      <BarraFiltrosPonto rota="/ponto" filtros={filtros} mes={mes} />

      {mesCorrente && (
        <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Agora">
          <Indicador rotulo="Trabalhando agora" icone={UserRoundCheck} valor={conta("trabalhando")} tomValor="sucesso" href={`/ponto/equipe?situacao=trabalhando${filtros.filial ? `&filial=${filtros.filial}` : ""}`} />
          <Indicador rotulo="Em intervalo" icone={Coffee} valor={conta("intervalo")} tomValor="info" href={`/ponto/equipe?situacao=intervalo${filtros.filial ? `&filial=${filtros.filial}` : ""}`} />
          <Indicador rotulo="Não marcaram" icone={AlarmClock} valor={conta("nao_marcou")} tomValor={conta("nao_marcou") ? "perigo" : undefined} href={`/ponto/equipe?situacao=nao_marcou${filtros.filial ? `&filial=${filtros.filial}` : ""}`} />
          <Indicador rotulo="Ausentes (férias, atestado…)" icone={UserX} valor={conta("ausente")} tomValor="destaque" />
          <Indicador rotulo="Ajustes para aprovar" icone={TimerReset} valor={pendentes.length} tomValor={pendentes.length ? "atencao" : undefined} href="/ponto/ajustes?aba=aprovar" />
          <Indicador rotulo="Banco de horas da equipe" icone={Hourglass} valor={saldoTexto(bancoTotal)} tomValor={bancoTotal < 0 ? "perigo" : "sucesso"} href="/ponto/banco" />
        </section>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Mês">
        <Indicador rotulo="Horas trabalhadas" icone={CalendarClock} valor={duracao(tot.trabalhado)} />
        <Indicador rotulo="Horas extras" valor={duracao(tot.extra)} detalhe={tot.extra100 ? `${duracao(tot.extra100)} a 100%` : "todas a 50%"} tomValor={tot.extra ? "info" : undefined} />
        <Indicador rotulo="Horas negativas" valor={duracao(tot.debito)} tomValor={tot.debito ? "atencao" : undefined} />
        <Indicador rotulo="Faltas" valor={tot.faltas} tomValor={tot.faltas ? "perigo" : undefined} href={`/ponto/relatorios?relatorio=faltas&mes=${mes}${filtros.filial ? `&filial=${filtros.filial}` : ""}`} />
        <Indicador rotulo="Atrasos" valor={tot.atrasos} tomValor={tot.atrasos ? "atencao" : undefined} />
        <Indicador rotulo="Dias com inconsistência" icone={TriangleAlert} valor={tot.inconsistencias} detalhe={tot.incompletos ? `${tot.incompletos} com marcação faltando` : undefined} tomValor={tot.inconsistencias ? "alerta" : undefined} href={`/ponto/relatorios?relatorio=inconsistencias&mes=${mes}${filtros.filial ? `&filial=${filtros.filial}` : ""}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Painel titulo="Saldo da equipe por dia" icone={Gauge} descricao="Horas extras menos horas negativas de todos, dia a dia (verde: sobrou; vermelho: faltou).">
          <div className="border-t px-5 py-4">
            {serie.length ? <ColunasResultado dados={serie} titulo="Saldo da equipe por dia" rotuloValor="Saldo" /> : <p className="text-sm text-muted-foreground">Sem dias apurados neste mês.</p>}
          </div>
        </Painel>
        <Painel titulo="Alertas" icone={TriangleAlert} descricao="O que precisa de atenção agora.">
          {alertas.length === 0 && !semJornada && !semPin ? (
            <EstadoVazio icone={TriangleAlert} titulo="Nada fora do normal" compacto />
          ) : (
            <ul className="max-h-96 overflow-y-auto border-t">
              {semJornada > 0 && (
                <li className="border-b px-5 py-2 text-sm">
                  <Link href="/ponto/equipe?situacao=sem_jornada" className="flex items-start gap-2 hover:underline">
                    <Ponto tom="atencao" className="mt-1.5" /> {semJornada} funcionário(s) sem jornada definida: o ponto deles não gera saldo
                  </Link>
                </li>
              )}
              {semPin > 0 && (
                <li className="border-b px-5 py-2 text-sm">
                  <Link href="/ponto/equipe" className="flex items-start gap-2 hover:underline">
                    <Ponto tom="neutro" className="mt-1.5" /> {semPin} funcionário(s) sem PIN para o relógio da filial
                  </Link>
                </li>
              )}
              {alertas.map((a) => (
                <li key={a.chave} className="border-b px-5 py-2 text-sm last:border-0">
                  <Link href={a.href} className="flex items-start gap-2 hover:underline">
                    <Ponto tom={a.tom} className="mt-1.5" />
                    <span>
                      {a.texto}
                      {a.detalhe && <span className="block text-xs text-muted-foreground">{a.detalhe}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Painel titulo={variasFiliais ? "Horas extras por filial" : "Quem mais fez hora extra"} acao={<LinkPainel href={`/ponto/relatorios?relatorio=extras&mes=${mes}`}>Relatório</LinkPainel>}>
          {rankingExtras.every((r) => !r.valor) ? (
            <p className="border-t px-5 py-4 text-sm text-muted-foreground">Nenhuma hora extra no mês.</p>
          ) : (
            <ul className="space-y-2.5 border-t px-5 py-4">
              {rankingExtras
                .filter((r) => r.valor)
                .map((r) => (
                  <li key={r.nome} className="text-sm">
                    <div className="mb-1 flex justify-between gap-2">
                      {r.href ? (
                        <Link href={r.href} className="truncate hover:underline">
                          {r.nome}
                        </Link>
                      ) : (
                        <span className="truncate">{r.nome}</span>
                      )}
                      <span className="font-medium tabular-nums">{duracao(r.valor)}</span>
                    </div>
                    <BarraProporcao pct={(r.valor / maxExtra) * 100} />
                  </li>
                ))}
            </ul>
          )}
        </Painel>
        <Painel titulo="Faltas e atrasos" acao={<LinkPainel href={`/ponto/relatorios?relatorio=faltas&mes=${mes}`}>Relatório</LinkPainel>}>
          {rankingFaltas.length === 0 ? (
            <p className="border-t px-5 py-4 text-sm text-muted-foreground">Nenhuma falta ou atraso no mês.</p>
          ) : (
            <ul className="border-t">
              {rankingFaltas.map((a) => (
                <li key={a.func.id} className="flex items-center justify-between gap-2 border-b px-5 py-2 text-sm last:border-0">
                  <Link href={`/ponto/espelho?funcionario=${a.func.id}&mes=${mes}`} className="truncate hover:underline">
                    {a.func.nome} <span className="text-xs text-muted-foreground">{a.func.filialCodigo}</span>
                  </Link>
                  <span className="flex shrink-0 gap-3 tabular-nums">
                    <span className={a.totais.faltas ? "text-red-700" : "text-muted-foreground"}>{a.totais.faltas} falta(s)</span>
                    <span className={a.totais.atrasos ? "text-amber-800" : "text-muted-foreground"}>{a.totais.atrasos} atraso(s)</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>
    </>
  );
}
