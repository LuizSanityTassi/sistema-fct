import Link from "next/link";
import { ChevronLeft, FileUp, HeartHandshake } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { crmPorLoja, crmPorVendedor, diasComCrm, indiceCrm, pctFaturamentoCrm, somarCrm, ultimasImportacoesCrm } from "@/lib/data/crm";
import { ehRegionalVendas, faixasDeDias, hojeNoBrasil, REGIONAIS_VENDAS, somarDias } from "@/lib/data/vendas";
import { formatarDataHora } from "@/lib/formatos";
import { cn } from "cn";
import { AbasVendas, inteiro, moeda, pct } from "../comum";
import { CamposPeriodo, lerPeriodoVendas } from "../periodo";
import { ImportarCrm } from "./importar-form";

export const metadata = { title: "CRM (fidelização)" };

const ORDENS = {
  indice: "Índice de fidelização",
  vendas: "Nº de vendas",
  fidelizadas: "Vendas fidelizadas",
  valor: "Valor fidelizado",
} as const;
type Ordem = keyof typeof ORDENS;

/** Verde: na média da rede ou acima; vermelho: mais de 5 pontos abaixo. */
function corIndice(v: number | null, rede: number | null) {
  if (v === null || rede === null) return "";
  if (v >= rede) return "font-semibold text-emerald-700";
  if (v < rede - 5) return "font-semibold text-red-700";
  return "";
}

export default async function CrmPage({ searchParams }: PageProps<"/vendas/crm">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/crm"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const hoje = hojeNoBrasil();
  const ontem = somarDias(hoje, -1);
  const periodo = lerPeriodoVendas(sp, ontem);
  const { de, ate } = periodo;
  const regional = ehRegionalVendas(s("regional")) ? s("regional") : "";
  const ordem: Ordem = s("ordem") in ORDENS ? (s("ordem") as Ordem) : "indice";
  const filialPedida = /^F\d{3}$/i.test(s("filial")) ? s("filial").toUpperCase() : "";
  const envia = sessao.papel === "admin" || sessao.papel === "financeiro";

  const [vendedores, dias, importacoes] = await Promise.all([crmPorVendedor(de, ate), diasComCrm(de, ate), envia ? ultimasImportacoesCrm() : Promise.resolve([])]);
  const lojasTodas = await crmPorLoja(vendedores);
  const lojas = lojasTodas.filter((l) => !regional || l.regional === regional);
  const rede = somarCrm(lojas);
  const indiceRede = indiceCrm(rede);
  const faltam: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) if (!dias.has(d)) faltam.push(d);

  const chave = (l: { vendas: number; fidelizadas: number; valorFidelizado: number }) =>
    ordem === "vendas" ? l.vendas : ordem === "fidelizadas" ? l.fidelizadas : ordem === "valor" ? l.valorFidelizado : (indiceCrm(l) ?? -1);
  lojas.sort((a, b) => chave(b) - chave(a) || b.vendas - a.vendas);
  const loja = filialPedida ? lojasTodas.find((l) => l.filial === filialPedida) : undefined;
  const daLoja = loja ? vendedores.filter((v) => v.filial === loja.filial && v.vendas > 0).sort((a, b) => chave(b) - chave(a) || b.vendas - a.vendas) : [];
  const indiceLoja = loja ? indiceCrm(loja) : null;

  const params = new URLSearchParams({ ver: periodo.ver, mes: periodo.mes, de, ate, ...(regional ? { regional } : {}), ...(ordem !== "indice" ? { ordem } : {}) });
  const extra = `${regional ? `&regional=${encodeURIComponent(regional)}` : ""}${ordem !== "indice" ? `&ordem=${ordem}` : ""}${filialPedida ? `&filial=${filialPedida}` : ""}`;

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        titulo="CRM (fidelização)"
        descricao="Índice de fidelização do Bunker: quantas vendas tiveram o cliente identificado, por loja e por vendedor. Índice = vendas fidelizadas ÷ vendas. Os números vêm do relatório “Índice de Fidelização por Vendedor (Adm)” do Bunker, enviado aqui um dia por vez."
      />
      <AbasVendas ativa="/vendas/crm" papel={sessao.papel} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <CamposPeriodo p={periodo} rota="/vendas/crm" extra={extra} />
        {filialPedida && <input type="hidden" name="filial" value={filialPedida} />}
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
                {ORDENS[o]}
              </option>
            ))}
          </SelectNativo>
        </label>
        <Button type="submit">Pesquisar</Button>
        <p className="ml-auto self-center text-xs text-muted-foreground">
          {periodo.texto} · rede {pct(indiceRede, 2)}
        </p>
      </form>

      {faltam.length > 0 && (
        <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong className="font-semibold">Período incompleto:</strong> {faltam.length === 1 ? "falta o dia" : `faltam ${faltam.length} dias`} ({faixasDeDias(faltam)}) — o CRM desses dias ainda não foi enviado.
        </div>
      )}

      {loja ? (
        <Painel
          titulo={`${loja.filial} · ${loja.nome}: índice ${pct(indiceLoja, 2)}`}
          descricao={`${inteiro(loja.vendas)} vendas, ${inteiro(loja.fidelizadas)} fidelizadas, ${inteiro(loja.avulsas)} avulsas · ${moeda(loja.valorFidelizado)} de ${moeda(loja.valorVendas)} (${pct(pctFaturamentoCrm(loja), 1)} do faturamento) · rede ${pct(indiceRede, 2)}`}
          acao={
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/vendas/crm?${params.toString()}`} />}>
              <ChevronLeft data-icon="inline-start" />
              Todas as lojas
            </Button>
          }
        >
          <Table className="text-[13px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 pl-5">#</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
                <TableHead className="text-right">Fidelizadas</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Avulsas</TableHead>
                <TableHead className="text-right">Índice</TableHead>
                <TableHead className="hidden text-right md:table-cell">Valor vendido</TableHead>
                <TableHead className="hidden text-right md:table-cell">Valor fidelizado</TableHead>
                <TableHead className="hidden pr-5 text-right lg:table-cell">% faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {daLoja.map((v, i) => (
                <TableRow key={`${v.vendedorCodigo ?? v.vendedorNome}-${i}`}>
                  <TableCell className="pl-5 text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</TableCell>
                  <TableCell>
                    {v.vendedorNome}
                    {v.vendedorCodigo && <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{v.vendedorCodigo}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(v.vendas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(v.fidelizadas)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{inteiro(v.avulsas)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", corIndice(indiceCrm(v), indiceLoja))}>{pct(indiceCrm(v), 2)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(v.valorVendas)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(v.valorFidelizado)}</TableCell>
                  <TableCell className="hidden pr-5 text-right tabular-nums lg:table-cell">{pct(pctFaturamentoCrm(v), 1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="px-5 py-3 text-xs text-muted-foreground">Verde: no índice da loja ou acima; vermelho: mais de 5 pontos abaixo da loja.</p>
        </Painel>
      ) : (
        <section className="rounded-xl border bg-card">
          {!lojas.length ? (
            <EstadoVazio
              icone={HeartHandshake}
              titulo="Sem CRM nesse período"
              descricao={envia ? "Envie o arquivo do Bunker logo abaixo (um dia por vez)." : "O CRM desse período ainda não foi enviado do Bunker."}
            />
          ) : (
            <Table className="text-[13px] [&_td]:px-2 [&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th]:px-2 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Filial</TableHead>
                  <TableHead className="text-right">Vendas</TableHead>
                  <TableHead className="text-right">Fidelizadas</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Avulsas</TableHead>
                  <TableHead className="text-right">Índice</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Valor vendido</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Valor fidelizado</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">% faturamento</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Vendedores</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lojas.map((l, i) => (
                  <TableRow key={l.filial}>
                    <TableCell className="text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}º</TableCell>
                    <TableCell>
                      <Link href={`/vendas/crm?${params.toString()}&filial=${l.filial}`} className="hover:underline">
                        <span className="font-mono text-xs">{l.filial}</span> <span className="text-sm">{l.nome}</span>
                      </Link>
                      {!regional && l.regional && <span className="block text-[11px] text-muted-foreground">{l.regional}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{inteiro(l.vendas)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inteiro(l.fidelizadas)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{inteiro(l.avulsas)}</TableCell>
                    <TableCell className={cn("text-right tabular-nums", corIndice(indiceCrm(l), indiceRede))}>{pct(indiceCrm(l), 2)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(l.valorVendas)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(l.valorFidelizado)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{pct(pctFaturamentoCrm(l), 1)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{inteiro(l.vendedores)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell />
                  <TableCell>Total{regional ? ` ${regional}` : " da rede"}</TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(rede.vendas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inteiro(rede.fidelizadas)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{inteiro(rede.avulsas)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(indiceRede, 2)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(rede.valorVendas)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(rede.valorFidelizado)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums lg:table-cell">{pct(pctFaturamentoCrm(rede), 1)}</TableCell>
                  <TableCell className="hidden lg:table-cell" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </section>
      )}
      {!loja && lojas.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Clique na loja para ver os vendedores. Verde: na média da rede ou acima; vermelho: mais de 5 pontos abaixo da rede. % faturamento = parte do valor vendido com cliente identificado.</p>}

      {envia && (
        <Painel
          className="mt-6"
          titulo="Enviar o CRM do Bunker"
          icone={FileUp}
          descricao="No Bunker: Resultados e Relatórios → Índice de Fidelização por Vendedor (Adm) → Todas Unidades, Data Inicial e Data Final no mesmo dia → Filtrar → Exportar → Exportar Vendedores. Envie o CSV aqui com o dia. O portal confere com os atendimentos do Trier do dia; enviar o mesmo dia de novo substitui o dia."
        >
          <div className="space-y-4 px-5 pb-5">
            <ImportarCrm ontem={ontem} hoje={hoje} />
            {importacoes.length > 0 && (
              <ul className="divide-y rounded-lg border text-xs">
                {importacoes.map((i) => (
                  <li key={i.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                    <span>
                      <span className="font-medium">{faixasDeDias(i.dias)}</span> · {inteiro(i.linhas)} vendedores · <span className="break-all text-muted-foreground">{i.arquivo}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {i.criado_por_nome ?? "—"}, {formatarDataHora(i.criado_em)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>
      )}
    </>
  );
}
