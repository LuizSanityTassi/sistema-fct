import Link from "next/link";
import { BarChart3, CalendarDays, ChartLine, Store } from "lucide-react";
import { BarraProporcao, BarrasDuplas } from "@/components/graficos";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, LinkPainel, Painel } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { DIAS_SEMANA, diaDaSemana, hojeNoBrasil, MESES, mesmoDia, porPeriodo, REGIONAIS_VENDAS, serieVendas, somar, somarDias, ultimoDia, vendasPorFilial } from "@/lib/data/vendas";
import { formatarData } from "@/lib/formatos";
import { AbasVendas, decimal, inteiro, moeda, pct, variacao, variacaoPp } from "./comum";

export const metadata = { title: "Painel de vendas" };

const MES_CURTO = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default async function PainelVendasPage() {
  const sessao = await exigirAcesso("/vendas");
  const ontem = somarDias(hojeNoBrasil(), -1);
  const [ano, mes, dia] = ontem.split("-").map(Number);
  const inicioMes = `${ontem.slice(0, 7)}-01`;
  const inicioAno = `${ano}-01-01`;
  const semanaPassada = somarDias(ontem, -7);

  const [mesAtual, mesAnterior, anoAnterior, doDia, daSemanaPassada, meses, diasDoMes, ultimos7] = await Promise.all([
    vendasPorFilial(inicioMes, ontem),
    vendasPorFilial(mesmoDia(inicioMes, 1), mesmoDia(ontem, 1)),
    vendasPorFilial(`${ano - 1}-01-01`, mesmoDia(ontem, 12)),
    vendasPorFilial(ontem, ontem),
    vendasPorFilial(semanaPassada, semanaPassada),
    serieVendas(`${ano - 1}-01-01`, ontem, "mes"),
    serieVendas(inicioMes, ontem, "dia"),
    serieVendas(somarDias(ontem, -6), ontem, "dia"),
  ]);

  const tMes = somar(mesAtual);
  const tMesAnt = somar(mesAnterior);
  const porMes = porPeriodo(meses);
  const vendaAno = [...porMes].filter(([p]) => p >= inicioAno).reduce((s, [, v]) => s + v.venda, 0);
  const tAnoAnt = somar(anoAnterior);
  const tDia = somar(doDia);
  const tSemana = somar(daSemanaPassada);
  const nomeMesAnt = MESES[(mes + 10) % 12].toLowerCase();
  const nomeDia = DIAS_SEMANA[diaDaSemana(ontem)].toLowerCase();

  // projeção do mês: pela média por dia e pela média de cada dia da semana (domingo vende menos que segunda…)
  const diasNoMes = ultimoDia(ano, mes);
  const porDia = porPeriodo(diasDoMes);
  const vendasDias = [...porDia].map(([d, v]) => ({ semana: diaDaSemana(d), venda: v.venda }));
  const mediaDia = vendasDias.length ? tMes.venda / vendasDias.length : 0;
  const mediaSemana = (w: number) => {
    const xs = vendasDias.filter((v) => v.semana === w);
    return xs.length ? xs.reduce((s, v) => s + v.venda, 0) / xs.length : mediaDia;
  };
  const faltam = Array.from({ length: diasNoMes - dia }, (_, i) => somarDias(ontem, i + 1));
  const projecaoMedia = tMes.venda + mediaDia * faltam.length;
  const projecaoSemana = tMes.venda + faltam.reduce((s, d) => s + mediaSemana(diaDaSemana(d)), 0);

  const regionais = REGIONAIS_VENDAS.map((r) => ({ r, atual: somar(mesAtual.filter((l) => l.regional === r)), anterior: somar(mesAnterior.filter((l) => l.regional === r)), lojas: mesAtual.filter((l) => l.regional === r).length })).filter((x) => x.lojas > 0);
  const premiumGenSim = tMes.premium + tMes.genSim;
  const semDados = !mesAtual.length && !porMes.size;

  const sete = Array.from({ length: 7 }, (_, i) => somarDias(ontem, i - 6)).map((d) => ({ d, venda: porPeriodo(ultimos7).get(d)?.venda ?? 0 }));
  const maxSete = Math.max(1, ...sete.map((x) => x.venda));
  const barrasAno = MES_CURTO.map((rotulo, i) => {
    const a = porMes.get(`${ano - 1}-${String(i + 1).padStart(2, "0")}-01`)?.venda ?? 0;
    const b = porMes.get(`${ano}-${String(i + 1).padStart(2, "0")}-01`)?.venda ?? 0;
    return { rotulo, a, b, textoA: moeda(a), textoB: i + 1 > mes ? "—" : moeda(b) };
  });
  const ateDia = `até ${formatarData(ontem).slice(0, 5)}`;

  return (
    <>
      <PageHeader eyebrow="Vendas" titulo="Painel de vendas" descricao={`Números do Trier até ontem (${formatarData(ontem)}), atualizados toda madrugada. Só as regionais Sul, Serra e Oeste.`} />
      <AbasVendas ativa="/vendas" papel={sessao.papel} />

      {semDados ? (
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
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Indicador rotulo={`Venda de ${ano}`} valor={moeda(vendaAno)} variacao={variacao(vendaAno, tAnoAnt.venda, `${ano - 1} no mesmo período`)} comparadoCom={tAnoAnt.venda ? `× ${ano - 1} ${ateDia}` : "sem base de comparação"} detalhe={ateDia} />
            <Indicador rotulo={`Venda de ${MESES[mes - 1].toLowerCase()}`} valor={moeda(tMes.venda)} variacao={variacao(tMes.venda, tMesAnt.venda, `${nomeMesAnt} até o dia ${dia}`)} comparadoCom={`× ${nomeMesAnt} até dia ${dia}`} href="/vendas/filiais" />
            <Indicador rotulo={`Venda de ontem (${nomeDia})`} valor={moeda(tDia.venda)} variacao={variacao(tDia.venda, tSemana.venda, `${nomeDia} passada`)} comparadoCom={`× ${nomeDia} passada`} href={`/vendas/filiais?ver=dia&de=${ontem}&ate=${ontem}`} />
            {regionais.map((x) => (
              <Indicador key={x.r} rotulo={`Mês ${x.r}`} valor={moeda(x.atual.venda)} variacao={variacao(x.atual.venda, x.anterior.venda, `${nomeMesAnt} até o dia ${dia}`)} comparadoCom={`× ${nomeMesAnt}`} detalhe={`${x.lojas} lojas`} href={`/vendas/filiais?regional=${encodeURIComponent(x.r)}`} />
            ))}
          </div>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador rotulo="Genéricos + similares (mês)" valor={moeda(tMes.genSim)} detalhe={`${pct(tMes.pctGenSim, 1)} da venda`} variacao={variacaoPp(tMes.pctGenSim, tMesAnt.pctGenSim, nomeMesAnt)} comparadoCom="participação" />
            <Indicador rotulo="Premium G47 (mês)" valor={moeda(tMes.premium)} detalhe={`${pct(tMes.pctPremium, 1)} da venda`} variacao={variacaoPp(tMes.pctPremium, tMesAnt.pctPremium, nomeMesAnt)} comparadoCom="participação" />
            <Indicador rotulo="Gen. + sim. + premium (mês)" valor={moeda(premiumGenSim)} detalhe={`${pct(tMes.vendaGrupos ? (premiumGenSim / tMes.vendaGrupos) * 100 : null, 1)} da venda`} />
            <Indicador rotulo="CMV do mês" valor={pct(tMes.cmv)} variacao={variacaoPp(tMes.cmv, tMesAnt.cmv, nomeMesAnt, true)} comparadoCom={`× ${nomeMesAnt}`} detalhe="custo ÷ venda" />
            <Indicador rotulo="Projeção do mês (média do dia)" valor={moeda(projecaoMedia)} detalhe={`${moeda(mediaDia)} por dia × ${diasNoMes} dias`} />
            <Indicador rotulo="Projeção do mês (dia da semana)" valor={moeda(projecaoSemana)} detalhe="média de cada dia da semana no mês" />
            <Indicador rotulo="Ticket médio (mês)" valor={moeda(tMes.ticket)} variacao={variacao(tMes.ticket, tMesAnt.ticket, nomeMesAnt)} comparadoCom={`× ${nomeMesAnt}`} />
            <Indicador rotulo="Atendimentos (mês)" valor={inteiro(tMes.atendimentos)} variacao={variacao(tMes.atendimentos, tMesAnt.atendimentos, `${nomeMesAnt} até o dia ${dia}`)} comparadoCom={`× ${nomeMesAnt}`} detalhe={`${inteiro(tMes.unidades)} unidades · ${decimal(tMes.sacola, 1)} por atendimento`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <Painel titulo="Últimos 7 dias" icone={CalendarDays} descricao="Venda de cada dia (todas as lojas)" acao={<LinkPainel href={`/vendas/filiais?ver=dia&de=${somarDias(ontem, -6)}&ate=${ontem}`}>por filial</LinkPainel>}>
              <ul className="space-y-2.5 border-t px-5 py-4">
                {sete.map((x) => (
                  <li key={x.d} className="grid grid-cols-[5.5rem_1fr_7.5rem] items-center gap-3 text-sm">
                    <span>
                      {DIAS_SEMANA[diaDaSemana(x.d)]} <span className="text-xs text-muted-foreground">{formatarData(x.d).slice(0, 5)}</span>
                    </span>
                    <BarraProporcao pct={(x.venda / maxSete) * 100} className="bg-emerald-600" />
                    <span className="text-right tabular-nums">{x.venda ? moeda(x.venda) : "—"}</span>
                  </li>
                ))}
              </ul>
            </Painel>
            <Painel titulo={`Venda por mês: ${ano - 1} × ${ano}`} icone={ChartLine} descricao={porMes.size ? undefined : "O histórico ainda está chegando (o robô traz aos poucos, de madrugada)."}>
              <div className="border-t px-5 py-4">
                <BarrasDuplas dados={barrasAno} rotuloA={String(ano - 1)} rotuloB={String(ano)} titulo={`Venda por mês, ${ano - 1} e ${ano}`} />
              </div>
            </Painel>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            <Store className="mr-1 inline size-3.5" aria-hidden />
            Ranking das lojas em{" "}
            <Link href="/vendas/filiais" className="underline">
              Venda por filial
            </Link>
            . Mês anterior comparado até o mesmo dia; ontem comparado com o mesmo dia da semana passada.
          </p>
        </>
      )}
    </>
  );
}
