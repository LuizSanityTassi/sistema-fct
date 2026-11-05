import Link from "next/link";
import { Activity, BarChart3, CalendarDays, ChartLine, CircleAlert, CircleCheck, Headset, Info, MapPinned, PieChart, Sparkles, Target, Trophy } from "lucide-react";
import { cn } from "cn";
import { BarrasDuplas } from "@/components/graficos";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, LinkPainel } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { chaveMetaFilial, DIAS_SEMANA, diaDaSemana, diasSemVendas, ehRegionalVendas, ehTele, faixasDeDias, hojeNoBrasil, horaNoBrasil, MESES, mesmoDia, metasDoMes, porPeriodo, REGIONAIS_VENDAS, resumirTelevendas, serieVendas, serieVendasFilial, somar, somarDias, TELEVENDAS, televendasNoPeriodo, ultimoDia, ultimoDiaVendas, vendasPorFilial, type LinhaFilialVendas, type RegionalVendas } from "@/lib/data/vendas";
import { formatarData } from "@/lib/formatos";
import { AtualizaSozinho } from "./atualiza-sozinho";
import { EscolhaFilial } from "./escolha-filial";
import { AbasVendas, AvisoDiasFaltando, decimal, inteiro, moeda, moedaCurta, pct } from "./comum";
import { BarraProgresso, ColunasSemana, Comparacao, delta, EvolucaoMes, MiniKpi, Rosca, Secao, type FatiaComposicao } from "./painel-visual";

export const metadata = { title: "Painel de vendas" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MEDALHA = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-300 text-orange-950"];

type Destaque = { tipo: "bom" | "ruim" | "info"; texto: React.ReactNode; peso: number };

export default async function PainelVendasPage({ searchParams }: PageProps<"/vendas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas"), searchParams]);
  // gerente: só a(s) loja(s) dele (a RLS já filtra); sem regionais nem ranking de lojas
  const soLoja = sessao.papel === "gerente";
  // uma filial só (?filial=<id>): o painel inteiro passa a ser dela; a lista de escolha é a das lojas que a pessoa vê
  const filial = typeof sp.filial === "string" && UUID.test(sp.filial) ? sp.filial : "";
  const regional: RegionalVendas | "" = !soLoja && !filial && typeof sp.regional === "string" && ehRegionalVendas(sp.regional) ? sp.regional : "";
  const r = regional || undefined;
  // o mês vai até o último dia lido: hoje (parcial, o robô de hoje lê a cada 10 min) ou ontem. Médias, projeção e a
  // semana usam só dias completos (até ontem).
  const ultimo = await ultimoDiaVendas();
  const ate = ultimo.dia;
  const ontem = somarDias(hojeNoBrasil(), -1);
  const [ano, mes, dia] = ate.split("-").map(Number);
  const inicioMes = `${ate.slice(0, 7)}-01`;
  const inicioMesAnt = mesmoDia(inicioMes, 1);
  const [anoAnt, mesAntNum] = inicioMesAnt.split("-").map(Number);
  const fimMesAnt = `${inicioMesAnt.slice(0, 7)}-${String(ultimoDia(anoAnt, mesAntNum)).padStart(2, "0")}`;

  // venda por dia/mês: da filial escolhida ou das regionais (rede ou uma regional)
  const serie = (de: string, fim: string, por: "dia" | "mes") => (filial ? serieVendasFilial(filial, de, fim, por) : serieVendas(de, fim, por).then((p) => porPeriodo(p, r)));
  const [listaMes, listaMesAnt, listaAnoAnt, porMes, porDia, porDiaAnt, porDia14, faltamMes, faltamMesAnt, teleLinhas, teleLinhasAnt, metas] = await Promise.all([
    vendasPorFilial(inicioMes, ate),
    vendasPorFilial(inicioMesAnt, mesmoDia(ate, 1)),
    vendasPorFilial(`${ano - 1}-01-01`, mesmoDia(ate, 12)),
    serie(`${ano - 1}-01-01`, ate, "mes"),
    serie(inicioMes, ate, "dia"),
    serie(inicioMesAnt, fimMesAnt, "dia"),
    serie(somarDias(ontem, -13), ate, "dia"),
    diasSemVendas(inicioMes, ate),
    diasSemVendas(inicioMesAnt, fimMesAnt),
    // televendas (equipe de tele-vendas): a RLS não devolve nada para o gerente
    soLoja ? Promise.resolve([]) : televendasNoPeriodo(inicioMes, ate),
    soLoja ? Promise.resolve([]) : televendasNoPeriodo(inicioMesAnt, mesmoDia(ate, 1)),
    metasDoMes(inicioMes),
  ]);
  const tele = resumirTelevendas(teleLinhas);
  const teleAnt = resumirTelevendas(teleLinhasAnt);

  const filtra = <T extends { regional: string; branchId: string }>(xs: T[]) => (filial ? xs.filter((x) => x.branchId === filial) : r ? xs.filter((x) => x.regional === r) : xs);
  const lojasMes = filtra(listaMes);
  const lojasMesAnt = filtra(listaMesAnt);
  const tMes = somar(lojasMes);
  const tMesAnt = somar(lojasMesAnt);
  const vendaAno = [...porMes].filter(([p]) => p >= `${ano}-01-01`).reduce((s, [, v]) => s + v.venda, 0);
  const vendaAnoAnt = somar(filtra(listaAnoAnt)).venda;
  const nomeMes = MESES[mes - 1];
  const nomeMesAnt = MESES[mesAntNum - 1].toLowerCase();
  // lojas para escolher (as que a pessoa vê, com venda neste mês ou no anterior), sem as centrais de televendas
  const opcoesLojas = [...new Map([...listaMes, ...listaMesAnt].filter((l) => !ehTele(l)).map((l) => [l.branchId, l])).values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }))
    .map((l) => ({ id: l.branchId, rotulo: `${l.codigo} ${l.nome}`, grupo: l.regional }));
  const lojaEscolhida = filial ? opcoesLojas.find((o) => o.id === filial) : undefined;
  // painel de uma loja só: a do gerente com uma loja ou a filial escolhida (sem regiões, ranking nem televendas)
  const visaoLoja = soLoja || !!filial;
  const escopo = filial ? (lojaEscolhida?.rotulo ?? "filial sem venda no período") : soLoja ? (lojasMes.length === 1 ? `${lojasMes[0].codigo} ${lojasMes[0].nome}` : "suas lojas") : regional || "Rede";

  if (!listaMes.length && !porMes.size) {
    return (
      <>
        <PageHeader eyebrow="Vendas" titulo="Painel de vendas" />
        <AbasVendas ativa="/vendas" papel={sessao.papel} />
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            icone={BarChart3}
            titulo="Ainda sem vendas guardadas"
            descricao={
              sessao.papel === "admin" ? (
                <>
                  Busque as vendas em{" "}
                  <Link href="/vendas/robo" className="underline">
                    Automações → Robô de vendas
                  </Link>{" "}
                  (o robô também traz sozinho toda madrugada).
                </>
              ) : (
                "As vendas chegam do Trier toda madrugada."
              )
            }
          />
        </section>
      </>
    );
  }

  // ---------- ritmo e projeção ----------
  const diasNoMes = ultimoDia(ano, mes);
  const diasComVenda = [...porDia.values()].filter((v) => v.venda > 0).length;
  // hoje (parcial) entra no realizado, mas não nas médias: o resto do dia é estimado pela média do dia da semana
  const vendaHoje = ultimo.parcial ? (porDia.get(ate)?.venda ?? 0) : 0;
  const completos = [...porDia].filter(([d, v]) => d <= ontem && v.venda > 0);
  const mediaDia = completos.length ? completos.reduce((s, [, v]) => s + v.venda, 0) / completos.length : 0;
  const diasAntAteHoje = [...porDiaAnt].filter(([d, v]) => d <= mesmoDia(ate, 1) && v.venda > 0).length;
  const mediaDiaAnt = diasAntAteHoje ? tMesAnt.venda / diasAntAteHoje : null;
  const vendaMesAntInteiro = [...porDiaAnt.values()].reduce((s, v) => s + v.venda, 0);
  const mediaSemana = (w: number) => {
    const xs = completos.filter(([d]) => diaDaSemana(d) === w).map(([, v]) => v.venda);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : mediaDia;
  };
  const faltamDias = Array.from({ length: diasNoMes - dia }, (_, i) => somarDias(ate, i + 1));
  const restoDeHoje = ultimo.parcial ? Math.max(0, mediaSemana(diaDaSemana(ate)) - vendaHoje) : 0;
  const projecao = tMes.venda + restoDeHoje + faltamDias.reduce((s, d) => s + mediaSemana(diaDaSemana(d)), 0);
  const projecaoSimples = tMes.venda + (ultimo.parcial ? Math.max(0, mediaDia - vendaHoje) : 0) + mediaDia * faltamDias.length;
  const realizado = projecao ? (tMes.venda / projecao) * 100 : 0;
  const decorrido = (dia / diasNoMes) * 100;
  const falta = Math.max(0, projecao - tMes.venda);
  // dias que ainda vão vender (hoje parcial conta como um)
  const diasPelaFrente = faltamDias.length + (ultimo.parcial ? 1 : 0);
  // meta do escopo (rede, regional ou a loja do gerente): soma das metas cadastradas das lojas mostradas
  const metaMes = lojasMes.reduce((s, l) => s + (metas.get(chaveMetaFilial(l)) ?? 0), 0);
  const faltaMeta = Math.max(0, metaMes - tMes.venda);

  // acumulado dia a dia (este mês e o anterior) para a linha de evolução
  const acumular = (mapa: Map<string, { venda: number }>, prefixo: string, ate: number) => {
    let soma = 0;
    return Array.from({ length: ate }, (_, i) => (soma += mapa.get(`${prefixo}-${String(i + 1).padStart(2, "0")}`)?.venda ?? 0));
  };
  const acumAtual = acumular(porDia, ate.slice(0, 7), dia);
  const acumAnterior = acumular(porDiaAnt, inicioMesAnt.slice(0, 7), Math.min(diasNoMes, ultimoDia(anoAnt, mesAntNum)));

  // ---------- regiões (sempre as três, para comparar) ----------
  const regioes = REGIONAIS_VENDAS.map((reg) => {
    const atual = somar(listaMes.filter((l) => l.regional === reg));
    const anterior = somar(listaMesAnt.filter((l) => l.regional === reg));
    return { reg, atual, anterior, lojas: listaMes.filter((l) => l.regional === reg).length, var: delta(atual.venda, anterior.venda) };
  })
    .filter((x) => x.lojas > 0)
    .sort((a, b) => b.atual.venda - a.atual.venda);
  // a rede = as três regiões + o televendas (a venda da equipe saiu das lojas)
  const totalRede = somar(listaMes).venda || 1;
  const maxRegiao = Math.max(1, ...regioes.map((x) => x.atual.venda));

  // ---------- composição ----------
  const outros = Math.max(0, tMes.vendaGrupos - tMes.generico - tMes.similares - tMes.premium - tMes.referencia);
  const fatias: FatiaComposicao[] = [
    { chave: "gen", rotulo: "Genéricos", valor: tMes.generico, cor: "text-emerald-600", ponto: "bg-emerald-600" },
    { chave: "sim", rotulo: "Similares", valor: tMes.similares, cor: "text-sky-600", ponto: "bg-sky-600" },
    { chave: "pre", rotulo: "Premium G47", valor: tMes.premium, cor: "text-violet-600", ponto: "bg-violet-600" },
    { chave: "ref", rotulo: "Referência", valor: tMes.referencia, cor: "text-amber-500", ponto: "bg-amber-500" },
    { chave: "out", rotulo: "Outros (perfumaria, conveniência…)", valor: outros, cor: "text-foreground/15", ponto: "bg-foreground/15" },
  ];
  const parte = (v: number) => (tMes.vendaGrupos ? (v / tMes.vendaGrupos) * 100 : null);
  const parteAnt = (v: number) => (tMesAnt.vendaGrupos ? (v / tMesAnt.vendaGrupos) * 100 : null);
  const foco = tMes.genSim + tMes.premium;
  const focoAnt = tMesAnt.genSim + tMesAnt.premium;

  // ---------- últimos 7 dias × mesmo dia da semana anterior ----------
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(ontem, i - 6)).map((d) => ({
    dia: d,
    rotulo: DIAS_SEMANA[diaDaSemana(d)],
    data: formatarData(d).slice(0, 5),
    atual: porDia14.get(d)?.venda ?? 0,
    anterior: porDia14.get(somarDias(d, -7))?.venda ?? 0,
  }));
  const vendaOntem = semana[6].atual;
  const vendaSemanaPassada = semana[6].anterior;

  // ---------- ano × ano ----------
  const barrasAno = MES_CURTO.map((rotulo, i) => {
    const a = porMes.get(`${ano - 1}-${String(i + 1).padStart(2, "0")}-01`)?.venda ?? 0;
    const b = porMes.get(`${ano}-${String(i + 1).padStart(2, "0")}-01`)?.venda ?? 0;
    return { rotulo, a, b, textoA: moeda(a), textoB: i + 1 > mes ? "—" : moeda(b) };
  });
  const temAnoAnterior = barrasAno.some((b) => b.a > 0);

  // ---------- destaques ----------
  const ranking = visaoLoja ? [] : lojasMes;
  const melhorLoja = [...ranking].sort((a, b) => b.venda - a.venda)[0] as LinhaFilialVendas | undefined;
  const anteriorDaLoja = new Map(lojasMesAnt.map((l) => [l.branchId, l.venda]));
  const variacoesLojas = ranking
    .map((l) => ({ l, v: delta(l.venda, anteriorDaLoja.get(l.branchId) ?? null) }))
    .filter((x): x is { l: LinhaFilialVendas; v: number } => x.v !== null && (anteriorDaLoja.get(x.l.branchId) ?? 0) > 10_000);
  const maiorAlta = [...variacoesLojas].sort((a, b) => b.v - a.v)[0];
  const maiorQueda = [...variacoesLojas].sort((a, b) => a.v - b.v)[0];
  const vMes = delta(tMes.venda, tMesAnt.venda);
  const vTicket = delta(tMes.ticket, tMesAnt.ticket);
  const vCmv = delta(tMes.cmv, tMesAnt.cmv, "pp");
  const vPremium = delta(tMes.pctPremium, tMesAnt.pctPremium, "pp");
  const vGenSim = delta(tMes.pctGenSim, tMesAnt.pctGenSim, "pp");
  const vOntem = delta(vendaOntem, vendaSemanaPassada);
  const loja = (l: LinhaFilialVendas) => <strong className="font-semibold">{l.regional === TELEVENDAS ? "Televendas" : ehTele(l) ? l.nome : `${l.codigo} ${l.nome}`}</strong>;
  const destaques: Destaque[] = [];
  if (vMes !== null) destaques.push({ tipo: vMes >= 0 ? "bom" : "ruim", peso: 10, texto: <>Venda do mês {vMes >= 0 ? "acima" : "abaixo"} de {nomeMesAnt} em {decimal(Math.abs(vMes), 1)}% no mesmo período ({moedaCurta(tMes.venda - tMesAnt.venda).replace("-", "−")}).</> });
  if (!visaoLoja && !regional && regioes.length) {
    const lider = regioes[0];
    destaques.push({ tipo: "info", peso: 9, texto: <><strong className="font-semibold">{lider.reg}</strong> lidera com {moedaCurta(lider.atual.venda)} ({pct((lider.atual.venda / totalRede) * 100, 1)} da rede).</> });
    const comVar = regioes.filter((x) => x.var !== null);
    const sobe = [...comVar].sort((a, b) => b.var! - a.var!)[0];
    const cai = [...comVar].sort((a, b) => a.var! - b.var!)[0];
    if (sobe && sobe.var! > 0) destaques.push({ tipo: "bom", peso: 8, texto: <><strong className="font-semibold">{sobe.reg}</strong> é a região que mais cresceu: +{decimal(sobe.var!, 1)}% sobre {nomeMesAnt}.</> });
    if (cai && cai.var! < 0) destaques.push({ tipo: "ruim", peso: 8, texto: <><strong className="font-semibold">{cai.reg}</strong> está {decimal(Math.abs(cai.var!), 1)}% abaixo de {nomeMesAnt}.</> });
  }
  if (melhorLoja) destaques.push({ tipo: "info", peso: 7, texto: <>{loja(melhorLoja)} é a loja que mais vendeu no mês: {moedaCurta(melhorLoja.venda)}.</> });
  if (maiorAlta && maiorAlta.v > 3) destaques.push({ tipo: "bom", peso: 6, texto: <>Maior alta: {loja(maiorAlta.l)}, +{decimal(maiorAlta.v, 1)}% sobre {nomeMesAnt}.</> });
  if (maiorQueda && maiorQueda.v < -3) destaques.push({ tipo: "ruim", peso: 6, texto: <>Maior queda: {loja(maiorQueda.l)}, −{decimal(Math.abs(maiorQueda.v), 1)}% sobre {nomeMesAnt}.</> });
  if (vCmv !== null && Math.abs(vCmv) >= 0.1) destaques.push({ tipo: vCmv < 0 ? "bom" : "ruim", peso: 5, texto: <>CMV em {pct(tMes.cmv, 1)}: {vCmv < 0 ? "caiu" : "subiu"} {decimal(Math.abs(vCmv), 1)} p.p. sobre {nomeMesAnt}.</> });
  if (vTicket !== null && Math.abs(vTicket) >= 0.5) destaques.push({ tipo: vTicket > 0 ? "bom" : "ruim", peso: 4, texto: <>Ticket médio de {moeda(tMes.ticket)}, {vTicket > 0 ? "+" : "−"}{decimal(Math.abs(vTicket), 1)}% sobre {nomeMesAnt}.</> });
  if (vPremium !== null && Math.abs(vPremium) >= 0.1) destaques.push({ tipo: vPremium > 0 ? "bom" : "ruim", peso: 3, texto: <>Premium em {pct(tMes.pctPremium, 1)} da venda ({vPremium > 0 ? "+" : "−"}{decimal(Math.abs(vPremium), 1)} p.p.).</> });
  if (vGenSim !== null && Math.abs(vGenSim) >= 0.1) destaques.push({ tipo: vGenSim > 0 ? "bom" : "ruim", peso: 3, texto: <>Genéricos + similares em {pct(tMes.pctGenSim, 1)} da venda ({vGenSim > 0 ? "+" : "−"}{decimal(Math.abs(vGenSim), 1)} p.p.).</> });
  if (vOntem !== null) destaques.push({ tipo: vOntem >= 0 ? "bom" : "ruim", peso: 2, texto: <>Ontem ({DIAS_SEMANA[diaDaSemana(ontem)].toLowerCase()}) vendeu {moedaCurta(vendaOntem)}, {vOntem >= 0 ? "+" : "−"}{decimal(Math.abs(vOntem), 1)}% sobre a semana passada.</> });
  const bons = destaques.filter((d) => d.tipo !== "ruim").sort((a, b) => b.peso - a.peso).slice(0, 4);
  const ruins = destaques.filter((d) => d.tipo === "ruim").sort((a, b) => b.peso - a.peso).slice(0, 4);

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        titulo="Painel de vendas"
        descricao={`${nomeMes} de ${ano}, ${ultimo.lidoEm ? `até hoje às ${horaNoBrasil(ultimo.lidoEm)} (o dia de hoje é parcial)` : `até ontem (${formatarData(ate)})`}. Números do Trier, lidos a cada 10 minutos das 7h às 23h50 e o dia inteiro de novo de madrugada.`}
        acoes={
          soLoja && opcoesLojas.length < 2 ? undefined : (
            <div className="flex flex-wrap items-center gap-2">
              {!soLoja && (
                <nav aria-label="Escopo" className="flex rounded-lg border bg-card p-0.5 text-sm">
                  {(["", ...REGIONAIS_VENDAS] as const).map((x) => {
                    const ativo = !filial && regional === x;
                    return (
                      <Link key={x || "rede"} href={x ? `/vendas?regional=${encodeURIComponent(x)}` : "/vendas"} aria-current={ativo ? "page" : undefined} className={cn("rounded-md px-3 py-1", ativo ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                        {x || "Rede"}
                      </Link>
                    );
                  })}
                </nav>
              )}
              <EscolhaFilial lojas={opcoesLojas} atual={lojaEscolhida ? filial : ""} />
            </div>
          )
        }
      />
      <AbasVendas ativa="/vendas" papel={sessao.papel} />
      <AtualizaSozinho />
      <AvisoDiasFaltando
        faltam={faltamMes.length}
        texto={`em ${nomeMes.toLowerCase()} (${faixasDeDias(faltamMes)})${faltamMesAnt.length ? ` e ${faltamMesAnt.length} em ${nomeMesAnt} (base das comparações)` : ""}`}
        admin={sessao.papel === "admin"}
      />

      {/* BLOCO 1 — resultado principal */}
      <section className="mb-4 overflow-hidden rounded-2xl border bg-card">
        <div className="grid lg:grid-cols-[1.1fr_1fr]">
          <div className="relative p-6 sm:p-8">
            <span className="absolute inset-y-0 left-0 w-1 bg-fct-red" aria-hidden />
            <p className="sobrescrito">
              Venda de {nomeMes.toLowerCase()} · {escopo}
            </p>
            <p className="mt-2 font-heading text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{moeda(tMes.venda)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Comparacao grande atual={tMes.venda} anterior={tMesAnt.venda} rotulo={`vs ${nomeMesAnt} até o dia ${dia}`} />
            </div>
            {ultimo.lidoEm && (
              <p className="mt-2 text-sm text-muted-foreground">
                Hoje até {horaNoBrasil(ultimo.lidoEm)}: <strong className="font-semibold text-foreground tabular-nums">{moeda(vendaHoje)}</strong> (parcial, já somado no mês)
              </p>
            )}
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
              <div>
                <dt className="rotulo">Média por dia</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{moedaCurta(mediaDia)}</dd>
                <dd className="mt-1">
                  <Comparacao atual={mediaDia} anterior={mediaDiaAnt} rotulo="" />
                </dd>
              </div>
              {visaoLoja ? (
                <div>
                  <dt className="rotulo">Atendimentos</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{inteiro(tMes.atendimentos)}</dd>
                  <dd className="mt-1">
                    <Comparacao atual={tMes.atendimentos} anterior={tMesAnt.atendimentos || null} rotulo="" />
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="rotulo">Lojas vendendo</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums">{lojasMes.length}</dd>
                  <dd className="mt-1 text-xs text-muted-foreground">{regional ? `regional ${regional}` : "Sul, Serra e Oeste"}</dd>
                </div>
              )}
              <div>
                <dt className="rotulo">Dias com venda</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {diasComVenda} de {diasNoMes}
                </dd>
                <dd className="mt-1 text-xs text-muted-foreground">{faltamDias.length ? `faltam ${faltamDias.length}` : "mês completo"}</dd>
              </div>
            </dl>
          </div>
          <div className="border-t bg-superficie/70 p-6 sm:p-8 lg:border-t-0 lg:border-l">
            <p className="sobrescrito flex items-center gap-1.5">
              <Target className="size-3.5" aria-hidden /> Projeção de fechamento
            </p>
            <p className="mt-2 font-heading text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{moeda(projecao)}</p>
            <div className="mt-3">
              <Comparacao atual={projecao} anterior={vendaMesAntInteiro || null} rotulo={`vs ${nomeMesAnt} fechado`} />
            </div>
            <div className="mt-5">
              <BarraProgresso pct={realizado} marca={decorrido} rotuloMarca={`hoje · ${decimal(decorrido, 0)}% do mês`} />
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground tabular-nums">
                <span>
                  <strong className="text-foreground">{pct(realizado, 1)}</strong> realizado
                </span>
                <span>{moedaCurta(projecao)}</span>
              </div>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="rotulo">{diasPelaFrente ? "Faltam para a projeção" : "Fechamento"}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{diasPelaFrente ? moedaCurta(falta) : moedaCurta(tMes.venda)}</dd>
                <dd className="text-xs text-muted-foreground">{diasPelaFrente ? `em ${diasPelaFrente} ${diasPelaFrente === 1 ? "dia" : "dias"}${ultimo.parcial ? " (com hoje)" : ""} · ${moedaCurta(falta / diasPelaFrente)}/dia` : "mês encerrado"}</dd>
              </div>
              <div>
                <dt className="rotulo">Pela média simples</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{moedaCurta(projecaoSimples)}</dd>
                <dd className="text-xs text-muted-foreground">média do dia × {diasNoMes} dias</dd>
              </div>
            </dl>
            {metaMes > 0 && (
              <div className="mt-5 rounded-xl border bg-card p-4">
                <p className="rotulo flex items-center gap-1.5">
                  <Target className="size-3.5" aria-hidden /> Meta do mês · {moedaCurta(metaMes)}
                </p>
                <div className="mt-3">
                  <BarraProgresso pct={(tMes.venda / metaMes) * 100} marca={decorrido} rotuloMarca={`hoje · ${decimal(decorrido, 0)}%`} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="rotulo">Atingido</dt>
                    <dd className={cn("mt-0.5 font-semibold tabular-nums", tMes.venda >= metaMes && "text-emerald-700")}>{pct((tMes.venda / metaMes) * 100, 1)}</dd>
                  </div>
                  <div>
                    <dt className="rotulo">Projeção</dt>
                    <dd className={cn("mt-0.5 font-semibold tabular-nums", projecao >= metaMes ? "text-emerald-700" : "text-amber-700")}>{pct((projecao / metaMes) * 100, 1)}</dd>
                  </div>
                  <div>
                    <dt className="rotulo">{faltaMeta > 0 ? "Falta" : "Meta"}</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums">{faltaMeta > 0 ? moedaCurta(faltaMeta) : "batida"}</dd>
                    {faltaMeta > 0 && diasPelaFrente > 0 && <dd className="text-xs text-muted-foreground">{moedaCurta(faltaMeta / diasPelaFrente)}/dia</dd>}
                  </div>
                </dl>
              </div>
            )}
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">A projeção soma ao realizado a média de cada dia da semana no mês (domingo vende diferente de segunda){ultimo.parcial ? "; para hoje, só o que falta para a média do dia" : ""}.{metaMes > 0 ? " A meta é a soma das metas cadastradas das lojas mostradas." : visaoLoja ? "" : " Cadastre a meta em Comercial → Metas e ela aparece aqui."}</p>
          </div>
        </div>
      </section>

      {/* indicadores de apoio */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi rotulo={`Venda de ${ano}`} valor={moedaCurta(vendaAno)} comparacao={<Comparacao atual={vendaAno} anterior={vendaAnoAnt || null} rotulo={`vs ${ano - 1}`} />} detalhe={`1º/jan até ${formatarData(ate).slice(0, 5)}${ultimo.parcial ? " (hoje parcial)" : ""}`} />
        <MiniKpi rotulo={`Ontem (${DIAS_SEMANA[diaDaSemana(ontem)].toLowerCase()})`} valor={moedaCurta(vendaOntem)} comparacao={<Comparacao atual={vendaOntem} anterior={vendaSemanaPassada || null} rotulo="vs semana passada" />} />
        <MiniKpi rotulo="CMV do mês" valor={pct(tMes.cmv, 1)} comparacao={<Comparacao atual={tMes.cmv} anterior={tMesAnt.cmv} formato="pp" inverso rotulo={`vs ${nomeMesAnt}`} />} detalhe={`rentabilidade ${pct(tMes.rentab, 1)}`} />
        {visaoLoja ? (
          <MiniKpi rotulo="Ticket médio" valor={moeda(tMes.ticket)} comparacao={<Comparacao atual={tMes.ticket} anterior={tMesAnt.ticket || null} rotulo={`vs ${nomeMesAnt}`} />} detalhe={`${decimal(tMes.sacola, 2)} unidades por atendimento`} />
        ) : (
        <MiniKpi
          rotulo="Loja que mais vendeu"
          valor={melhorLoja ? moedaCurta(melhorLoja.venda) : "—"}
          detalhe={
            melhorLoja ? (
              <Link href="/vendas/filiais" className="hover:underline">
                {melhorLoja.codigo} {melhorLoja.nome}
              </Link>
            ) : undefined
          }
        />
        )}
      </div>

      {/* destaques */}
      {(bons.length > 0 || ruins.length > 0) && (
        <Secao titulo="Destaques do período" icone={Sparkles} subtitulo={`O que mudou em ${nomeMes.toLowerCase()} até o dia ${dia}, comparado com ${nomeMesAnt} no mesmo período.`} className="mb-4">
          <div className="grid gap-4 md:grid-cols-2">
            <ul className="space-y-2">
              <li className="sobrescrito text-emerald-800">Pontos positivos e resumo</li>
              {bons.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {d.tipo === "bom" ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />}
                  <span>{d.texto}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2">
              <li className="sobrescrito text-red-800">Pontos de atenção</li>
              {ruins.length ? (
                ruins.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
                    <span>{d.texto}</span>
                  </li>
                ))
              ) : (
                <li className="text-sm text-muted-foreground">{vMes === null ? `Sem ${nomeMesAnt} guardado para comparar ainda (o histórico está chegando).` : "Nada caindo no período."}</li>
              )}
            </ul>
          </div>
        </Secao>
      )}

      {/* regiões + composição */}
      <div className={cn("mb-4 grid gap-4", !visaoLoja && "xl:grid-cols-2")}>
        {!visaoLoja && (
        <Secao titulo="Performance por região" icone={MapPinned} subtitulo={`Venda de ${nomeMes.toLowerCase()} até o dia ${dia} e participação na rede`} acao={<LinkPainel href="/vendas/filiais">lojas</LinkPainel>}>
          <ol className="space-y-4">
            {regioes.map((x, i) => (
              <li key={x.reg}>
                <Link href={`/vendas?regional=${encodeURIComponent(x.reg)}`} className={cn("group block rounded-xl border p-3 transition-colors hover:border-primary/40", regional === x.reg && "border-primary ring-1 ring-primary")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={cn("inline-grid size-7 place-items-center rounded-full text-xs font-bold", MEDALHA[i] ?? "bg-muted text-muted-foreground")}>{i + 1}º</span>
                    <span className="font-heading text-sm font-semibold">{x.reg}</span>
                    {i === 0 && <Trophy className="size-4 text-amber-500" aria-label="melhor região" />}
                    <span className="text-xs text-muted-foreground">{x.lojas} lojas</span>
                    <span className="ml-auto font-semibold tabular-nums">{moedaCurta(x.atual.venda)}</span>
                  </div>
                  <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", i === 0 ? "bg-fct-red" : "bg-foreground/45")} style={{ width: `${(x.atual.venda / maxRegiao) * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <strong className="text-foreground tabular-nums">{pct((x.atual.venda / totalRede) * 100, 1)}</strong> da rede
                    </span>
                    <span className="tabular-nums">ticket {moeda(x.atual.ticket)}</span>
                    <span className="tabular-nums">CMV {pct(x.atual.cmv, 1)}</span>
                    <Comparacao className="ml-auto" atual={x.atual.venda} anterior={x.anterior.venda} rotulo={`vs ${nomeMesAnt}`} />
                  </div>
                </Link>
              </li>
            ))}
          </ol>
          {tele.venda > 0 && (
            <Link href="/vendas/televendas" className="mt-4 block rounded-xl border border-dashed border-sky-300 bg-sky-50/50 p-3 transition-colors hover:border-sky-500 dark:border-sky-800 dark:bg-sky-950/20">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-grid size-7 place-items-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200">
                  <Headset className="size-4" aria-hidden />
                </span>
                <span className="font-heading text-sm font-semibold">Televendas</span>
                <span className="text-xs text-muted-foreground">{tele.vendedores} vendedores · já somado nas regiões (cada central conta como uma filial)</span>
                <span className="ml-auto font-semibold tabular-nums">{moedaCurta(tele.venda)}</span>
              </div>
              <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-sky-600" style={{ width: `${(tele.venda / maxRegiao) * 100}%` }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <strong className="text-foreground tabular-nums">{pct((tele.venda / totalRede) * 100, 1)}</strong> da rede
                </span>
                <span className="tabular-nums">ticket {moeda(tele.ticket)}</span>
                <span className="tabular-nums">CMV {pct(tele.cmv, 1)}</span>
                <Comparacao className="ml-auto" atual={tele.venda} anterior={teleAnt.venda} rotulo={`vs ${nomeMesAnt}`} />
              </div>
            </Link>
          )}
        </Secao>
        )}

        <Secao titulo="Composição das vendas" icone={PieChart} subtitulo={`Participação de cada grupo na venda de ${nomeMes.toLowerCase()} · ${escopo}`}>
          <div className="grid items-center gap-6 sm:grid-cols-[180px_1fr]">
            <Rosca
              fatias={fatias}
              legenda={`Composição: ${fatias.map((f) => `${f.rotulo} ${pct(parte(f.valor), 1)}`).join(", ")}`}
              centro={
                <div>
                  <p className="font-heading text-2xl font-semibold tabular-nums">{pct(parte(foco), 1)}</p>
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    gen + sim
                    <br />+ premium
                  </p>
                </div>
              }
            />
            <div className="space-y-3">
              {[
                { rotulo: "Genéricos + similares", valor: tMes.genSim, ant: tMesAnt.genSim, cor: "bg-linear-to-r from-emerald-600 to-sky-600" },
                { rotulo: "Premium G47", valor: tMes.premium, ant: tMesAnt.premium, cor: "bg-violet-600" },
                { rotulo: "Total gen + sim + premium", valor: foco, ant: focoAnt, cor: "bg-fct-red", forte: true },
              ].map((g) => (
                <div key={g.rotulo} className={cn(g.forte && "rounded-lg bg-muted/60 p-2.5")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className={cn("text-sm", g.forte ? "font-semibold" : "font-medium")}>{g.rotulo}</span>
                    <span className="text-sm font-semibold tabular-nums">{moeda(g.valor)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", g.cor)} style={{ width: `${Math.min(100, parte(g.valor) ?? 0)}%` }} />
                    </div>
                    <span className="w-12 text-right text-xs font-semibold tabular-nums">{pct(parte(g.valor), 1)}</span>
                  </div>
                  <div className="mt-1">
                    <Comparacao atual={parte(g.valor)} anterior={parteAnt(g.ant)} formato="pp" rotulo={`de participação vs ${nomeMesAnt}`} />
                  </div>
                </div>
              ))}
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
                {fatias.map((f) => (
                  <li key={f.chave} className="flex items-center gap-1.5">
                    <span className={cn("size-2 shrink-0 rounded-sm", f.ponto)} aria-hidden />
                    <span className="truncate">{f.rotulo}</span>
                    <span className="ml-auto tabular-nums">{pct(parte(f.valor), 1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Secao>
      </div>

      {/* operação */}
      <Secao titulo="Operação" icone={Activity} subtitulo="Atendimentos × ticket médio = venda · unidades ÷ atendimentos = unidades por atendimento" className="mb-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Fator rotulo="Atendimentos" valor={inteiro(tMes.atendimentos)} atual={tMes.atendimentos} anterior={tMesAnt.atendimentos} mes={nomeMesAnt} />
          <Operador simbolo="×" />
          <Fator rotulo="Ticket médio" valor={moeda(tMes.ticket)} atual={tMes.ticket} anterior={tMesAnt.ticket} mes={nomeMesAnt} />
          <Operador simbolo="≈" />
          <Fator rotulo="Venda do mês" valor={moedaCurta(tMes.venda)} atual={tMes.venda} anterior={tMesAnt.venda} mes={nomeMesAnt} destaque />
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Fator rotulo="Unidades vendidas" valor={inteiro(tMes.unidades)} atual={tMes.unidades} anterior={tMesAnt.unidades} mes={nomeMesAnt} />
          <Operador simbolo="÷" />
          <Fator rotulo="Atendimentos" valor={inteiro(tMes.atendimentos)} atual={tMes.atendimentos} anterior={tMesAnt.atendimentos} mes={nomeMesAnt} />
          <Operador simbolo="=" />
          <Fator rotulo="Unidades por atendimento" valor={decimal(tMes.sacola, 2)} atual={tMes.sacola} anterior={tMesAnt.sacola} mes={nomeMesAnt} destaque />
        </div>
      </Secao>

      {/* gráficos */}
      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <Secao titulo="Venda diária — últimos 7 dias" icone={CalendarDays} subtitulo="Cada dia comparado com o mesmo dia da semana anterior" acao={visaoLoja ? undefined : <LinkPainel href={`/vendas/filiais?ver=dia&de=${somarDias(ontem, -6)}&ate=${ontem}`}>por filial</LinkPainel>}>
          <ColunasSemana dias={semana} />
        </Secao>
        <Secao titulo="Evolução do mês" icone={ChartLine} subtitulo={`Venda acumulada dia a dia, ${nomeMesAnt} no mesmo dia e a projeção até o dia ${diasNoMes}`}>
          <EvolucaoMes atual={acumAtual} anterior={acumAnterior} projecao={projecao} diasNoMes={diasNoMes} rotuloAnterior={nomeMesAnt[0].toUpperCase() + nomeMesAnt.slice(1)} />
        </Secao>
      </div>
      <Secao
        titulo={`Venda por mês: ${ano - 1} × ${ano}`}
        icone={BarChart3}
        subtitulo={temAnoAnterior ? `${ano - 1}: ${moedaCurta(barrasAno.reduce((s, b) => s + b.a, 0))} · ${ano} até agora: ${moedaCurta(vendaAno)}` : `O histórico de ${ano - 1} ainda está chegando: o robô traz aos poucos, de madrugada.`}
      >
        <BarrasDuplas dados={barrasAno} rotuloA={String(ano - 1)} rotuloB={String(ano)} titulo={`Venda por mês, ${ano - 1} e ${ano}`} />
      </Secao>
    </>
  );
}

function Fator({ rotulo, valor, atual, anterior, mes, destaque = false }: { rotulo: string; valor: string; atual: number | null; anterior: number | null; mes: string; destaque?: boolean }) {
  return (
    <div className={cn("rounded-xl border p-4", destaque ? "border-fct-red/30 bg-fct-red/5" : "bg-card")}>
      <p className="rotulo">{rotulo}</p>
      <p className={cn("mt-1 tabular-nums", destaque ? "numero" : "numero-sm")}>{valor}</p>
      <div className="mt-2">
        <Comparacao atual={atual} anterior={anterior || null} rotulo={`vs ${mes}`} />
      </div>
    </div>
  );
}

function Operador({ simbolo }: { simbolo: string }) {
  return (
    <div className="hidden items-center justify-center text-2xl font-light text-muted-foreground lg:flex" aria-hidden>
      {simbolo}
    </div>
  );
}
