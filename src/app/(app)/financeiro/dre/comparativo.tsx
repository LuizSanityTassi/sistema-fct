import Link from "next/link";
import { ScrollText } from "lucide-react";
import { ColunasResultado, Sparkline } from "@/components/graficos";
import { SelectNativo } from "@/components/form/campo";
import { EstadoVazio, Indicador, Variacao, type VariacaoIndicador } from "@/components/layout/painel";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { contas, temLancamento } from "@/lib/data/dre-contabil";
import { variacaoDre, type ContasDre } from "@/lib/financeiro/dre-contabil";
import { moedaFin } from "@/lib/financeiro/formatos";
import { rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { AvisoCobertura, cabecalhosOrdenaveis, empresasSemDre, Filtros, query, tom, type Direcao, type Props } from "./comum";

const mesCurto = (m: string) => rotuloCompetencia(m).replace(/^(\w{3})\w* de (\d{4})$/, "$1/$2");
const pctBr = (v: number, casas = 1) => `${(Math.abs(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;

/** Chip de variação: verde quando melhorou, vermelho quando piorou; em % se faz sentido, senão a diferença em R$. */
function chip(atual: number, anterior: number | null, comparado: string): VariacaoIndicador | null {
  const v = variacaoDre(atual, anterior);
  if (!v) return null;
  if (Math.abs(v.diferenca) < 0.5) return { texto: "igual", direcao: "igual", tom: "neutro", dica: `Igual a ${comparado}` };
  const subiu = v.diferenca > 0;
  const texto = v.pct === null ? moedaFin(Math.abs(v.diferenca)) : pctBr(v.pct, Math.abs(v.pct) < 0.1 ? 1 : 0);
  return { texto, direcao: subiu ? "sobe" : "desce", tom: subiu ? "sucesso" : "perigo", dica: `${subiu ? "Subiu" : "Caiu"} ${texto} em relação a ${comparado} (${moedaFin(anterior)})` };
}

/** Margem em pontos percentuais. */
function chipPp(atual: number | null, anterior: number | null | undefined, comparado: string): VariacaoIndicador | null {
  if (atual === null || anterior === null || anterior === undefined) return null;
  const dif = (atual - anterior) * 100;
  if (Math.abs(dif) < 0.05) return { texto: "igual", direcao: "igual", tom: "neutro" };
  const texto = `${Math.abs(dif).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p.`;
  return { texto, direcao: dif > 0 ? "sobe" : "desce", tom: dif > 0 ? "sucesso" : "perigo", dica: `${dif > 0 ? "Subiu" : "Caiu"} ${texto} em relação a ${comparado}` };
}

/** Célula de variação da tabela: chip colorido ou "—" com o motivo. */
function CelulaVariacao({ v, semBase }: { v: VariacaoIndicador | null; semBase: string }) {
  return v ? <Variacao v={v} /> : <span className="text-xs text-muted-foreground" title={semBase}>—</span>;
}

/** Colunas que ordenam a tabela (valores nulos — sem o mês de comparação — ficam sempre no fim). */
type Linha = { codigo: string; c: ContasDre; ant: ContasDre | null; anoAnt: ContasDre | null };
const dif = (a: number, b: number | undefined) => (b === undefined ? null : a - b);
const varPct = (a: number, b: number | undefined) => (b === undefined || !b ? null : (a - b) / Math.abs(b));
const ORDENS: Record<string, (l: Linha) => number | null> = {
  faturamento: (l) => l.c.receitaBruta,
  fat_mes: (l) => varPct(l.c.receitaBruta, l.ant?.receitaBruta),
  fat_ano: (l) => varPct(l.c.receitaBruta, l.anoAnt?.receitaBruta),
  lucro: (l) => l.c.lucro,
  lucro_mes: (l) => dif(l.c.lucro, l.ant?.lucro),
  lucro_ano: (l) => dif(l.c.lucro, l.anoAnt?.lucro),
};

/**
 * Comparativo do mês: cada filial (e o total) contra o mês anterior e contra o mesmo mês do ano passado, com a
 * evolução do lucro nos últimos 12 meses.
 */
export function Comparativo({ s, base, empresas, todas, anos, mesesDoAno, mapa, filiais, mesesPorEmpresa }: Props) {
  const mes = mesesDoAno.includes(s("mes")) ? s("mes") : mesesDoAno[mesesDoAno.length - 1];
  const ant = somarMeses(mes, -1);
  const anoAnt = somarMeses(mes, -12);
  const ultimos12 = Array.from({ length: 12 }, (_, i) => somarMeses(mes, i - 11));
  const chaves = [...mapa.keys()];
  const totalTem = (m: string) => chaves.some((id) => temLancamento(mapa, id, m));
  const total = contas(mapa, "*", [mes]);
  const totalAnt = totalTem(ant) ? contas(mapa, "*", [ant]) : null;
  const totalAnoAnt = totalTem(anoAnt) ? contas(mapa, "*", [anoAnt]) : null;
  const serieTotal = ultimos12.filter(totalTem).map((m) => ({ mes: m, c: contas(mapa, "*", [m]) }));

  const ordem = s("ordem") === "filial" || Object.hasOwn(ORDENS, s("ordem")) ? s("ordem") : "lucro";
  const dir: Direcao = s("dir") === "asc" || s("dir") === "desc" ? (s("dir") as Direcao) : ordem === "filial" ? "asc" : "desc";
  const linhas = filiais
    .filter((f) => temLancamento(mapa, f.id, mes))
    .map((f) => ({
      ...f,
      c: contas(mapa, f.id, [mes]),
      ant: temLancamento(mapa, f.id, ant) ? contas(mapa, f.id, [ant]) : null,
      anoAnt: temLancamento(mapa, f.id, anoAnt) ? contas(mapa, f.id, [anoAnt]) : null,
      serie: ultimos12.filter((m) => temLancamento(mapa, f.id, m)).map((m) => contas(mapa, f.id, [m]).lucro),
    }))
    .sort((a, b) => {
      if (ordem === "filial") return dir === "asc" ? a.codigo.localeCompare(b.codigo) : b.codigo.localeCompare(a.codigo);
      const va = ORDENS[ordem](a);
      const vb = ORDENS[ordem](b);
      if (va === null || vb === null) return va === vb ? a.codigo.localeCompare(b.codigo) : va === null ? 1 : -1;
      return (dir === "asc" ? va - vb : vb - va) || a.codigo.localeCompare(b.codigo);
    });
  const cabecalho = cabecalhosOrdenaveis(ordem, dir, "lucro", (p) => `/financeiro/dre?${query({ ...base, ver: "comparativo", mes, ...p })}`);
  const nomeAnt = mesCurto(ant);
  const nomeAnoAnt = mesCurto(anoAnt);
  // "todas as empresas": a comparação do total só é justa se as mesmas empresas têm DRE nos meses comparados
  const cobertura = todas ? empresasSemDre(mesesPorEmpresa, [mes, ...(totalAnt ? [ant] : []), ...(totalAnoAnt ? [anoAnt] : [])]) : [];

  return (
    <>
      <Filtros base={base} empresas={empresas} anos={anos} ver="comparativo">
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
        {ordem !== "lucro" && <input type="hidden" name="ordem" value={ordem} />}
        {s("dir") && <input type="hidden" name="dir" value={dir} />}
      </Filtros>

      <AvisoCobertura empresas={cobertura} texto={`comparados (${[mes, ...(totalAnt ? [ant] : []), ...(totalAnoAnt ? [anoAnt] : [])].map(mesCurto).join(", ")})`} />

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicador
          rotulo="Faturamento"
          valor={moedaFin(total.receitaBruta)}
          variacao={chip(total.receitaBruta, totalAnt?.receitaBruta ?? null, nomeAnt)}
          comparadoCom={totalAnt ? `× ${nomeAnt}` : `sem DRE de ${nomeAnt}`}
          detalhe={<LinhaAno v={chip(total.receitaBruta, totalAnoAnt?.receitaBruta ?? null, nomeAnoAnt)} nome={nomeAnoAnt} />}
        />
        <Indicador
          rotulo="Lucro / prejuízo"
          valor={<span className={tom(total.lucro)}>{moedaFin(total.lucro)}</span>}
          variacao={chip(total.lucro, totalAnt?.lucro ?? null, nomeAnt)}
          comparadoCom={totalAnt ? `× ${nomeAnt}` : `sem DRE de ${nomeAnt}`}
          detalhe={<LinhaAno v={chip(total.lucro, totalAnoAnt?.lucro ?? null, nomeAnoAnt)} nome={nomeAnoAnt} />}
        />
        <Indicador
          rotulo="Margem de contribuição"
          valor={total.margemPct === null ? "—" : pctBr(total.margemPct)}
          variacao={chipPp(total.margemPct, totalAnt?.margemPct, nomeAnt)}
          comparadoCom={totalAnt ? `× ${nomeAnt}` : `sem DRE de ${nomeAnt}`}
          detalhe={<LinhaAno v={chipPp(total.margemPct, totalAnoAnt?.margemPct, nomeAnoAnt)} nome={nomeAnoAnt} />}
        />
        <Indicador
          rotulo="Lucro sobre o faturamento"
          valor={total.lucroSobreBruta === null ? "—" : `${total.lucroSobreBruta < 0 ? "−" : ""}${pctBr(total.lucroSobreBruta)}`}
          variacao={chipPp(total.lucroSobreBruta, totalAnt?.lucroSobreBruta, nomeAnt)}
          comparadoCom={totalAnt ? `× ${nomeAnt}` : `sem DRE de ${nomeAnt}`}
          detalhe={<LinhaAno v={chipPp(total.lucroSobreBruta, totalAnoAnt?.lucroSobreBruta, nomeAnoAnt)} nome={nomeAnoAnt} />}
        />
      </div>

      {serieTotal.length > 1 && (
        <section className="mb-4 rounded-xl border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold">Lucro / prejuízo do total · últimos 12 meses</h2>
          <p className="mb-4 text-xs text-muted-foreground">Passe o mouse em cada coluna para ver o valor. Só entram os meses com DRE importada.</p>
          <ColunasResultado
            titulo="Lucro ou prejuízo do total por mês"
            rotuloValor="Lucro / prejuízo"
            dados={serieTotal.map(({ mes: m, c }) => ({ rotulo: mesCurto(m), valor: c.lucro, texto: moedaFin(c.lucro) }))}
          />
        </section>
      )}

      <section className="rounded-xl border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
          <h2 className="text-sm font-semibold">
            {rotuloCompetencia(mes)} por filial · contra {nomeAnt} e {nomeAnoAnt}
          </h2>
          <p className="text-xs text-muted-foreground">Clique no título da coluna para ordenar; “—” = a filial não tem DRE no mês de comparação.</p>
        </header>
        {linhas.length === 0 ? (
          <EstadoVazio compacto icone={ScrollText} titulo="Nenhuma filial com lançamento nesse mês" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {cabecalho("filial", "Filial")}
                {cabecalho("faturamento", "Faturamento", "text-right")}
                {cabecalho("fat_mes", `× ${nomeAnt}`, "text-right", "Variação do faturamento contra o mês anterior")}
                {cabecalho("fat_ano", `× ${nomeAnoAnt}`, "hidden text-right md:table-cell", "Variação do faturamento contra o mesmo mês do ano passado")}
                {cabecalho("lucro", "Lucro / prejuízo", "text-right")}
                {cabecalho("lucro_mes", `× ${nomeAnt}`, "text-right", "Variação do lucro contra o mês anterior")}
                {cabecalho("lucro_ano", `× ${nomeAnoAnt}`, "hidden text-right md:table-cell", "Variação do lucro contra o mesmo mês do ano passado")}
                <TableHead className="hidden lg:table-cell">Lucro em 12 meses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link href={`/financeiro/dre?${query({ ...base, ver: "demonstrativo", filial: l.id })}`} className="font-medium hover:underline">
                      <span className="font-mono text-xs">{l.codigo}</span> {l.nome}
                    </Link>
                    {todas && <span className="ml-1.5 text-[11px] text-muted-foreground">{l.empresa}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{moedaFin(l.c.receitaBruta)}</TableCell>
                  <TableCell className="text-right">
                    <CelulaVariacao v={chip(l.c.receitaBruta, l.ant?.receitaBruta ?? null, nomeAnt)} semBase={`Sem DRE de ${nomeAnt}`} />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <CelulaVariacao v={chip(l.c.receitaBruta, l.anoAnt?.receitaBruta ?? null, nomeAnoAnt)} semBase={`Sem DRE de ${nomeAnoAnt}`} />
                  </TableCell>
                  <TableCell className={`text-right font-medium tabular-nums ${tom(l.c.lucro)}`}>{moedaFin(l.c.lucro)}</TableCell>
                  <TableCell className="text-right">
                    <CelulaVariacao v={chip(l.c.lucro, l.ant?.lucro ?? null, nomeAnt)} semBase={`Sem DRE de ${nomeAnt}`} />
                  </TableCell>
                  <TableCell className="hidden text-right md:table-cell">
                    <CelulaVariacao v={chip(l.c.lucro, l.anoAnt?.lucro ?? null, nomeAnoAnt)} semBase={`Sem DRE de ${nomeAnoAnt}`} />
                  </TableCell>
                  <TableCell className="hidden w-32 lg:table-cell">
                    {l.serie.length > 1 ? (
                      <Sparkline valores={l.serie} className={`h-7 w-28 ${l.c.lucro < 0 ? "text-red-600" : "text-emerald-600"}`} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Total{todas ? " das empresas" : ""} (com depreciação)</TableCell>
                <TableCell className="text-right tabular-nums">{moedaFin(total.receitaBruta)}</TableCell>
                <TableCell className="text-right">
                  <CelulaVariacao v={chip(total.receitaBruta, totalAnt?.receitaBruta ?? null, nomeAnt)} semBase={`Sem DRE de ${nomeAnt}`} />
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <CelulaVariacao v={chip(total.receitaBruta, totalAnoAnt?.receitaBruta ?? null, nomeAnoAnt)} semBase={`Sem DRE de ${nomeAnoAnt}`} />
                </TableCell>
                <TableCell className={`text-right font-semibold tabular-nums ${tom(total.lucro)}`}>{moedaFin(total.lucro)}</TableCell>
                <TableCell className="text-right">
                  <CelulaVariacao v={chip(total.lucro, totalAnt?.lucro ?? null, nomeAnt)} semBase={`Sem DRE de ${nomeAnt}`} />
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <CelulaVariacao v={chip(total.lucro, totalAnoAnt?.lucro ?? null, nomeAnoAnt)} semBase={`Sem DRE de ${nomeAnoAnt}`} />
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {serieTotal.length > 1 && <Sparkline valores={serieTotal.map((x) => x.c.lucro)} className={`h-7 w-28 ${total.lucro < 0 ? "text-red-600" : "text-emerald-600"}`} />}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </section>
    </>
  );
}

function LinhaAno({ v, nome }: { v: VariacaoIndicador | null; nome: string }) {
  return v ? (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Variacao v={v} /> × {nome}
    </span>
  ) : (
    <span>sem DRE de {nome}</span>
  );
}
