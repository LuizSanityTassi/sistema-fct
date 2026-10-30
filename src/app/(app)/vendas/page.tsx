import Link from "next/link";
import { Activity, BarChart3, CalendarDays, ChartLine, CircleAlert, CircleCheck, Headset, Info, MapPinned, PieChart, Sparkles, Target, Trophy } from "lucide-react";
import { cn } from "cn";
import { BarrasDuplas } from "@/components/graficos";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, LinkPainel } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { DIAS_SEMANA, diaDaSemana, diasSemVendas, ehRegionalVendas, faixasDeDias, hojeNoBrasil, MESES, mesmoDia, porPeriodo, REGIONAIS_VENDAS, resumirTelevendas, serieVendas, somar, somarDias, televendasNoPeriodo, ultimoDia, vendasPorFilial, type LinhaFilialVendas, type RegionalVendas } from "@/lib/data/vendas";
import { formatarData } from "@/lib/formatos";
import { AbasVendas, AvisoDiasFaltando, decimal, inteiro, moeda, moedaCurta, pct } from "./comum";
import { BarraProgresso, ColunasSemana, Comparacao, delta, EvolucaoMes, MiniKpi, Rosca, Secao, type FatiaComposicao } from "./painel-visual";

export const metadata = { title: "Painel de vendas" };

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MEDALHA = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-300 text-orange-950"];

type Destaque = { tipo: "bom" | "ruim" | "info"; texto: React.ReactNode; peso: number };

export default async function PainelVendasPage({ searchParams }: PageProps<"/vendas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas"), searchParams]);
  // gerente: só a(s) loja(s) dele (a RLS já filtra); sem regionais nem ranking de lojas
  const soLoja = sessao.papel === "gerente";
  const regional: RegionalVendas | "" = !soLoja && typeof sp.regional === "string" && ehRegionalVendas(sp.regional) ? sp.regional : "";
  const ontem = somarDias(hojeNoBrasil(), -1);
  const [ano, mes, dia] = ontem.split("-").map(Number);
  const inicioMes = `${ontem.slice(0, 7)}-01`;
  const inicioMesAnt = mesmoDia(inicioMes, 1);
  const [anoAnt, mesAntNum] = inicioMesAnt.split("-").map(Number);
  const fimMesAnt = `${inicioMesAnt.slice(0, 7)}-${String(ultimoDia(anoAnt, mesAntNum)).padStart(2, "0")}`;

  const [listaMes, listaMesAnt, listaAnoAnt, meses, diasDoMes, diasDoMesAnt, quinzena, faltamMes, faltamMesAnt, teleLinhas, teleLinhasAnt] = await Promise.all([
    vendasPorFilial(inicioMes, ontem),
    vendasPorFilial(inicioMesAnt, mesmoDia(ontem, 1)),
    vendasPorFilial(`${ano - 1}-01-01`, mesmoDia(ontem, 12)),
    serieVendas(`${ano - 1}-01-01`, ontem, "mes"),
    serieVendas(inicioMes, ontem, "dia"),
    serieVendas(inicioMesAnt, fimMesAnt, "dia"),
    serieVendas(somarDias(ontem, -13), ontem, "dia"),
    diasSemVendas(inicioMes, ontem),
    diasSemVendas(inicioMesAnt, fimMesAnt),
    // televendas (equipe de tele-vendas): a RLS não devolve nada para o gerente
    soLoja ? Promise.resolve([]) : televendasNoPeriodo(inicioMes, ontem),
    soLoja ? Promise.resolve([]) : televendasNoPeriodo(inicioMesAnt, mesmoDia(ontem, 1)),
  ]);
  const tele = resumirTelevendas(teleLinhas);
  const teleAnt = resumirTelevendas(teleLinhasAnt);

  const r = regional || undefined;
  const filtra = <T extends { regional: string }>(xs: T[]) => (r ? xs.filter((x) => x.regional === r) : xs);
  const lojasMes = filtra(listaMes);
  const lojasMesAnt = filtra(listaMesAnt);
  const tMes = somar(lojasMes);
  const tMesAnt = somar(lojasMesAnt);
  const porMes = porPeriodo(meses, r);
  const vendaAno = [...porMes].filter(([p]) => p >= `${ano}-01-01`).reduce((s, [, v]) => s + v.venda, 0);
  const vendaAnoAnt = somar(filtra(listaAnoAnt)).venda;
  const porDia = porPeriodo(diasDoMes, r);
  const porDiaAnt = porPeriodo(diasDoMesAnt, r);
  const porDia14 = porPeriodo(quinzena, r);
  const nomeMes = MESES[mes - 1];
  const nomeMesAnt = MESES[mesAntNum - 1].toLowerCase();
  const escopo = soLoja ? (lojasMes.length === 1 ? `${lojasMes[0].codigo} ${lojasMes[0].nome}` : "suas lojas") : regional || "Rede";

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
  const mediaDia = diasComVenda ? tMes.venda / diasComVenda : 0;
  const diasAntAteHoje = [...porDiaAnt].filter(([d, v]) => d <= mesmoDia(ontem, 1) && v.venda > 0).length;
  const mediaDiaAnt = diasAntAteHoje ? tMesAnt.venda / diasAntAteHoje : null;
  const vendaMesAntInteiro = [...porDiaAnt.values()].reduce((s, v) => s + v.venda, 0);
  const mediaSemana = (w: number) => {
    const xs = [...porDia].filter(([d, v]) => diaDaSemana(d) === w && v.venda > 0).map(([, v]) => v.venda);
    return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : mediaDia;
  };
  const faltamDias = Array.from({ length: diasNoMes - dia }, (_, i) => somarDias(ontem, i + 1));
  const projecao = tMes.venda + faltamDias.reduce((s, d) => s + mediaSemana(diaDaSemana(d)), 0);
  const projecaoSimples = tMes.venda + mediaDia * faltamDias.length;
  const realizado = projecao ? (tMes.venda / projecao) * 100 : 0;
  const decorrido = (dia / diasNoMes) * 100;
  const falta = Math.max(0, projecao - tMes.venda);

  // acumulado dia a dia (este mês e o anterior) para a linha de evolução
  const acumular = (mapa: Map<string, { venda: number }>, prefixo: string, ate: number) => {
    let soma = 0;
    return Array.from({ length: ate }, (_, i) => (soma += mapa.get(`${prefixo}-${String(i + 1).padStart(2, "0")}`)?.venda ?? 0));
  };
  const acumAtual = acumular(porDia, ontem.slice(0, 7), dia);
  const acumAnterior = acumular(porDiaAnt, inicioMesAnt.slice(0, 7), Math.min(diasNoMes, ultimoDia(anoAnt, mesAntNum)));

  // ---------- regiões (sempre as três, para comparar) ----------
  const regioes = REGIONAIS_VENDAS.map((reg) => {
    const atual = somar(listaMes.filter((l) => l.regional === reg));
    const anterior = somar(listaMesAnt.filter((l) => l.regional === reg));
    return { reg, atual, anterior, lojas: listaMes.filter((l) => l.regional === reg).length, var: delta(atual.venda, anterior.venda) };
  })
    .filter((x) => x.lojas > 0)
    .sort((a, b) => b.atual.venda - a.atual.venda);
  const totalRede = regioes.reduce((s, x) => s + x.atual.venda, 0) || 1;
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
  const ranking = soLoja ? [] : lojasMes;
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
  const loja = (l: LinhaFilialVendas) => (
    <strong className="font-semibold">
      {l.codigo} {l.nome}
    </strong>
  );
  const destaques: Destaque[] = [];
  if (vMes !== null) destaques.push({ tipo: vMes >= 0 ? "bom" : "ruim", peso: 10, texto: <>Venda do mês {vMes >= 0 ? "acima" : "abaixo"} de {nomeMesAnt} em {decimal(Math.abs(vMes), 1)}% no mesmo período ({moedaCurta(tMes.venda - tMesAnt.venda).replace("-", "−")}).</> });
  if (!soLoja && !regional && regioes.length) {
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
        descricao={`${nomeMes} de ${ano}, até ontem (${formatarData(ontem)}). Números do Trier, atualizados toda madrugada.`}
        acoes={
          soLoja ? undefined : (
            <nav aria-label="Escopo" className="flex rounded-lg border bg-card p-0.5 text-sm">
              {(["", ...REGIONAIS_VENDAS] as const).map((x) => (
                <Link key={x || "rede"} href={x ? `/vendas?regional=${encodeURIComponent(x)}` : "/vendas"} aria-current={regional === x ? "page" : undefined} className={cn("rounded-md px-3 py-1", regional === x ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {x || "Rede"}
                </Link>
              ))}
            </nav>
          )
        }
      />
      <AbasVendas ativa="/vendas" papel={sessao.papel} />
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
            <dl className="mt-6 grid grid-cols-3 gap-4 border-t pt-4 text-sm">
              <div>
                <dt className="rotulo">Média por dia</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{moedaCurta(mediaDia)}</dd>
                <dd className="mt-1">
                  <Comparacao atual={mediaDia} anterior={mediaDiaAnt} rotulo="" />
                </dd>
              </div>
              {soLoja ? (
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
                <dt className="rotulo">{faltamDias.length ? "Faltam para a projeção" : "Fechamento"}</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{faltamDias.length ? moedaCurta(falta) : moedaCurta(tMes.venda)}</dd>
                <dd className="text-xs text-muted-foreground">{faltamDias.length ? `em ${faltamDias.length} ${faltamDias.length === 1 ? "dia" : "dias"} · ${moedaCurta(falta / faltamDias.length)}/dia` : "mês encerrado"}</dd>
              </div>
              <div>
                <dt className="rotulo">Pela média simples</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">{moedaCurta(projecaoSimples)}</dd>
                <dd className="text-xs text-muted-foreground">média do dia × {diasNoMes} dias</dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">A projeção soma ao realizado a média de cada dia da semana no mês (domingo vende diferente de segunda). Quando houver meta cadastrada, ela aparece aqui.</p>
          </div>
        </div>
      </section>

      {/* indicadores de apoio */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniKpi rotulo={`Venda de ${ano}`} valor={moedaCurta(vendaAno)} comparacao={<Comparacao atual={vendaAno} anterior={vendaAnoAnt || null} rotulo={`vs ${ano - 1}`} />} detalhe={`1º/jan até ${formatarData(ontem).slice(0, 5)}`} />
        <MiniKpi rotulo={`Ontem (${DIAS_SEMANA[diaDaSemana(ontem)].toLowerCase()})`} valor={moedaCurta(vendaOntem)} comparacao={<Comparacao atual={vendaOntem} anterior={vendaSemanaPassada || null} rotulo="vs semana passada" />} />
        <MiniKpi rotulo="CMV do mês" valor={pct(tMes.cmv, 1)} comparacao={<Comparacao atual={tMes.cmv} anterior={tMesAnt.cmv} formato="pp" inverso rotulo={`vs ${nomeMesAnt}`} />} detalhe={`rentabilidade ${pct(tMes.rentab, 1)}`} />
        {soLoja ? (
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
      <div className={cn("mb-4 grid gap-4", !soLoja && "xl:grid-cols-2")}>
        {!soLoja && (
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
                <span className="text-xs text-muted-foreground">{tele.vendedores} vendedores · já dentro das regiões acima</span>
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
        <Secao titulo="Venda diária — últimos 7 dias" icone={CalendarDays} subtitulo="Cada dia comparado com o mesmo dia da semana anterior" acao={soLoja ? undefined : <LinkPainel href={`/vendas/filiais?ver=dia&de=${somarDias(ontem, -6)}&ate=${ontem}`}>por filial</LinkPainel>}>
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
