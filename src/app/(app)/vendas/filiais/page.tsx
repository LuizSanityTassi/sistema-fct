import Link from "next/link";
import { Store } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { ehRegionalVendas, MESES, REGIONAIS_VENDAS, somar, somarDias, hojeNoBrasil, ultimoDia, vendasPorFilial, type LinhaFilialVendas } from "@/lib/data/vendas";
import { formatarData } from "@/lib/formatos";
import { INICIO_HISTORICO } from "@/lib/vendas/coleta";
import { AbasVendas, decimal, inteiro, moeda, pct } from "../comum";

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

/** Meses do histórico (mais recente primeiro) para o seletor. */
function mesesDisponiveis(ateMes: string) {
  const out: string[] = [];
  let [a, m] = ateMes.split("-").map(Number);
  const [a0, m0] = INICIO_HISTORICO.split("-").map(Number);
  while (a > a0 || (a === a0 && m >= m0)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (!m) {
      m = 12;
      a -= 1;
    }
  }
  return out;
}

export default async function VendaFiliaisPage({ searchParams }: PageProps<"/vendas/filiais">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/filiais"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const ontem = somarDias(hojeNoBrasil(), -1);
  const ver = s("ver") === "dia" ? "dia" : "mes";
  const meses = mesesDisponiveis(ontem.slice(0, 7));
  const mes = meses.includes(s("mes")) ? s("mes") : meses[0];
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let de: string;
  let ate: string;
  if (ver === "mes") {
    const [a, m] = mes.split("-").map(Number);
    de = `${mes}-01`;
    ate = `${mes}-${String(ultimoDia(a, m)).padStart(2, "0")}`;
    if (ate > ontem) ate = ontem;
  } else {
    ate = iso.test(s("ate")) && s("ate") <= ontem ? s("ate") : ontem;
    de = iso.test(s("de")) && s("de") <= ate ? s("de") : ate;
  }
  const regional = ehRegionalVendas(s("regional")) ? s("regional") : "";
  const ordem: Ordem = s("ordem") in ORDENS ? (s("ordem") as Ordem) : "venda";

  const todas = await vendasPorFilial(de, ate);
  const linhas = todas.filter((l) => !regional || l.regional === regional).sort((a, b) => ORDENS[ordem].valor(b) - ORDENS[ordem].valor(a) || b.venda - a.venda);
  const total = somar(linhas);
  const [am, mm] = mes.split("-").map(Number);
  const periodoTexto = ver === "mes" ? `${MESES[mm - 1]} de ${am}${ate.slice(0, 7) === ontem.slice(0, 7) ? ` (até ${formatarData(ate)})` : ""}` : de === ate ? formatarData(de) : `${formatarData(de)} a ${formatarData(ate)}`;

  return (
    <>
      <PageHeader eyebrow="Vendas" titulo="Venda por filial" descricao="Ranking das lojas no período: venda, atendimentos, ticket médio, unidades, Fortvigor, premium, genérico + similar e CMV. Números do Trier (vendas menos devoluções), atualizados toda madrugada com o dia anterior." />
      <AbasVendas ativa="/vendas/filiais" papel={sessao.papel} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <div className="flex rounded-lg border p-0.5 text-sm" role="group" aria-label="Período">
          {(["mes", "dia"] as const).map((v) => (
            <Link key={v} href={`/vendas/filiais?ver=${v}${regional ? `&regional=${encodeURIComponent(regional)}` : ""}`} aria-current={ver === v ? "page" : undefined} className={`rounded-md px-3 py-1 ${ver === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {v === "mes" ? "Mensal" : "Diária"}
            </Link>
          ))}
        </div>
        <input type="hidden" name="ver" value={ver} />
        {ver === "mes" ? (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mês</span>
            <SelectNativo name="mes" defaultValue={mes} className="w-48">
              {meses.map((m) => {
                const [a, mm2] = m.split("-").map(Number);
                return (
                  <option key={m} value={m}>
                    {MESES[mm2 - 1]} de {a}
                  </option>
                );
              })}
            </SelectNativo>
          </label>
        ) : (
          <>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">De</span>
              <Input name="de" type="date" defaultValue={de} min={INICIO_HISTORICO} max={ontem} className="w-40" />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Até</span>
              <Input name="ate" type="date" defaultValue={ate} min={INICIO_HISTORICO} max={ontem} className="w-40" />
            </label>
          </>
        )}
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
          {periodoTexto} · {linhas.length} {linhas.length === 1 ? "filial" : "filiais"}
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
              {linhas.map((l, i) => (
                <TableRow key={l.branchId}>
                  <TableCell className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs">{l.codigo}</span> <span className="text-sm">{l.nome}</span>
                    {!regional && <span className="block text-[11px] text-muted-foreground">{l.regional}</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{moeda(l.venda)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(l.atendimentos)}</TableCell>
                  <TableCell className="text-right tabular-nums">{moeda(l.ticket)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{inteiro(l.unidades)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{decimal(l.sacola)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{inteiro(l.fortvigor)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(l.premium)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.pctPremium)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(l.genSim)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.pctGenSim)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(l.cmv)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums xl:table-cell">{pct(l.rentab)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell />
                <TableCell>Total{regional ? ` ${regional}` : " da rede"}</TableCell>
                <TableCell className="text-right tabular-nums">{moeda(total.venda)}</TableCell>
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
      <p className="mt-2 text-xs text-muted-foreground">Unid. sacola = unidades por atendimento. CMV = custo do cadastro do produto ÷ venda. % rentab. = 100% − CMV. Fortvigor = laboratórios Fortvigor/FCT e Agape/Fortvigor.</p>
    </>
  );
}
