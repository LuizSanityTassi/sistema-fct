import Link from "next/link";
import { Headset, Store } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { cn } from "cn";
import { chaveMetaFilial, diasSemVendas, ehRegionalVendas, faixasDeDias, metasDoMes, REGIONAIS_VENDAS, somar, TELEVENDAS, vendasPorFilial, type LinhaFilialVendas } from "@/lib/data/vendas";
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
type Ordem = keyof typeof ORDENS;

export default async function VendaFiliaisPage({ searchParams }: PageProps<"/vendas/filiais">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/filiais"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const periodo = lerPeriodoVendas(sp);
  const { de, ate } = periodo;
  const regional = ehRegionalVendas(s("regional")) ? s("regional") : "";
  const ordem: Ordem = s("ordem") in ORDENS ? (s("ordem") as Ordem) : "venda";

  const [todas, faltam, metas] = await Promise.all([vendasPorFilial(de, ate), diasSemVendas(de, ate), periodo.ver === "mes" ? metasDoMes(`${periodo.mes}-01`) : Promise.resolve(new Map<string, number>())]);
  // a linha Televendas (venda da equipe de tele-vendas, que sai das filiais) entra no ranking como uma loja
  const linhas = todas.filter((l) => !regional || l.regional === regional).sort((a, b) => ORDENS[ordem].valor(b) - ORDENS[ordem].valor(a) || b.venda - a.venda);
  const total = somar(linhas);
  const temTele = linhas.some((l) => l.regional === TELEVENDAS);
  // meta do mês (só na visão mensal, quando há meta cadastrada)
  const metaDe = (l: LinhaFilialVendas) => metas.get(chaveMetaFilial(l)) ?? null;
  const temMeta = linhas.some((l) => metaDe(l) !== null);
  const metaTotal = linhas.reduce((s, l) => s + (metaDe(l) ?? 0), 0);
  const pctMeta = (venda: number, meta: number | null) => (meta ? (venda / meta) * 100 : null);

  return (
    <>
      <PageHeader eyebrow="Vendas" titulo="Venda por filial" descricao="Ranking das lojas no período: venda, atendimentos, ticket médio, unidades, Fortvigor, premium, genérico + similar e CMV. Números do Trier (vendas menos devoluções), atualizados toda madrugada com o dia anterior." />
      <AbasVendas ativa="/vendas/filiais" papel={sessao.papel} />
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
            {(Object.keys(ORDENS) as Ordem[]).map((o) => (
              <option key={o} value={o}>
                {ORDENS[o].rotulo}
              </option>
            ))}
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead className="text-right">Venda R$</TableHead>
                {temMeta && <TableHead className="hidden text-right lg:table-cell">Meta</TableHead>}
                {temMeta && <TableHead className="text-right">% meta</TableHead>}
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
                const tele = l.regional === TELEVENDAS;
                return (
                <TableRow key={l.branchId} className={cn(tele && "bg-sky-50/70 dark:bg-sky-950/30")}>
                  <TableCell className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</TableCell>
                  <TableCell>
                    {tele ? (
                      <Link href={`/vendas/televendas?ver=${periodo.ver}&mes=${periodo.mes}&de=${de}&ate=${ate}`} className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline">
                        <Headset className="size-4 text-sky-600" aria-hidden />
                        Televendas
                      </Link>
                    ) : (
                      <>
                        <span className="font-mono text-xs">{l.codigo}</span> <span className="text-sm">{l.nome}</span>
                      </>
                    )}
                    {!regional && <span className="block text-[11px] text-muted-foreground">{tele ? "equipe de tele-vendas" : l.regional}</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{moeda(l.venda)}</TableCell>
                  {temMeta && <TableCell className="hidden text-right tabular-nums text-muted-foreground lg:table-cell">{moeda(metaDe(l))}</TableCell>}
                  {temMeta && <TableCell className={cn("text-right tabular-nums", (pctMeta(l.venda, metaDe(l)) ?? 0) >= 100 && "font-semibold text-emerald-700")}>{pct(pctMeta(l.venda, metaDe(l)), 1)}</TableCell>}
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
        Unid. sacola = unidades por atendimento. CMV = custo do cadastro do produto ÷ venda. % rentab. = 100% − CMV. Fortvigor = laboratórios Fortvigor/FCT e Agape/Fortvigor.
        {temTele && (
          <>
            {" "}
            Televendas = o que a equipe de tele-vendas vendeu: essa venda sai da filial onde o Trier lançou e fica só nesta linha (premium, gen+sim e unidades na proporção do mês de cada vendedor);{" "}
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
