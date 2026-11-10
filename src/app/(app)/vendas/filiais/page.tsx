import Link from "next/link";
import { Headset, Store } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { cn } from "cn";
import { chaveMetaFilial, diasSemVendas, ehRegionalVendas, ehTele, faixasDeDias, metasDoMes, REGIONAIS_VENDAS, somar, teleDasFiliais, TELEVENDAS, ultimoDiaVendas, vendasPorFilial, type LinhaFilialVendas } from "@/lib/data/vendas";
import { AtualizaSozinho } from "../atualiza-sozinho";
import { AbasVendas, AvisoDiasFaltando, decimal, inteiro, moeda, pct } from "../comum";
import { CamposPeriodo, lerPeriodoVendas } from "../periodo";

export const metadata = { title: "Venda por filial" };

const ORDENS = {
  venda: { rotulo: "Venda", valor: (l: LinhaFilialVendas) => l.venda },
  atendimentos: { rotulo: "Nº de atendimentos", valor: (l: LinhaFilialVendas) => l.atendimentos },
  ticket: { rotulo: "Ticket médio", valor: (l: LinhaFilialVendas) => l.ticket ?? 0 },
  sacola: { rotulo: "Unidades por atendimento", valor: (l: LinhaFilialVendas) => l.sacola ?? 0 },
  fortvigor: { rotulo: "Unidades Fortvigor", valor: (l: LinhaFilialVendas) => l.fortvigor },
  premium: { rotulo: "% premium", valor: (l: LinhaFilialVendas) => l.pctPremium ?? 0 },
  gensim: { rotulo: "% genérico + similar", valor: (l: LinhaFilialVendas) => l.pctGenSim ?? 0 },
  cmv: { rotulo: "Menor CMV", valor: (l: LinhaFilialVendas) => -(l.cmv ?? 999) },
} as const;
type Ordem = keyof typeof ORDENS | "tele";
const ROTULO_TELE = "Venda no tele";

export default async function VendaFiliaisPage({ searchParams }: PageProps<"/vendas/filiais">) {
  const [sessao, sp, ultimo] = await Promise.all([exigirAcesso("/vendas/filiais"), searchParams, ultimoDiaVendas()]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const periodo = lerPeriodoVendas(sp, ultimo.dia);
  const { de, ate } = periodo;
  const regional = ehRegionalVendas(s("regional")) ? s("regional") : "";
  const ordem: Ordem = s("ordem") in ORDENS || s("ordem") === "tele" ? (s("ordem") as Ordem) : "venda";

  const [todas, faltam, metas, teles] = await Promise.all([vendasPorFilial(de, ate), diasSemVendas(de, ate), periodo.ver === "mes" ? metasDoMes(`${periodo.mes}-01`) : Promise.resolve(new Map<string, number>()), teleDasFiliais(de, ate)]);
  // quanto a filial vendeu no tele (sem a central de televendas, que tem linha própria)
  const teleDe = (l: LinhaFilialVendas) => (ehTele(l) ? null : (teles.get(l.branchId)?.venda ?? 0));
  const valorOrdem = (l: LinhaFilialVendas) => (ordem === "tele" ? (teleDe(l) ?? -1) : ORDENS[ordem].valor(l));
  // as centrais do tele (venda da equipe de tele-vendas, que sai das filiais) entram no ranking como lojas da regional delas
  const linhas = todas.filter((l) => !regional || l.regional === regional).sort((a, b) => valorOrdem(b) - valorOrdem(a) || b.venda - a.venda);
  const total = somar(linhas);
  const teleTotal = linhas.reduce((s, l) => s + (teleDe(l) ?? 0), 0);
  const vendaLojas = linhas.reduce((s, l) => s + (ehTele(l) ? 0 : l.venda), 0);
  const temTele = linhas.some(ehTele);
  // meta do mês (só na visão mensal, quando há meta cadastrada)
  const metaDe = (l: LinhaFilialVendas) => metas.get(chaveMetaFilial(l)) ?? null;
  const temMeta = linhas.some((l) => metaDe(l) !== null);
  const metaTotal = linhas.reduce((s, l) => s + (metaDe(l) ?? 0), 0);
  const pctMeta = (venda: number, meta: number | null) => (meta ? (venda / meta) * 100 : null);

  return (
    <>
      <PageHeader eyebrow="Vendas" titulo="Venda por filial" descricao="Ranking das lojas no período: venda, atendimentos, ticket médio, unidades, Fortvigor, premium, genérico + similar e CMV. Números do Trier (vendas menos devoluções), lidos a cada 10 minutos das 7h às 23h50 (o dia de hoje é parcial) e o dia inteiro de novo de madrugada." />
      <AbasVendas ativa="/vendas/filiais" papel={sessao.papel} />
      <AtualizaSozinho />
      <AvisoDiasFaltando faltam={faltam.length} texto={`(${faixasDeDias(faltam)})`} admin={sessao.papel === "admin"} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <CamposPeriodo p={periodo} rota="/vendas/filiais" extra={regional ? `&regional=${encodeURIComponent(regional)}` : ""} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Regional</span>
          <SelectNativo name="regional" defaultValue={regional} className="w-36">
            <option value="">Todas</option>
            {REGIONAIS_VENDAS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </SelectNativo>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Ordenar por</span>
          <SelectNativo name="ordem" defaultValue={ordem} className="w-52">
            {(Object.keys(ORDENS) as (keyof typeof ORDENS)[]).map((o) => (
              <option key={o} value={o}>
                {ORDENS[o].rotulo}
              </option>
            ))}
            <option value="tele">{ROTULO_TELE}</option>
          </SelectNativo>
        </label>
        <Button type="submit">Pesquisar</Button>
        <p className="ml-auto self-center text-xs text-muted-foreground">
          {periodo.texto} · {linhas.length} {linhas.length === 1 ? "filial" : "filiais"}
        </p>
      </form>

      <section className="rounded-xl border bg-card">
        {!linhas.length ? (
          <EstadoVazio
            icone={Store}
            titulo="Sem vendas guardadas nesse período"
            descricao={
              sessao.papel === "admin" ? (
                <>
                  O robô traz as vendas do Trier toda madrugada. Para um período passado, use{" "}
                  <Link href="/vendas/robo" className="underline">
                    Automações → Robô de vendas
                  </Link>
                  .
                </>
              ) : (
                "As vendas chegam do Trier toda madrugada. Escolha outro período."
              )
            }
          />
        ) : (
          // compacta (fonte 13px, menos espaço entre colunas, títulos em 2 linhas) para caber sem rolar para o lado
          <Table className="text-[13px] [&_td]:px-2 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:h-auto [&_th]:px-2 [&_th]:py-2 [&_th]:leading-tight [&_th]:whitespace-normal [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Venda R$</TableHead>
                {temMeta && <TableHead className="hidden text-right lg:table-cell">Meta</TableHead>}
                {temMeta && <TableHead className="text-right">% meta</TableHead>}
                <TableHead className="text-right">Tele R$</TableHead>
                <TableHead className="hidden text-right md:table-cell">% tele</TableHead>
                <TableHead className="text-right">Nº atend.</TableHead>
                <TableHead className="text-right">Ticket médio</TableHead>
                <TableHead className="hidden text-right md:table-cell">Unid. vendidas</TableHead>
                <TableHead className="hidden text-right md:table-cell">Unid. sacola</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Unid. Fortvigor</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Valor premium</TableHead>
                <TableHead className="text-right">% premium</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Valor gen+sim</TableHead>
                <TableHead className="text-right">% gen+sim</TableHead>
                <TableHead className="text-right">CMV</TableHead>
                <TableHead className="hidden text-right xl:table-cell">% rentab.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const tele = ehTele(l);
                return (
                <TableRow key={l.branchId} className={cn(tele && "bg-sky-50/70 dark:bg-sky-950/30")}>
                  <TableCell className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</TableCell>
                  <TableCell>
                    {tele ? (
                      <Link href={`/vendas/televendas?ver=${periodo.ver}&mes=${periodo.mes}&de=${de}&ate=${ate}`} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                        <Headset className="size-4 text-sky-600" aria-hidden />
                        {l.regional === TELEVENDAS ? "Televendas" : l.nome}
                      </Link>
                    ) : (
                      <>
                        <span className="font-mono text-xs">{l.codigo}</span> <span className="text-sm">{l.nome}</span>
                      </>
                    )}
                    {!regional && <span className="block text-[11px] text-muted-foreground">{tele ? (l.regional === TELEVENDAS ? "equipe de tele-vendas" : `${l.regional} · central de tele-vendas`) : l.regional}</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{moeda(l.venda)}</TableCell>
                  {temMeta && <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{moeda(metaDe(l))}</TableCell>}
                  {temMeta && <TableCell className={cn("text-right tabular-nums", (pctMeta(l.venda, metaDe(l)) ?? 0) >= 100 && "font-semibold text-emerald-700")}>{pct(pctMeta(l.venda, metaDe(l)), 1)}</TableCell>}
                  <TableCell className="text-right tabular-nums">{teleDe(l) === null ? "—" : moeda(teleDe(l))}</TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{teleDe(l) === null || !l.venda ? "—" : pct(((teleDe(l) ?? 0) / l.venda) * 100, 1)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(l.atendimentos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{moeda(l.ticket)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{inteiro(l.unidades)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{decimal(l.sacola)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{tele ? "—" : inteiro(l.fortvigor)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(l.premium)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.pctPremium)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(l.genSim)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.pctGenSim)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.cmv)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">{pct(l.rentab)}</TableCell>
                </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell />
                <TableCell>Total{regional ? ` ${regional}` : " da rede"}</TableCell>
                <TableCell className="text-right tabular-nums">{moeda(total.venda)}</TableCell>
                {temMeta && <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(metaTotal)}</TableCell>}
                {temMeta && <TableCell className="text-right tabular-nums">{pct(pctMeta(total.venda, metaTotal), 1)}</TableCell>}
                <TableCell className="text-right tabular-nums">{moeda(teleTotal)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{vendaLojas ? pct((teleTotal / vendaLojas) * 100, 1) : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{inteiro(total.atendimentos)}</TableCell>
                <TableCell className="text-right tabular-nums">{moeda(total.ticket)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{inteiro(total.unidades)}</TableCell>
                <TableCell className="hidden text-right tabular-nums md:table-cell">{decimal(total.sacola)}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{inteiro(total.fortvigor)}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(total.premium)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(total.pctPremium)}</TableCell>
                <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(total.genSim)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(total.pctGenSim)}</TableCell>
                <TableCell className="text-right tabular-nums">{pct(total.cmv)}</TableCell>
                <TableCell className="hidden text-right tabular-nums xl:table-cell">{pct(total.rentab)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </section>
      <p className="mt-2 text-xs text-muted-foreground">
        Tele R$ = quanto a filial vendeu no tele-entrega (Trier: Relação de Vendas, sem o tipo de cartão 30 e sem os vendedores da central de televendas); % tele = parte da venda da filial. Unid. sacola = unidades por atendimento. CMV = custo do cadastro do produto ÷ venda. % rentab. = 100% − CMV. Fortvigor = laboratórios Fortvigor/FCT e Agape/Fortvigor.
        {temTele && (
          <>
            {" "}
            TELE = o que cada central de tele-vendas vendeu: essa venda sai da filial onde o Trier lançou e fica só na linha da central, que conta na regional dela (premium, gen+sim e unidades na proporção do mês de cada vendedor);{" "}
            <Link href={`/vendas/televendas?ver=${periodo.ver}&mes=${periodo.mes}&de=${de}&ate=${ate}`} className="underline">
              ver por vendedor
            </Link>
            .
          </>
        )}
      </p>
    </>
  );
}
