import Link from "next/link";
import { BadgeDollarSign, Eye, Receipt, ShoppingBag, Truck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { DIAS_SEMANA, diaDaSemana, hojeNoBrasil, MESES, mesmoDia, ultimoDia, ultimoDiaVendas } from "@/lib/data/vendas";
import { minhasVendas, type DiaMinhasVendas } from "@/lib/data/vendas-vendedores";
import { formatarData } from "@/lib/formatos";
import { ROTA_MINHAS_VENDAS } from "@/lib/nav";
import { AtualizaSozinho } from "../atualiza-sozinho";
import { inteiro, moeda, pct, variacao } from "../comum";
import { CamposPeriodo, lerPeriodoVendas } from "../periodo";

export const metadata = { title: "Minhas vendas" };

function somar(dias: DiaMinhasVendas[]) {
  const venda = dias.reduce((s, d) => s + d.venda, 0);
  const atendimentos = dias.reduce((s, d) => s + d.atendimentos, 0);
  return { venda, atendimentos, ticket: atendimentos ? venda / atendimentos : null, tele: dias.reduce((s, d) => s + d.teleVenda, 0), teleAtend: dias.reduce((s, d) => s + d.teleAtendimentos, 0), diasComVenda: new Set(dias.map((d) => d.data)).size };
}

export default async function MinhasVendasPage({ searchParams }: PageProps<"/vendas/minhas">) {
  const [sessao, sp, ultimo] = await Promise.all([exigirAcesso(ROTA_MINHAS_VENDAS), searchParams, ultimoDiaVendas()]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const periodo = lerPeriodoVendas(sp, ultimo.dia);
  const { de, ate } = periodo;
  // só o administrador abre a venda de outra pessoa (para conferir o que o vendedor vê)
  const func = sessao.papel === "admin" && ehUuid(s("func")) ? s("func") : undefined;
  // usuário do portal sem ficha no RH (o código ligado direto ao login)
  const usu = sessao.papel === "admin" && !func && ehUuid(s("usuario")) ? s("usuario") : undefined;
  const outro = func ?? usu;
  const alvo = { employee: func, profile: usu };
  const [atual, anterior] = await Promise.all([minhasVendas(de, ate, alvo), minhasVendas(mesmoDia(de, 1), mesmoDia(ate, 1), alvo)]);
  const t = somar(atual.dias);
  const a = somar(anterior.dias);
  const [am, mm] = de.split("-").map(Number);
  const comparado = `× ${MESES[(mm + 10) % 12].slice(0, 3).toLowerCase()} ${periodo.ver === "mes" ? `até dia ${Number(mesmoDia(ate, 1).slice(8))}` : "no mesmo período"}`;

  // meta do mês (só na visão mensal): o quanto já foi e onde devia estar hoje
  const meta = periodo.ver === "mes" ? atual.meta : null;
  const pctMeta = meta ? (t.venda / meta) * 100 : null;
  const mesCorrente = ate.slice(0, 7) === hojeNoBrasil().slice(0, 7);
  const ritmo = meta && mesCorrente ? (Number(ate.slice(8)) / ultimoDia(am, mm)) * 100 : undefined;

  const diasDaFilial = new Map<string, DiaMinhasVendas[]>();
  for (const d of atual.dias) diasDaFilial.set(d.filial, [...(diasDaFilial.get(d.filial) ?? []), d]);
  const porFilial = [...diasDaFilial].map(([codigo, dias]) => ({ codigo, loja: dias[0].loja, ...somar(dias) })).sort((x, y) => y.venda - x.venda);
  const totalGrupos = atual.grupos.reduce((s, g) => s + g.venda, 0);
  const extra = func ? `&func=${func}` : usu ? `&usuario=${usu}` : "";
  const nomes = atual.vendedores.map((v) => `${v.codigo}${v.nome && v.nome !== atual.funcionario ? ` (${v.nome})` : ""}`).join(", ");

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        titulo={outro && atual.funcionario ? `Vendas de ${atual.funcionario}` : "Minhas vendas"}
        descricao="Só a sua venda, lida do Trier (vendas menos devoluções). O dia de hoje é parcial e vai atualizando ao longo do dia; de madrugada o dia inteiro é lido de novo."
      />
      <AtualizaSozinho />
      {outro && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <Eye className="size-4" aria-hidden />
          <span>
            Você está vendo exatamente o que <strong>{atual.funcionario ?? "esse funcionário"}</strong> vê ao entrar com o login dele (só o administrador abre esta visão).
          </span>
          <Link href="/vendas/vendedores" className="ml-auto font-medium underline">
            Voltar ao acesso dos vendedores
          </Link>
        </div>
      )}

      {!atual.vendedores.length ? (
        <section className="rounded-xl border bg-card">
          <EstadoVazio
            icone={BadgeDollarSign}
            titulo={outro ? "Essa pessoa não tem código de vendedor ligado" : "Seu login ainda não está ligado ao seu código de vendedor no Trier"}
            descricao={
              sessao.papel === "admin" ? (
                <>
                  Ligue os códigos em{" "}
                  <Link href="/vendas/vendedores" className="underline">
                    Comercial → Acesso dos vendedores
                  </Link>
                  .
                </>
              ) : (
                "Peça ao administrador para ligar o seu código de vendedor ao seu cadastro."
              )
            }
          />
        </section>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
            {func && <input type="hidden" name="func" value={func} />}
            {usu && <input type="hidden" name="usuario" value={usu} />}
            <CamposPeriodo p={periodo} rota={ROTA_MINHAS_VENDAS} extra={extra} />
            <Button type="submit">Pesquisar</Button>
            <p className="ml-auto self-center text-xs text-muted-foreground">
              {periodo.texto} · código no Trier: {nomes}
            </p>
          </form>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Venda" icone={BadgeDollarSign} valor={moeda(t.venda)} variacao={variacao(t.venda, a.venda, comparado)} comparadoCom={a.venda > 0 ? comparado : undefined} detalhe={`${t.diasComVenda} ${t.diasComVenda === 1 ? "dia" : "dias"} com venda`} meta={meta && pctMeta !== null ? { texto: moeda(meta), pct: pctMeta, ritmo } : undefined} />
            <Indicador rotulo="Atendimentos" icone={Users} valor={inteiro(t.atendimentos)} variacao={variacao(t.atendimentos, a.atendimentos, comparado)} comparadoCom={a.atendimentos > 0 ? comparado : undefined} />
            <Indicador rotulo="Ticket médio" icone={Receipt} valor={moeda(t.ticket)} variacao={variacao(t.ticket, a.ticket, comparado)} comparadoCom={a.ticket ? comparado : undefined} />
            <Indicador rotulo="Tele-entrega" icone={Truck} valor={moeda(t.tele)} detalhe={`${inteiro(t.teleAtend)} ${t.teleAtend === 1 ? "entrega" : "entregas"}${t.venda ? ` · ${pct((t.tele / t.venda) * 100, 1)} da sua venda` : ""}`} />
          </div>
          {meta !== null && pctMeta !== null && (
            <p className="-mt-2 mb-4 text-sm text-muted-foreground">
              {pctMeta >= 100 ? (
                <strong className="text-emerald-700">Meta do mês batida: {pct(pctMeta, 1)}.</strong>
              ) : (
                <>
                  Faltam <strong className="text-foreground">{moeda(meta - t.venda)}</strong> para a meta de {moeda(meta)} ({pct(pctMeta, 1)} feito
                  {ritmo !== undefined && `; o esperado até hoje é ${Math.round(ritmo)}%`}).
                </>
              )}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <section className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-3 text-sm font-semibold">Dia a dia</h2>
              {!atual.dias.length ? (
                <EstadoVazio compacto icone={ShoppingBag} titulo="Sem venda sua nesse período" />
              ) : (
                <Table className="text-[13px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Dia</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right">Atend.</TableHead>
                      <TableHead className="text-right">Venda R$</TableHead>
                      <TableHead className="text-right">Ticket</TableHead>
                      <TableHead className="pr-4 text-right">Tele R$</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...atual.dias].reverse().map((d) => (
                      <TableRow key={`${d.data}-${d.filial}`}>
                        <TableCell className="pl-4 tabular-nums">
                          {formatarData(d.data)} <span className="text-xs text-muted-foreground">{DIAS_SEMANA[diaDaSemana(d.data)].slice(0, 3)}</span>
                          {d.data === ultimo.dia && ultimo.parcial && <span className="ml-1 rounded bg-amber-100 px-1 text-[11px] text-amber-900">parcial</span>}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs">{d.filial}</span> <span className="hidden text-xs text-muted-foreground sm:inline">{d.loja}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inteiro(d.atendimentos)}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{moeda(d.venda)}</TableCell>
                        <TableCell className="text-right tabular-nums">{moeda(d.atendimentos ? d.venda / d.atendimentos : null)}</TableCell>
                        <TableCell className="pr-4 text-right tabular-nums text-muted-foreground">{d.teleVenda ? moeda(d.teleVenda) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell className="pl-4" colSpan={2}>
                        Total
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{inteiro(t.atendimentos)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(t.venda)}</TableCell>
                      <TableCell className="text-right tabular-nums">{moeda(t.ticket)}</TableCell>
                      <TableCell className="pr-4 text-right tabular-nums">{moeda(t.tele)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </section>

            <div className="grid content-start gap-4">
              {porFilial.length > 1 && (
                <section className="rounded-xl border bg-card">
                  <h2 className="border-b px-4 py-3 text-sm font-semibold">Por filial</h2>
                  <Table className="text-[13px]">
                    <TableBody>
                      {porFilial.map((f) => (
                        <TableRow key={f.codigo}>
                          <TableCell className="pl-4">
                            <span className="font-mono text-xs">{f.codigo}</span> <span className="text-xs text-muted-foreground">{f.loja}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{inteiro(f.atendimentos)} atend.</TableCell>
                          <TableCell className="pr-4 text-right font-semibold tabular-nums">{moeda(f.venda)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              )}

              <section className="rounded-xl border bg-card">
                <h2 className="border-b px-4 py-3 text-sm font-semibold">
                  Grupos de produtos · {MESES[Number(atual.mes.slice(5, 7)) - 1]}
                  {atual.gruposLidoAte && <span className="font-normal text-muted-foreground"> (até {formatarData(atual.gruposLidoAte)})</span>}
                </h2>
                {!atual.grupos.length ? (
                  <EstadoVazio compacto icone={ShoppingBag} titulo="Sem grupos lidos nesse mês" />
                ) : (
                  <Table className="text-[13px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Grupo</TableHead>
                        <TableHead className="text-right">Unid.</TableHead>
                        <TableHead className="text-right">Venda R$</TableHead>
                        <TableHead className="pr-4 text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {atual.grupos.map((g) => (
                        <TableRow key={g.grupo}>
                          <TableCell className="pl-4">{g.grupo}</TableCell>
                          <TableCell className="text-right tabular-nums">{inteiro(g.quantidade)}</TableCell>
                          <TableCell className="text-right tabular-nums">{moeda(g.venda)}</TableCell>
                          <TableCell className="pr-4 text-right tabular-nums text-muted-foreground">{totalGrupos ? pct((g.venda / totalGrupos) * 100, 1) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Esta tela mostra só a sua venda: ninguém mais aparece aqui, e você não vê a venda dos colegas nem da loja.</p>
        </>
      )}
    </>
  );
}
