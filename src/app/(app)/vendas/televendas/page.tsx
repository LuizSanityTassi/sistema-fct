import Link from "next/link";
import { Headset, Layers, Store, Trophy, Users } from "lucide-react";
import { cn } from "cn";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { diasSemVendas, equipeTelevendas, faixasDeDias, MESES, mesmoDia, resumirTelevendas, somar, televendasGrupos, televendasNoPeriodo, vendasPorFilial, type GrupoTelevendas, type LinhaTelevendas } from "@/lib/data/vendas";
import { AbasVendas, AvisoDiasFaltando, inteiro, moeda, moedaCurta, pct } from "../comum";
import { Comparacao, MiniKpi, Secao } from "../painel-visual";
import { CamposPeriodo, lerPeriodoVendas } from "../periodo";
import { salvarVendedorTele, tirarVendedorTele } from "./actions";
import { EquipeTeleForm } from "./equipe-form";

export const metadata = { title: "Televendas" };

const MEDALHA = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-300 text-orange-950"];

type Agrupado = ReturnType<typeof resumirTelevendas> & { chave: string; linhas: LinhaTelevendas[] };

/** Grupos com taxa própria (os outros grupos do Trier entram depois, pela venda). */
const GRUPOS_TAXA: { chave: string; rotulo: string; codigos: number[]; destaque?: boolean }[] = [
  { chave: "102", rotulo: "Genéricos", codigos: [102] },
  { chave: "103", rotulo: "Similares", codigos: [103] },
  { chave: "gensim", rotulo: "Genérico + similar", codigos: [102, 103], destaque: true },
  { chave: "47", rotulo: "Premium G47", codigos: [47], destaque: true },
  { chave: "113", rotulo: "Marca própria", codigos: [113] },
  { chave: "104", rotulo: "Suplementos", codigos: [104] },
  { chave: "101", rotulo: "Referências", codigos: [101] },
];
const JA_NA_LISTA = new Set(GRUPOS_TAXA.flatMap((g) => g.codigos));
const nomeGrupo = (n: string) => n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());

/** Venda por grupo e total de um conjunto de linhas de grupo. */
function mix(linhas: GrupoTelevendas[]) {
  const porGrupo = new Map<number, number>();
  for (const l of linhas) porGrupo.set(l.grupoCodigo, (porGrupo.get(l.grupoCodigo) ?? 0) + l.venda);
  const total = [...porGrupo.values()].reduce((a, b) => a + b, 0);
  const venda = (codigos: number[]) => codigos.reduce((a, c) => a + (porGrupo.get(c) ?? 0), 0);
  return { total, venda, taxa: (codigos: number[]) => (total ? (venda(codigos) / total) * 100 : null) };
}

function agrupar(linhas: LinhaTelevendas[], chave: (l: LinhaTelevendas) => string): Map<string, Agrupado> {
  const grupos = new Map<string, LinhaTelevendas[]>();
  for (const l of linhas) grupos.set(chave(l), [...(grupos.get(chave(l)) ?? []), l]);
  return new Map([...grupos].map(([k, ls]) => [k, { ...resumirTelevendas(ls), chave: k, linhas: ls }]));
}

export default async function TelevendasPage({ searchParams }: PageProps<"/vendas/televendas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/televendas"), searchParams]);
  const periodo = lerPeriodoVendas(sp);
  const { de, ate } = periodo;
  const admin = sessao.papel === "admin";
  // comparação: os mesmos dias do mês anterior
  const deAnt = mesmoDia(de, 1);
  const ateAnt = mesmoDia(ate, 1);
  const mesAnt = MESES[Number(deAnt.slice(5, 7)) - 1].toLowerCase();
  const [linhas, linhasAnt, lojas, equipe, faltam, grupos, gruposAnt] = await Promise.all([
    televendasNoPeriodo(de, ate),
    televendasNoPeriodo(deAnt, ateAnt),
    vendasPorFilial(de, ate),
    equipeTelevendas(),
    diasSemVendas(de, ate),
    televendasGrupos(de, ate),
    televendasGrupos(deAnt, ateAnt),
  ]);

  const t = resumirTelevendas(linhas);
  const tAnt = resumirTelevendas(linhasAnt);
  const vendaRede = somar(lojas).venda;
  const rotuloAnt = `vs ${mesAnt}`;

  const porVendedor = agrupar(linhas, (l) => String(l.vendedorCodigo));
  const antPorVendedor = agrupar(linhasAnt, (l) => String(l.vendedorCodigo));
  // quem está na equipe e não vendeu no período também aparece (com zero)
  const ranking = [
    ...[...porVendedor.values()],
    ...equipe.filter((v) => !porVendedor.has(String(v.vendedor_codigo))).map((v): Agrupado => ({ ...resumirTelevendas([]), chave: String(v.vendedor_codigo), linhas: [] })),
  ].sort((a, b) => b.venda - a.venda);
  const cadastro = new Map(equipe.map((v) => [String(v.vendedor_codigo), v]));
  const porEquipe = [...agrupar(linhas, (l) => l.equipe).values()].sort((a, b) => b.venda - a.venda);
  const porLoja = [...agrupar(linhas, (l) => l.branchId).values()].sort((a, b) => b.venda - a.venda);
  const maxEquipe = Math.max(1, ...porEquipe.map((e) => e.venda));
  const equipes = [...new Set(equipe.map((v) => v.equipe))];
  const linkPeriodo = `ver=${periodo.ver}&mes=${periodo.mes}&de=${de}&ate=${ate}`;

  // taxas por grupo: a equipe e cada vendedor (colunas na ordem do ranking)
  const mixEquipe = mix(grupos);
  const mixEquipeAnt = mix(gruposAnt);
  const colunasMix = ranking.filter((v) => grupos.some((g) => String(g.vendedorCodigo) === v.chave)).map((v) => ({ v, m: mix(grupos.filter((g) => String(g.vendedorCodigo) === v.chave)) }));
  const outrosGrupos = [...new Map(grupos.filter((g) => !JA_NA_LISTA.has(g.grupoCodigo)).map((g) => [g.grupoCodigo, g.grupoNome])).entries()]
    .map(([codigo, nome]) => ({ chave: String(codigo), rotulo: nomeGrupo(nome), codigos: [codigo], destaque: false }))
    .sort((a, b) => mixEquipe.venda(b.codigos) - mixEquipe.venda(a.codigos));
  const linhasMix = [...GRUPOS_TAXA, ...outrosGrupos];
  const primeiroNome = (v: Agrupado) => (cadastro.get(v.chave)?.nome ?? v.linhas[0]?.vendedorNome ?? v.chave).split(/\s+/)[0];

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        titulo="Televendas"
        descricao="O que a equipe de tele-vendas vendeu, por vendedor e por equipe, sem as vendas de e-commerce. Essa venda sai da filial onde o Trier lançou e conta só aqui, como uma loja à parte; o e-commerce da equipe continua na filial (vale de setembro/2026 em diante, desde quando há relatório por vendedor)."
      />
      <AbasVendas ativa="/vendas/televendas" papel={sessao.papel} />
      <AvisoDiasFaltando faltam={faltam.length} texto={`(${faixasDeDias(faltam)})`} admin={admin} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <CamposPeriodo p={periodo} rota="/vendas/televendas" />
        <Button type="submit">Pesquisar</Button>
        <p className="ml-auto self-center text-xs text-muted-foreground">
          {periodo.texto} · {equipe.length} {equipe.length === 1 ? "vendedor" : "vendedores"} na equipe
        </p>
      </form>

      {!equipe.length ? (
        <section className="mb-4 rounded-xl border bg-card">
          <EstadoVazio icone={Headset} titulo="Nenhum vendedor na equipe de televendas" descricao={admin ? "Inclua os vendedores pelo código do Trier no fim da página." : "O administrador cadastra a equipe."} />
        </section>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniKpi rotulo="Venda televendas" valor={moeda(t.venda)} comparacao={<Comparacao atual={t.venda} anterior={tAnt.venda} rotulo={rotuloAnt} />} detalhe={t.ecomVenda ? `sem ${moeda(t.ecomVenda)} de e-commerce (ficou na filial)` : undefined} />
            <MiniKpi rotulo="Atendimentos" valor={inteiro(t.atendimentos)} comparacao={<Comparacao atual={t.atendimentos} anterior={tAnt.atendimentos} rotulo={rotuloAnt} />} />
            <MiniKpi rotulo="Ticket médio" valor={moeda(t.ticket)} comparacao={<Comparacao atual={t.ticket} anterior={tAnt.ticket} rotulo={rotuloAnt} />} />
            <MiniKpi rotulo="CMV" valor={pct(t.cmv, 1)} comparacao={<Comparacao atual={t.cmv} anterior={tAnt.cmv} rotulo={rotuloAnt} formato="pp" inverso />} />
            <MiniKpi rotulo="Participação na rede" valor={vendaRede ? pct((t.venda / vendaRede) * 100, 2) : "—"} detalhe={`de ${moedaCurta(vendaRede)} das lojas`} />
            <MiniKpi rotulo="Com tele-entrega" valor={moeda(t.teleVenda)} detalhe={t.venda ? `${pct((t.teleVenda / t.venda) * 100, 1)} da venda · ${inteiro(t.teleAtendimentos)} entregas` : undefined} />
            <MiniKpi rotulo="Genérico + similar" valor={pct(mixEquipe.taxa([102, 103]), 1)} comparacao={<Comparacao atual={mixEquipe.taxa([102, 103])} anterior={mixEquipeAnt.taxa([102, 103])} rotulo={rotuloAnt} formato="pp" />} detalhe={moeda(mixEquipe.venda([102, 103]))} />
            <MiniKpi rotulo="Premium G47" valor={pct(mixEquipe.taxa([47]), 1)} comparacao={<Comparacao atual={mixEquipe.taxa([47])} anterior={mixEquipeAnt.taxa([47])} rotulo={rotuloAnt} formato="pp" />} detalhe={moeda(mixEquipe.venda([47]))} />
          </div>

          <Secao titulo="Ranking dos vendedores" icone={Trophy} subtitulo={`Venda de cada vendedor em todas as filiais · comparado com os mesmos dias de ${mesAnt}`} className="mb-4">
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-5 sm:pl-6">#</TableHead>
                    <TableHead>Vendedor</TableHead>
                    <TableHead>Equipe</TableHead>
                    <TableHead className="text-right">Venda R$</TableHead>
                    <TableHead className="hidden md:table-cell" />
                    <TableHead className="text-right">Nº atend.</TableHead>
                    <TableHead className="text-right">Ticket médio</TableHead>
                    <TableHead className="text-right">CMV</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Tele-entrega</TableHead>
                    <TableHead className="hidden text-right xl:table-cell">E-commerce (fora)</TableHead>
                    <TableHead className="hidden pr-5 lg:table-cell sm:pr-6">Filiais</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranking.map((v, i) => {
                    const c = cadastro.get(v.chave);
                    const nome = c?.nome ?? v.linhas[0]?.vendedorNome ?? v.chave;
                    const filiais = [...agrupar(v.linhas, (l) => l.codigo).values()].sort((a, b) => b.venda - a.venda);
                    return (
                      <TableRow key={v.chave}>
                        <TableCell className="pl-5 sm:pl-6">
                          <span className={cn("inline-grid size-7 place-items-center rounded-full text-xs font-bold", v.venda > 0 ? (MEDALHA[i] ?? "bg-muted text-muted-foreground") : "bg-muted text-muted-foreground")}>{i + 1}º</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium">{nome}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            <span className="font-mono">{v.chave}</span>
                            {c?.funcao ? ` · ${c.funcao}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{c?.equipe ?? v.linhas[0]?.equipe ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{moeda(v.venda)}</TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Comparacao atual={v.venda} anterior={antPorVendedor.get(v.chave)?.venda ?? null} rotulo={rotuloAnt} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{inteiro(v.atendimentos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{moeda(v.ticket)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(v.cmv, 1)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums lg:table-cell">{v.teleVenda ? moeda(v.teleVenda) : "—"}</TableCell>
                        <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">{v.ecomVenda ? moeda(v.ecomVenda) : "—"}</TableCell>
                        <TableCell className="hidden pr-5 text-xs text-muted-foreground lg:table-cell sm:pr-6">
                          {filiais.length ? filiais.map((f) => `${f.chave} ${moedaCurta(f.venda)}`).join(" · ") : "sem venda no período"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    <TableCell className="pl-5 sm:pl-6" />
                    <TableCell colSpan={2}>Total televendas</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(t.venda)}</TableCell>
                    <TableCell className="hidden md:table-cell" />
                    <TableCell className="text-right tabular-nums">{inteiro(t.atendimentos)}</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(t.ticket)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.cmv, 1)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{moeda(t.teleVenda)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums text-muted-foreground xl:table-cell">{moeda(t.ecomVenda)}</TableCell>
                    <TableCell className="hidden pr-5 lg:table-cell sm:pr-6" />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </Secao>

          {colunasMix.length > 0 && (
            <Secao titulo="Taxas por grupo" icone={Layers} subtitulo="Parte de cada grupo na venda de cada vendedor (genérico, similar, G47 e todos os outros grupos do Trier)" className="mb-4">
              <div className="-mx-5 overflow-x-auto sm:-mx-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-5 sm:pl-6">Grupo</TableHead>
                      {colunasMix.map(({ v }) => (
                        <TableHead key={v.chave} className="text-right">
                          {primeiroNome(v)}
                          <span className="block font-mono text-[10px] font-normal">{v.chave}</span>
                        </TableHead>
                      ))}
                      <TableHead className="text-right">Equipe %</TableHead>
                      <TableHead className="pr-5 text-right sm:pr-6">Equipe R$</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhasMix.map((g) => {
                      const valorEquipe = mixEquipe.venda(g.codigos);
                      if (!valorEquipe && !g.destaque) return null;
                      return (
                        <TableRow key={g.chave} className={cn(g.destaque && "bg-muted/40 font-semibold")}>
                          <TableCell className="pl-5 text-sm sm:pl-6">{g.rotulo}</TableCell>
                          {colunasMix.map(({ v, m }) => (
                            <TableCell key={v.chave} className="text-right tabular-nums" title={moeda(m.venda(g.codigos))}>
                              {m.venda(g.codigos) ? pct(m.taxa(g.codigos), 1) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-right tabular-nums">{pct(mixEquipe.taxa(g.codigos), 1)}</TableCell>
                          <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{moeda(valorEquipe)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-semibold">
                      <TableCell className="pl-5 sm:pl-6">Venda do vendedor</TableCell>
                      {colunasMix.map(({ v, m }) => (
                        <TableCell key={v.chave} className="text-right tabular-nums">
                          {moedaCurta(m.total)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums">100%</TableCell>
                      <TableCell className="pr-5 text-right tabular-nums sm:pr-6">{moeda(mixEquipe.total)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Vem do relatório vendedor × grupo do Trier, que é mensal: no mês inteiro é exato; num período de dias, segue a proporção do mês de cada vendedor. Passe o mouse num número para ver o valor em R$.</p>
            </Secao>
          )}

          <div className="mb-4 grid gap-4 xl:grid-cols-2">
            <Secao titulo="Por equipe" icone={Users} subtitulo="Venda de cada equipe e a parte dela no total de televendas">
              {!porEquipe.length ? (
                <p className="text-sm text-muted-foreground">Sem venda da equipe nesse período.</p>
              ) : (
                <ol className="space-y-3">
                  {porEquipe.map((e) => (
                    <li key={e.chave} className="rounded-xl border p-3">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-heading text-sm font-semibold">{e.chave}</span>
                        <span className="text-xs text-muted-foreground">
                          {e.vendedores} {e.vendedores === 1 ? "vendedor" : "vendedores"}
                        </span>
                        <span className="ml-auto font-semibold tabular-nums">{moeda(e.venda)}</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-sky-600" style={{ width: `${(e.venda / maxEquipe) * 100}%` }} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <strong className="text-foreground tabular-nums">{t.venda ? pct((e.venda / t.venda) * 100, 1) : "—"}</strong> do televendas
                        </span>
                        <span className="tabular-nums">{inteiro(e.atendimentos)} atend.</span>
                        <span className="tabular-nums">ticket {moeda(e.ticket)}</span>
                        <span className="tabular-nums">CMV {pct(e.cmv, 1)}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </Secao>

            <Secao titulo="Onde a venda foi lançada" icone={Store} subtitulo="Filial do Trier em que cada venda da equipe foi lançada (o sistema tira essa venda da filial e põe no Televendas)" acao={<Link href={`/vendas/filiais?${linkPeriodo}`} className="text-xs font-medium underline">ranking das lojas</Link>}>
              {!porLoja.length ? (
                <p className="text-sm text-muted-foreground">Sem venda da equipe nesse período.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right">Venda R$</TableHead>
                      <TableHead className="text-right">Nº atend.</TableHead>
                      <TableHead className="text-right">% do televendas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {porLoja.map((l) => (
                      <TableRow key={l.chave}>
                        <TableCell>
                          <span className="font-mono text-xs">{l.linhas[0].codigo}</span> <span className="text-sm">{l.linhas[0].loja}</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{moeda(l.venda)}</TableCell>
                        <TableCell className="text-right tabular-nums">{inteiro(l.atendimentos)}</TableCell>
                        <TableCell className="text-right tabular-nums">{t.venda ? pct((l.venda / t.venda) * 100, 1) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Secao>
          </div>
        </>
      )}

      <Secao titulo="Equipe de televendas" icone={Headset} subtitulo="Quem conta como televendas, pelo código do vendedor no Trier. A venda dessas pessoas em qualquer filial sai da filial e entra aqui.">
        {equipe.length > 0 && (
          <ul className="mb-4 divide-y rounded-xl border">
            {equipe.map((v) => (
              <li key={v.vendedor_codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="w-16 font-mono text-xs text-muted-foreground">{v.vendedor_codigo}</span>
                <span className="font-medium">{v.nome}</span>
                <span className="text-xs text-muted-foreground">
                  {v.equipe}
                  {v.funcao ? ` · ${v.funcao}` : ""}
                </span>
                {admin && (
                  <span className="ml-auto">
                    <ConfirmarAcao
                      titulo="Tirar da equipe de televendas?"
                      descricao={`${v.nome} sai do televendas e as vendas dele voltam a contar na filial onde foram lançadas.`}
                      rotuloBotao="Tirar"
                      rotuloConfirmar="Tirar da equipe"
                      action={tirarVendedorTele}
                      campos={{ vendedor_codigo: String(v.vendedor_codigo) }}
                    />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {admin ? <EquipeTeleForm action={salvarVendedorTele} equipes={equipes} /> : <p className="text-xs text-muted-foreground">Só o administrador inclui ou tira vendedores da equipe.</p>}
      </Secao>
    </>
  );
}
