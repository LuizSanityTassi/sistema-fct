import Link from "next/link";
import { FileUp, ScrollText, Trash2 } from "lucide-react";
import { ColunasResultado } from "@/components/graficos";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { contas, distribuirRateios, empresasDre, juntarMapas, lancamentosDre, somar, temLancamento, valoresGravados, type MapaDre } from "@/lib/data/dre-contabil";
import { baseDoRateio, calcularDre, ehLinhaManual, LINHAS_DRE, LINHAS_MANUAIS, MES_MANUAL, ROTULO_LINHA, sinalManual, situacaoDoLucro, type Lancamentos, type LinhaDre, type LinhaManual } from "@/lib/financeiro/dre-contabil";
import { moedaFin } from "@/lib/financeiro/formatos";
import { formatarDataHora } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { excluirRateio, lancarManual, preencherOmie, salvarCelulaDre, salvarRateio } from "./actions";
import { AbasDre, AvisoCobertura, cabecalhosOrdenaveis, Cartao, empresasSemDre, Filtros, mostraPct, OpcoesFiliais, query, TODAS, tom, VISOES_DRE, type Direcao, type Props, type VisaoDre } from "./comum";
import { Comparativo } from "./comparativo";
import { Demonstrativo, type EdicaoDemonstrativo } from "./demonstrativo";
import { LancarForm } from "./lancar-form";
import { RateioForm } from "./rateio-form";

export const metadata = { title: "DRE" };

type ContasDre = ReturnType<typeof calcularDre>;
const semValor = Number.NEGATIVE_INFINITY;
const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");
/**
 * Colunas que ordenam o resumo por filial (clique no título). Custos em % (CMV, impostos, comissões, despesas) ordenam
 * pelo tamanho do custo: "maior para menor" = quem gasta mais primeiro, mesmo aparecendo com sinal de menos.
 */
const ORDENS: Record<string, (c: ContasDre) => number> = {
  faturamento: (c) => c.receitaBruta,
  part: (c) => c.receitaBruta,
  margem: (c) => c.margemPct ?? semValor,
  cmv: (c) => Math.abs(c.cmvSobreBruta ?? 0),
  impostos: (c) => Math.abs(c.impostosSobreBruta ?? 0),
  comissoes: (c) => Math.abs(c.comissoesSobreBruta ?? 0),
  despesas: (c) => Math.abs(c.despesasSobreBruta ?? 0),
  operacional: (c) => c.lucroOperacional,
  lucro: (c) => c.lucro,
  lp: (c) => c.lucroSobreBruta ?? semValor,
};
/**
 * DRE contábil por filial (planilha do contador): resumo por filial (mês ou acumulado), o demonstrativo mês a mês, o
 * comparativo com o mês anterior e o ano passado e o rateio por faturamento. "Todas as empresas" junta Varela e Nazário.
 */
export default async function DrePage({ searchParams }: PageProps<"/financeiro/dre">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/dre"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const podeImportar = sessao.papel === "admin" || sessao.papel === "financeiro" || sessao.papel === "contador";
  const botaoImportar = podeImportar ? (
    <Button nativeButton={false} render={<Link href="/financeiro/dre/importar" />}>
      <FileUp data-icon="inline-start" />
      Importar novo mês
    </Button>
  ) : undefined;

  const empresas = await empresasDre();
  if (!empresas.length) {
    return (
      <>
        <PageHeader eyebrow="Financeiro" titulo="DRE" descricao="DRE contábil por filial, a partir da planilha que o contador manda todo mês." acoes={botaoImportar} />
        <section className="rounded-xl border bg-card">
          <EstadoVazio icone={ScrollText} titulo="Nenhuma DRE importada ainda" descricao="Importe a planilha “DRE POR FILIAIS” do contador para ver o resultado de cada filial." />
        </section>
      </>
    );
  }

  const ver: VisaoDre = VISOES_DRE.some(([v]) => v === s("ver")) ? (s("ver") as VisaoDre) : "resumo";
  // filtro Empresa: Varela e Nazário separadas de Itajaí e Blumenau (que estão na DRE delas) ou juntas. Rateio e
  // lançamento à mão são da empresa inteira (o rateio divide entre todas as filiais dela).
  const reais = empresas.map((e) => e.empresa);
  const recortes = RECORTES_DRE.filter((r) => reais.includes(r.empresa));
  const porRecorte = ver === "resumo" || ver === "demonstrativo" || ver === "comparativo";
  const todas = empresas.length > 1 && s("empresa") === TODAS;
  const pedido = todas ? undefined : recortes.find((r) => r.valor === s("empresa"));
  const real = pedido?.empresa ?? (reais.includes(s("empresa")) ? s("empresa") : reais[0]);
  const recorte = !porRecorte || todas ? undefined : (pedido ?? recortes.find((r) => r.empresa === real && r.inteira));
  const selecionadas = todas ? empresas : [empresas.find((e) => e.empresa === real) ?? empresas[0]];
  const meses = [...new Set(selecionadas.flatMap((e) => e.meses))].sort();
  const anos = [...new Set(meses.map((m) => m.slice(0, 4)))].sort().reverse();
  const ano = anos.includes(s("ano")) ? s("ano") : anos[0];
  const mesesDoAno = meses.filter((m) => m.startsWith(ano));
  // o comparativo olha também o ano passado (mesmo mês e os últimos 12 meses)
  const de = ver === "comparativo" ? `${Number(ano) - 1}-01` : `${ano}-01`;
  const dados = await Promise.all(selecionadas.map((e) => lancamentosDre(e.empresa, de, `${ano}-12`)));
  const mapa = juntarMapas(dados.map((d) => d.mapa));
  const rateios = dados.flatMap((d) => d.rateios);
  const empresaDaFilial = new Map(dados.flatMap((d, i) => [...d.mapa.keys()].filter(Boolean).map((id) => [id, selecionadas[i].empresa] as const)));

  const todosIds = [...mapa.keys()].filter(Boolean);
  const supabase = await createClient();
  const { data: lojas } = todosIds.length ? await supabase.from("branches").select("id, codigo, nome").in("id", todosIds) : { data: [] };
  const porId = new Map((lojas ?? []).map((l) => [l.id, l]));
  // recorte escolhido: só as filiais dele (e o valor da empresa, a depreciação, quando o recorte é da empresa-mãe)
  if (recorte) {
    for (const id of [...mapa.keys()]) {
      if (id ? !recorte.entra(porId.get(id)?.codigo ?? "") : !recorte.daEmpresa) mapa.delete(id);
    }
  }
  const ids = [...mapa.keys()].filter(Boolean);
  const filiaisOrdenadas = ids
    .map((id) => ({ id, codigo: porId.get(id)?.codigo ?? "?", nome: porId.get(id)?.nome ?? "", empresa: empresaDaFilial.get(id) ?? "" }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
  const base = { empresa: todas ? TODAS : (recorte?.valor ?? real), ano };
  const nomeEscolha = recorte?.rotulo ?? real;
  const ultima = [...selecionadas].sort((a, b) => b.ultima.em.localeCompare(a.ultima.em))[0].ultima;
  const porEmpresa = recorte ? [{ empresa: recorte.rotulo, mapa }] : dados.map((d, i) => ({ empresa: selecionadas[i].empresa, mapa: d.mapa }));
  const props: Props = {
    s,
    base,
    empresas: porRecorte ? recortes.map((r) => r.valor) : reais,
    todas,
    anos,
    mesesDoAno,
    mapa,
    rateios,
    filiais: filiaisOrdenadas,
    mesesPorEmpresa: new Map(selecionadas.map((e) => [e.empresa, new Set(e.meses)])),
  };

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="DRE"
        descricao={`DRE contábil ${todas ? `de todas as empresas (${empresas.map((e) => e.empresa).join(" + ")})` : `da ${nomeEscolha}`} por filial (planilha do contador). Última importação: ${ultima.arquivo ?? "planilha"} · ${ultima.por ?? "—"} · ${formatarDataHora(ultima.em)}.`}
      />

      <AbasDre ativa={ver} base={base} filial={s("filial") || undefined} podeImportar={podeImportar} />

      {ver === "resumo" ? (
        <Resumo {...props} porEmpresa={porEmpresa} />
      ) : ver === "demonstrativo" ? (
        <VerDemonstrativo {...props} nomeEscolha={nomeEscolha} podeEditar={podeImportar} destacarDigitados={sessao.papel === "admin"} />
      ) : ver === "comparativo" ? (
        <Comparativo {...props} />
      ) : ver === "lancar" && podeImportar ? (
        <Lancar {...props} />
      ) : ver === "lancar" ? (
        <Resumo {...props} porEmpresa={porEmpresa} />
      ) : (
        <Rateio {...props} podeEditar={podeImportar} />
      )}
    </>
  );
}

/** O que aparece no campo: a conta digitada (para continuar) ou o valor sem sinal, como na planilha. */
function textoDigitado(g: { valor: number; formula: string | null } | undefined, linha: LinhaDre) {
  if (!g) return "";
  if (g.formula) return g.formula;
  const v = g.valor * sinalManual(linha);
  return Math.abs(v) >= 0.005 ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}

/** As contas "amarelas" com o nome da planilha do contador. */
const ROTULO_MANUAL: Record<LinhaManual, string> = {
  devolucoes: "(−) Devolução OFX",
  comissoes: "(−) Comissões s/ vendas",
  despesas_pessoal: "Despesas pessoal",
  despesas_administrativas: "Despesas administrativa",
  despesas_comerciais: "Despesas comerciais",
  outras_despesas: "Outras despesas / tributos",
  depreciacao: "Despesas c/ depreciação",
  receita_financeira: "Receita financeira",
  outras_receitas: "Outras receitas",
  despesas_financeiras: "Despesas financeira",
};

/** Setembro/2026: o contador digita as contas amarelas de cada filial (a importação não mexe nelas). */
async function Lancar({ base, empresas, todas, mapa, filiais }: Props) {
  if (todas) {
    return (
      <section className="rounded-xl border bg-card">
        <EstadoVazio
          icone={ScrollText}
          titulo="O lançamento é de cada empresa"
          descricao="Escolha a empresa para digitar setembro (Itajaí está na Varela e Blumenau na Nazário):"
          acao={
            <div className="flex flex-wrap justify-center gap-2">
              {empresas.map((e) => (
                <Button key={e} variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/dre?${query({ empresa: e, ano: base.ano, ver: "lancar" })}`} />}>
                  {e}
                </Button>
              ))}
            </div>
          }
        />
      </section>
    );
  }
  const empresa = base.empresa;
  const gravados = await valoresGravados(empresa, [MES_MANUAL]);
  const atuais = new Map([...gravados].filter(([k]) => ehLinhaManual(k.split("|")[2])).map(([k, v]) => [`${k.split("|")[0]}|${k.split("|")[2]}`, v]));
  const comValor = new Set([...atuais.keys()].map((k) => k.split("|")[0]));
  const lista = filiais
    .filter((f) => temLancamento(mapa, f.id, MES_MANUAL) || comValor.has(f.id))
    .map((f) => ({ chave: f.id, codigo: f.codigo, nome: f.nome }));
  if (comValor.has("") || temLancamento(mapa, "", MES_MANUAL)) lista.push({ chave: "empresa", codigo: empresa, nome: "valor da empresa (sem filial)" });
  const iniciais: Record<string, string> = {};
  for (const [k, v] of atuais) {
    const [filial, linha] = k.split("|");
    if (!ehLinhaManual(linha)) continue;
    const texto = textoDigitado(v, linha);
    if (texto) iniciais[`${filial || "empresa"}:${linha}`] = texto;
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {empresas.map((e) => (
          <Button key={e} variant={e === empresa ? "default" : "outline"} size="sm" nativeButton={false} render={<Link href={`/financeiro/dre?${query({ empresa: e, ano: base.ano, ver: "lancar" })}`} />}>
            {e}
          </Button>
        ))}
        <div className="ml-auto">
          <ConfirmarAcao
            titulo="Preencher pelo Omie"
            descricao="Refaz Devolução OFX, Comissões (Premiação), Outras receitas, Receita financeira e as despesas (pessoal, administrativa, comerciais, outras e financeira) de setembro, nas duas empresas, a partir dos lançamentos do Omie e do plano de contas. O que foi digitado nessas contas é substituído; a Depreciação fica como está."
            rotuloBotao="Preencher pelo Omie"
            rotuloConfirmar="Preencher"
            action={preencherOmie}
          />
        </div>
        <p className="w-full text-sm text-muted-foreground">
          {rotuloCompetencia(MES_MANUAL)}: as contas em amarelo vêm do Omie pelo plano de contas (categoria → conta da DRE), filial por filial, e podem ser corrigidas aqui; a
          importação da planilha não mexe nelas. Comissões vêm da categoria Premiação; a Depreciação é digitada. Digite sem sinal, como na planilha (despesas e deduções entram negativas, receitas
          positivas); um “-” na frente inverte (estorno). Itajaí está na Varela, Blumenau na Nazário e as terceirizadas em TERC.
        </p>
      </div>
      {lista.length ? (
        <LancarForm action={lancarManual} empresa={empresa} filiais={lista} contas={LINHAS_MANUAIS.map((linha) => ({ linha, rotulo: ROTULO_MANUAL[linha] }))} iniciais={iniciais} />
      ) : (
        <section className="rounded-xl border bg-card">
          <EstadoVazio icone={ScrollText} titulo={`A ${empresa} não tem ${rotuloCompetencia(MES_MANUAL).toLowerCase()} importado`} descricao="Importe o mês na aba Importar novo mês para aparecerem as filiais." />
        </section>
      )}
    </>
  );
}

function Resumo({ s, base, empresas, todas, anos, mesesDoAno, mapa, rateios, filiais, mesesPorEmpresa, porEmpresa }: Props & { porEmpresa: { empresa: string; mapa: MapaDre }[] }) {
  const periodo = s("mes") === "acumulado" ? "acumulado" : mesesDoAno.includes(s("mes")) ? s("mes") : mesesDoAno[mesesDoAno.length - 1];
  const meses = periodo === "acumulado" ? mesesDoAno : [periodo];
  // ordem: uma coluna de ORDENS ou "filial"; primeiro clique = maior para menor (filial: A→Z), o segundo inverte
  const ordem = s("ordem") === "filial" || Object.hasOwn(ORDENS, s("ordem")) ? s("ordem") : "lucro";
  const dir: Direcao = s("dir") === "asc" || s("dir") === "desc" ? (s("dir") as Direcao) : ordem === "filial" ? "asc" : "desc";
  const linhas = filiais
    .filter((f) => meses.some((m) => temLancamento(mapa, f.id, m)))
    .map((f) => ({ ...f, c: contas(mapa, f.id, meses) }))
    .sort((a, b) => {
      const r = ordem === "filial" ? a.codigo.localeCompare(b.codigo) : ORDENS[ordem](a.c) - ORDENS[ordem](b.c) || a.codigo.localeCompare(b.codigo);
      return dir === "asc" ? r : -r;
    });
  const consolidado = contas(mapa, "*", meses);
  const daEmpresa = calcularDre(somar(mapa, "", meses));
  const somaFiliais = calcularDre(
    filiais.reduce<Lancamentos>((acc, f) => {
      const l = somar(mapa, f.id, meses);
      for (const [k, v] of Object.entries(l)) acc[k as keyof Lancamentos] = (acc[k as keyof Lancamentos] ?? 0) + (v ?? 0);
      return acc;
    }, {}),
  );
  const conta = { prejuizo: 0, empate: 0, lucro: 0 };
  for (const l of linhas) conta[situacaoDoLucro(l.c.lucro)]++;
  const nomePeriodo = periodo === "acumulado" ? `acumulado de ${rotuloCompetencia(mesesDoAno[0])} a ${rotuloCompetencia(mesesDoAno[mesesDoAno.length - 1])}` : rotuloCompetencia(periodo);
  const cabecalho = cabecalhosOrdenaveis(ordem, dir, "lucro", (p) => `/financeiro/dre?${query({ ...base, mes: s("mes") || undefined, ...p })}`);
  const resumoEmpresas = todas ? porEmpresa.map((e) => ({ empresa: e.empresa, c: contas(e.mapa, "*", meses) })).filter((e) => e.c.receitaBruta || e.c.lucro) : [];

  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="resumo">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Período</span>
          <SelectNativo name="mes" defaultValue={periodo} className="w-52">
            {[...mesesDoAno].reverse().map((m) => (
              <option key={m} value={m}>
                {rotuloCompetencia(m)}
              </option>
            ))}
            <option value="acumulado">Acumulado do ano</option>
          </SelectNativo>
        </label>
        {ordem !== "lucro" && <input type="hidden" name="ordem" value={ordem} />}
        {s("dir") && <input type="hidden" name="dir" value={dir} />}
      </Filtros>

      {todas && <AvisoCobertura empresas={empresasSemDre(mesesPorEmpresa, meses)} texto={`de ${nomePeriodo}`} />}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cartao rotulo="Lucro / prejuízo" valor={moedaFin(consolidado.lucro)} tom={tom(consolidado.lucro)} nota={`${nomePeriodo}, com depreciação`} />
        <Cartao rotulo="Receita bruta" valor={moedaFin(consolidado.receitaBruta)} nota={`receita líquida ${moedaFin(consolidado.receitaLiquida)}`} />
        <Cartao rotulo="Margem de contribuição" valor={mostraPct(consolidado.margemPct)} nota={`${moedaFin(consolidado.margem)} · CMV ${mostraPct(consolidado.cmvSobreBruta)} da receita bruta`} />
        <Cartao rotulo="Filiais" valor={`${conta.lucro} com lucro`} nota={`${conta.empate} praticamente empataram (até R$ 2.000) · ${conta.prejuizo} com prejuízo`} />
      </div>

      {resumoEmpresas.length > 0 && (
        <section className="mb-4 rounded-xl border bg-card">
          <h2 className="px-5 pt-4 pb-3 text-sm font-semibold">Por empresa · {nomePeriodo}</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Part. %</TableHead>
                <TableHead className="text-right">M.C. %</TableHead>
                <TableHead className="hidden text-right md:table-cell">L. operacional</TableHead>
                <TableHead className="text-right">Lucro / prejuízo</TableHead>
                <TableHead className="hidden text-right sm:table-cell">L/P %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumoEmpresas.map((e) => (
                <TableRow key={e.empresa}>
                  <TableCell>
                    <Link href={`/financeiro/dre?${query({ empresa: e.empresa, ano: base.ano, mes: s("mes") || undefined })}`} className="font-medium hover:underline">
                      {e.empresa}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{moedaFin(e.c.receitaBruta)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{mostraPct(consolidado.receitaBruta ? e.c.receitaBruta / consolidado.receitaBruta : null)}</TableCell>
                  <TableCell className="text-right tabular-nums">{mostraPct(e.c.margemPct)}</TableCell>
                  <TableCell className={`hidden text-right tabular-nums md:table-cell ${tom(e.c.lucroOperacional)}`}>{moedaFin(e.c.lucroOperacional)}</TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${tom(e.c.lucro)}`}>{moedaFin(e.c.lucro)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{mostraPct(e.c.lucroSobreBruta)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">
            Resultado por filial · {nomePeriodo}
            {rateios.some((r) => meses.includes(r.competencia)) && <span className="ml-2 text-xs font-normal text-muted-foreground">(com o rateio por faturamento)</span>}
          </h2>
          <p className="text-xs text-muted-foreground">Clique no título da coluna para ordenar; clique de novo para inverter.</p>
        </header>
        {linhas.length === 0 ? (
          <EstadoVazio compacto icone={ScrollText} titulo="Nenhuma filial com lançamento nesse período" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {cabecalho("filial", "Filial")}
                {cabecalho("faturamento", "Faturamento", "text-right")}
                {cabecalho("part", "Part. %", "hidden text-right md:table-cell")}
                {cabecalho("margem", "M.C. %", "text-right")}
                {cabecalho("cmv", "CMV %", "hidden text-right lg:table-cell", "Custo das mercadorias sobre a receita bruta (ordena pelo tamanho do custo)")}
                {cabecalho("impostos", "Impostos %", "hidden text-right xl:table-cell", "Ordena pelo tamanho do imposto")}
                {cabecalho("comissoes", "Comissões %", "hidden text-right xl:table-cell", "Ordena pelo tamanho da comissão")}
                {cabecalho("despesas", "Despesas %", "hidden text-right lg:table-cell", "Despesas sobre a receita bruta (ordena pelo tamanho da despesa)")}
                {cabecalho("operacional", "L. operacional", "hidden text-right md:table-cell")}
                {cabecalho("lucro", "Lucro / prejuízo", "text-right")}
                {cabecalho("lp", "L/P %", "hidden text-right sm:table-cell", "Lucro / prejuízo sobre a receita bruta")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => {
                const sit = situacaoDoLucro(l.c.lucro);
                return (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/financeiro/dre?${query({ ...base, ver: "demonstrativo", filial: l.id })}`} className="font-medium hover:underline">
                        <span className="font-mono text-xs">{l.codigo}</span> {l.nome}
                      </Link>
                      {todas && <span className="ml-1.5 text-[11px] text-muted-foreground">{l.empresa}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(l.c.receitaBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{mostraPct(consolidado.receitaBruta ? l.c.receitaBruta / consolidado.receitaBruta : null)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mostraPct(l.c.margemPct)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{mostraPct(l.c.cmvSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">{mostraPct(l.c.impostosSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums xl:table-cell">{mostraPct(l.c.comissoesSobreBruta)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{mostraPct(l.c.despesasSobreBruta)}</TableCell>
                    <TableCell className={`hidden text-right tabular-nums md:table-cell ${tom(l.c.lucroOperacional)}`}>{moedaFin(l.c.lucroOperacional)}</TableCell>
                    <TableCell className={`text-right font-medium tabular-nums ${tom(l.c.lucro)}`}>
                      {moedaFin(l.c.lucro)}
                      {sit === "empate" && <span className="block text-[11px] font-normal text-muted-foreground">praticamente empatou</span>}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{mostraPct(l.c.lucroSobreBruta)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Soma das filiais</TableCell>
                <TableCell className="text-right tabular-nums">{moedaFin(somaFiliais.receitaBruta)}</TableCell>
                <TableCell className="hidden md:table-cell" />
                <TableCell className="text-right tabular-nums">{mostraPct(somaFiliais.margemPct)}</TableCell>
                <TableCell className="hidden lg:table-cell" />
                <TableCell className="hidden xl:table-cell" />
                <TableCell className="hidden xl:table-cell" />
                <TableCell className="hidden lg:table-cell" />
                <TableCell className={`hidden text-right tabular-nums md:table-cell ${tom(somaFiliais.lucroOperacional)}`}>{moedaFin(somaFiliais.lucroOperacional)}</TableCell>
                <TableCell className={`text-right tabular-nums ${tom(somaFiliais.lucro)}`}>{moedaFin(somaFiliais.lucro)}</TableCell>
                <TableCell className="hidden sm:table-cell" />
              </TableRow>
              {daEmpresa.despesas !== 0 && (
                <TableRow>
                  <TableCell>Depreciação ({todas ? "das empresas" : "da empresa"})</TableCell>
                  <TableCell colSpan={8} className="hidden md:table-cell" />
                  <TableCell className="text-right tabular-nums text-red-700 dark:text-red-400">{moedaFin(daEmpresa.despesas)}</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                </TableRow>
              )}
              <TableRow>
                <TableCell className="font-semibold">Total com depreciação</TableCell>
                <TableCell colSpan={8} className="hidden md:table-cell" />
                <TableCell className={`text-right font-semibold tabular-nums ${tom(consolidado.lucro)}`}>{moedaFin(consolidado.lucro)}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">{mostraPct(consolidado.lucroSobreBruta)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </section>
    </>
  );
}

/**
 * Opções do filtro Empresa: Itajaí (F2xx) está na DRE da Varela e Blumenau (F5xx) na da Nazário; dá para ver cada
 * uma separada ou junto com a empresa-mãe. daEmpresa = entra o valor da empresa sem filial (a depreciação).
 */
const ehItajai = (codigo: string) => /^F2\d{2}$/.test(codigo);
const ehBlumenau = (codigo: string) => /^F5\d{2}$/.test(codigo);
const RECORTES_DRE = [
  { valor: "VARELA", rotulo: "VARELA", empresa: "VARELA", entra: (c: string) => !ehItajai(c), daEmpresa: true, inteira: false },
  { valor: "ITAJAÍ", rotulo: "ITAJAÍ", empresa: "VARELA", entra: ehItajai, daEmpresa: false, inteira: false },
  { valor: "VARELA+ITAJAÍ", rotulo: "VARELA + ITAJAÍ", empresa: "VARELA", entra: () => true, daEmpresa: true, inteira: true },
  { valor: "NAZÁRIO", rotulo: "NAZÁRIO", empresa: "NAZÁRIO", entra: (c: string) => !ehBlumenau(c), daEmpresa: true, inteira: false },
  { valor: "BLUMENAU", rotulo: "BLUMENAU", empresa: "NAZÁRIO", entra: ehBlumenau, daEmpresa: false, inteira: false },
  { valor: "NAZÁRIO+BLUMENAU", rotulo: "NAZÁRIO + BLUMENAU", empresa: "NAZÁRIO", entra: () => true, daEmpresa: true, inteira: true },
];

async function VerDemonstrativo({ s, base, empresas, todas, anos, mesesDoAno, mapa, rateios, filiais, mesesPorEmpresa, nomeEscolha, podeEditar, destacarDigitados }: Props & { nomeEscolha: string; podeEditar: boolean; destacarDigitados: boolean }) {
  const filial = filiais.find((f) => f.id === s("filial"));
  const chave = filial ? filial.id : "*";
  const porMes = new Map(mesesDoAno.map((m) => [m, somar(mapa, chave, [m])]));
  const comDados = mesesDoAno.filter((m) => (filial ? temLancamento(mapa, filial.id, m) : true));
  const nomeTotal = todas ? "Consolidado de todas as empresas" : `Consolidado da ${nomeEscolha}`;
  // tudo digitável: cada conta de cada mês da filial escolhida (na empresa real dela: Itajaí = Varela, Blumenau = Nazário)
  let editar: EdicaoDemonstrativo | undefined;
  if (podeEditar && filial && mesesDoAno.length) {
    const gravados = await valoresGravados(filial.empresa, mesesDoAno, filial.id);
    const campos: EdicaoDemonstrativo["campos"] = {};
    for (const mes of mesesDoAno) {
      for (const linha of LINHAS_DRE) {
        const g = gravados.get(`${filial.id}|${mes}|${linha}`);
        campos[`${mes}|${linha}`] = { valor: (g?.valor ?? 0) * sinalManual(linha), conta: g?.formula ?? null, manual: !!g?.manual };
      }
    }
    editar = { salvar: salvarCelulaDre, empresa: filial.empresa, filial: filial.id, destacar: destacarDigitados, campos };
  }
  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="demonstrativo">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Filial</span>
          <SelectNativo name="filial" defaultValue={filial?.id ?? ""} className="w-64">
            <option value="">{todas ? "Consolidado de todas as empresas" : "Consolidado da empresa"}</option>
            <OpcoesFiliais filiais={filiais} todas={todas} />
          </SelectNativo>
        </label>
      </Filtros>
      {todas && !filial && <AvisoCobertura empresas={empresasSemDre(mesesPorEmpresa, mesesDoAno)} texto={`de ${base.ano}`} />}
      {comDados.length > 1 && (
        <section className="mb-4 rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">
            Lucro / prejuízo mês a mês · {filial ? `${filial.codigo} ${filial.nome}` : nomeTotal}
          </h2>
          <p className="mb-4 text-xs text-muted-foreground">Passe o mouse em cada coluna para ver o valor. Os números completos estão na tabela abaixo.</p>
          <ColunasResultado
            titulo={`Lucro ou prejuízo por mês em ${base.ano}`}
            rotuloValor="Lucro / prejuízo"
            dados={comDados.map((m) => {
              const lucro = calcularDre(porMes.get(m) ?? {}).lucro;
              return { rotulo: mesCurto(m), valor: lucro, texto: moedaFin(lucro) };
            })}
          />
        </section>
      )}
      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">
            {filial ? `${filial.codigo} ${filial.nome}` : nomeTotal} · {base.ano}
          </h2>
          {filial ? (
            <Status tom="info">sem a depreciação, que é da empresa{rateios.length ? " · com o rateio por faturamento" : ""}</Status>
          ) : (
            <Status tom="neutro">todas as filiais + depreciação</Status>
          )}
        </header>
        {editar && filial ? (
          <p className="border-t px-5 py-2.5 text-sm text-muted-foreground">
            Clique no valor de uma conta para alterar: digite sem sinal, como na planilha, ou continue a conta (+200, -100). Enter ou sair do campo salva; Esc cancela. O que for digitado vale mais que a
            planilha: reimportar o mês não passa por cima.{editar.destacar ? " Células amarelas = valor digitado." : ""}
          </p>
        ) : podeEditar && !filial ? (
          <p className="border-t px-5 py-2.5 text-sm text-muted-foreground">Para alterar um valor, escolha uma filial no filtro acima: todas as contas de todos os meses ficam editáveis.</p>
        ) : null}
        <Demonstrativo meses={mesesDoAno} porMes={porMes} editar={editar} />
      </section>
    </>
  );
}

function Rateio({ s, base, empresas, todas, anos, mesesDoAno, mapa, rateios, filiais, podeEditar }: Props & { podeEditar: boolean }) {
  if (todas) {
    return (
      <>
        <Filtros base={base} empresas={empresas} anos={anos} ver="rateio" />
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            icone={ScrollText}
            titulo="O rateio é de cada empresa"
            descricao="Os valores da Varela são divididos só entre as filiais da Varela, e os da Nazário entre as da Nazário. Escolha a empresa:"
            acao={
              <div className="flex flex-wrap justify-center gap-2">
                {empresas.map((e) => (
                  <Button key={e} variant="outline" size="sm" nativeButton={false} render={<Link href={`/financeiro/dre?${query({ empresa: e, ano: base.ano, ver: "rateio" })}`} />}>
                    {e}
                  </Button>
                ))}
              </div>
            }
          />
        </section>
      </>
    );
  }
  const mes = mesesDoAno.includes(s("mes")) ? s("mes") : mesesDoAno[mesesDoAno.length - 1];
  const doMes = rateios.filter((r) => r.competencia === mes);
  const distribuicao = distribuirRateios(mapa, mes, doMes);
  const comBase = filiais.map((f) => ({ ...f, base: baseDoRateio(mapa.get(f.id)?.get(mes) ?? {}) }));
  const totalBase = comBase.reduce((t, f) => t + Math.max(0, f.base), 0);
  // # = posição no faturamento (o ranking da planilha), qualquer que seja a ordem da tabela
  const porFaturamento = comBase.filter((f) => f.base > 0).sort((a, b) => b.base - a.base);
  const posicao = new Map(porFaturamento.map((f, i) => [f.id, i + 1]));
  const rateado = (id: string) => distribuicao.reduce((t, { porFilial }) => t + (porFilial.get(id)?.valor ?? 0), 0);
  // ordenar: filial, faturamento/part (a base), cada item (pelo tamanho do valor) ou o total rateado
  const colunasItem = new Map(distribuicao.map(({ rateio, porFilial }) => [`i-${rateio.id}`, porFilial]));
  const ordem = ["filial", "faturamento", "part", "total"].includes(s("ordem")) || colunasItem.has(s("ordem")) ? s("ordem") : "faturamento";
  const dir: Direcao = s("dir") === "asc" || s("dir") === "desc" ? (s("dir") as Direcao) : ordem === "filial" ? "asc" : "desc";
  const chave = (f: (typeof porFaturamento)[number]) =>
    ordem === "total" ? Math.abs(rateado(f.id)) : colunasItem.has(ordem) ? Math.abs(colunasItem.get(ordem)!.get(f.id)?.valor ?? 0) : f.base;
  const linhas = [...porFaturamento].sort((a, b) => {
    const r = ordem === "filial" ? a.codigo.localeCompare(b.codigo) : chave(a) - chave(b) || a.codigo.localeCompare(b.codigo);
    return dir === "asc" ? r : -r;
  });
  const cabecalho = cabecalhosOrdenaveis(ordem, dir, "faturamento", (p) => `/financeiro/dre?${query({ ...base, ver: "rateio", mes, ...p })}`);
  const semFaturamento = comBase.filter((f) => f.base <= 0 && Object.values(mapa.get(f.id)?.get(mes) ?? {}).some((v) => v));
  const totalRateado = doMes.reduce((t, r) => t + r.valor, 0);

  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="rateio">
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mês</span>
          <SelectNativo name="mes" defaultValue={mes} className="w-52">
            {[...mesesDoAno].reverse().map((m) => (
              <option key={m} value={m}>
                {rotuloCompetencia(m)}
              </option>
            ))}
          </SelectNativo>
        </label>
      </Filtros>

      <p className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200">
        Valores da empresa no mês (PIS/COFINS, ICMS, despesa financeira…) divididos entre as filiais pela participação de cada uma no faturamento, como a aba “FAT %” da planilha. O valor de cada filial entra na DRE dela, na conta escolhida. Lance aqui só o que a contabilidade manda como total: se a planilha já trouxer o valor rateado nas abas das filiais, ele contaria duas vezes.
      </p>

      {podeEditar && (
        <section className="mb-4 rounded-xl border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold">Ratear um valor de {rotuloCompetencia(mes)}</h2>
          <RateioForm key={mes} action={salvarRateio} empresa={base.empresa} mes={mes} />
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">Rateio de {rotuloCompetencia(mes)}</h2>
          <p className="text-xs text-muted-foreground">Faturamento do mês: {moedaFin(totalBase)}</p>
        </header>
        {doMes.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-5 pb-3">
            {doMes.map((r) => (
              <li key={r.id} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-1 pl-3 text-xs">
                <span className="font-medium">{r.item}</span>
                <span className="text-muted-foreground">
                  · {ROTULO_LINHA[r.linha].replace(/^\(−\) /, "")} · {moedaFin(r.valor)}
                  {r.observacao ? ` · ${r.observacao}` : ""}
                </span>
                {podeEditar && (
                  <form action={excluirRateio}>
                    <input type="hidden" name="id" value={r.id} />
                    <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Tirar ${r.item} do rateio`} title="Tirar do rateio">
                      <Trash2 />
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {linhas.length === 0 ? (
          <EstadoVazio compacto icone={ScrollText} titulo="Nenhuma filial com faturamento nesse mês" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" title="Posição no faturamento do mês">
                  #
                </TableHead>
                {cabecalho("filial", "Filial")}
                {cabecalho("faturamento", "Faturamento", "text-right")}
                {cabecalho("part", "Part. %", "text-right")}
                {distribuicao.map(({ rateio }) => cabecalho(`i-${rateio.id}`, rateio.item, "text-right", "Ordena pelo tamanho do valor rateado"))}
                {distribuicao.length > 1 && cabecalho("total", "Total rateado", "text-right", "Ordena pelo tamanho do total rateado")}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((f) => {
                const daFilial = distribuicao.map(({ porFilial }) => porFilial.get(f.id)?.valor ?? 0);
                return (
                  <TableRow key={f.id}>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">{posicao.get(f.id)}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs">{f.codigo}</span> {f.nome}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{moedaFin(f.base)}</TableCell>
                    <TableCell className="text-right tabular-nums">{mostraPct(totalBase ? f.base / totalBase : null)}</TableCell>
                    {daFilial.map((v, j) => (
                      <TableCell key={j} className="text-right tabular-nums">
                        {moedaFin(v)}
                      </TableCell>
                    ))}
                    {distribuicao.length > 1 && <TableCell className="text-right font-medium tabular-nums">{moedaFin(daFilial.reduce((a, b) => a + b, 0))}</TableCell>}
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell />
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{moedaFin(totalBase)}</TableCell>
                <TableCell className="text-right tabular-nums">{mostraPct(totalBase ? 1 : null)}</TableCell>
                {distribuicao.map(({ rateio }) => (
                  <TableCell key={rateio.id} className="text-right tabular-nums">
                    {moedaFin(rateio.valor)}
                  </TableCell>
                ))}
                {distribuicao.length > 1 && <TableCell className="text-right tabular-nums">{moedaFin(totalRateado)}</TableCell>}
              </TableRow>
            </TableFooter>
          </Table>
        )}
        {semFaturamento.length > 0 && (
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">Sem faturamento no mês, não recebem rateio: {semFaturamento.map((f) => `${f.codigo} ${f.nome}`).join(", ")}.</p>
        )}
      </section>
    </>
  );
}
