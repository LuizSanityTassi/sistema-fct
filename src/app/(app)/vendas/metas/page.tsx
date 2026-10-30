import Link from "next/link";
import { Target } from "lucide-react";
import { cn } from "cn";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { chaveMetaFilial, chaveMetaVendedor, equipeTelevendas, hojeNoBrasil, MESES, mesmoDia, metasDoMes, somarDias, TELEVENDAS, ultimoDia, vendasPorFilial, vendedoresNoPeriodo } from "@/lib/data/vendas";
import { INICIO_HISTORICO } from "@/lib/vendas/coleta";
import { AbasVendas, decimal, moeda, pct } from "../comum";
import { preencherMetas, salvarMetas } from "./actions";
import { FormMetas, FormPreencher } from "./formularios";

export const metadata = { title: "Metas de venda" };

const SECOES = [
  { chave: "filiais", rotulo: "Filiais" },
  { chave: "televendas", rotulo: "Televendas" },
  { chave: "vendedores", rotulo: "Vendedores das filiais" },
] as const;
type Secao = (typeof SECOES)[number]["chave"];

const nomeMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const fimDoMes = (mes: string) => `${mes.slice(0, 7)}-${String(ultimoDia(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)))).padStart(2, "0")}`;

/** Meses do seletor: o próximo, o atual e os anteriores até o início do histórico. */
function mesesDoSeletor(atual: string) {
  const out = [mesmoDia(atual, -1)];
  for (let m = atual; m >= `${INICIO_HISTORICO.slice(0, 7)}-01`; m = mesmoDia(m, 1)) out.push(m);
  return out;
}

/** Linha da tabela de metas: referência (mês anterior), campo da meta, realizado e % atingido. */
type LinhaMeta = { chave: string; titulo: React.ReactNode; detalhe?: string; referencia: number | null; meta: number | null; realizado: number | null; foraDoTotal?: boolean };

function TabelaMetas({ linhas, rotulo, rotuloTotal = "Total", mesAnterior, temRealizado, decorrido }: { linhas: LinhaMeta[]; rotulo: string; rotuloTotal?: string; mesAnterior: string; temRealizado: boolean; decorrido: number | null }) {
  // linha que já é a soma das outras (ex.: Televendas, a loja) não entra de novo no total
  const soma = (f: (l: LinhaMeta) => number | null) => linhas.reduce((s, l) => s + (l.foraDoTotal ? 0 : (f(l) ?? 0)), 0);
  const totalMeta = soma((l) => l.meta);
  const totalReal = soma((l) => l.realizado);
  return (
    <div className="-mx-5 overflow-x-auto sm:-mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-5 sm:pl-6">{rotulo}</TableHead>
            <TableHead className="hidden text-right md:table-cell">Venda {mesAnterior}</TableHead>
            <TableHead className="w-44 text-right">Meta R$</TableHead>
            {temRealizado && <TableHead className="text-right">Realizado</TableHead>}
            {temRealizado && <TableHead className="w-40 pr-5 sm:pr-6">% da meta</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const p = l.meta && l.realizado !== null ? (l.realizado / l.meta) * 100 : null;
            const tom = p === null ? "" : p >= 100 ? "bg-emerald-500" : decorrido !== null && p >= decorrido ? "bg-sky-500" : "bg-amber-500";
            return (
              <TableRow key={l.chave}>
                <TableCell className="pl-5 sm:pl-6">
                  {l.titulo}
                  {l.detalhe && <span className="block text-[11px] text-muted-foreground">{l.detalhe}</span>}
                </TableCell>
                <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">{l.referencia ? moeda(l.referencia) : "—"}</TableCell>
                <TableCell className="text-right">
                  <input
                    name={`m|${l.chave}`}
                    defaultValue={l.meta ? decimal(l.meta, 2) : ""}
                    inputMode="decimal"
                    placeholder="sem meta"
                    aria-label={`Meta ${typeof l.titulo === "string" ? l.titulo : l.chave}`}
                    className="h-8 w-40 rounded-md border bg-background px-2 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:bg-muted/40"
                  />
                </TableCell>
                {temRealizado && <TableCell className="text-right tabular-nums">{l.realizado !== null ? moeda(l.realizado) : "—"}</TableCell>}
                {temRealizado && (
                  <TableCell className="pr-5 sm:pr-6">
                    {p === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                          <div className={cn("h-full rounded-full", tom)} style={{ width: `${Math.min(100, p)}%` }} />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums", p >= 100 && "text-emerald-700")}>{pct(p, 1)}</span>
                      </div>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter>
          <TableRow className="font-semibold">
            <TableCell className="pl-5 sm:pl-6">{rotuloTotal}</TableCell>
            <TableCell className="hidden text-right tabular-nums md:table-cell">{moeda(soma((l) => l.referencia))}</TableCell>
            <TableCell className="text-right tabular-nums">{totalMeta ? moeda(totalMeta) : "—"}</TableCell>
            {temRealizado && <TableCell className="text-right tabular-nums">{moeda(totalReal)}</TableCell>}
            {temRealizado && <TableCell className="pr-5 tabular-nums sm:pr-6">{totalMeta ? pct((totalReal / totalMeta) * 100, 1) : "—"}</TableCell>}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export default async function MetasPage({ searchParams }: PageProps<"/vendas/metas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/vendas/metas"), searchParams]);
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k] : "");
  const podeEditar = sessao.papel === "admin" || sessao.papel === "financeiro";
  const ontem = somarDias(hojeNoBrasil(), -1);
  const mesAtual = `${ontem.slice(0, 7)}-01`;
  const meses = mesesDoSeletor(mesAtual);
  const mes = meses.includes(`${s("mes")}-01`) ? `${s("mes")}-01` : mesAtual;
  const secao: Secao = SECOES.some((x) => x.chave === s("secao")) ? (s("secao") as Secao) : "filiais";
  const fim = fimDoMes(mes);
  const ateReal = fim < ontem ? fim : ontem;
  const temRealizado = mes <= ontem;
  const decorrido = temRealizado ? Math.min(100, (Number(ateReal.slice(8, 10)) / Number(fim.slice(8, 10))) * 100) : null;
  const ant = mesmoDia(mes, 1);
  const antFim = fimDoMes(ant);
  const mesAnteriorTxt = MESES[Number(ant.slice(5, 7)) - 1].toLowerCase();
  const link = (extra: Record<string, string>) => `/vendas/metas?${new URLSearchParams({ mes: mes.slice(0, 7), secao, ...extra }).toString()}`;

  const metas = await metasDoMes(mes);
  const meta = (chave: string) => metas.get(chave) ?? null;
  let linhas: LinhaMeta[] = [];
  let rotulo = "Filial";
  let rotuloTotal = "Total";
  let filialEscolhida = "";
  let filiaisDoSeletor: { id: string; texto: string }[] = [];

  if (secao === "filiais") {
    const [real, ref] = await Promise.all([temRealizado ? vendasPorFilial(mes, ateReal) : Promise.resolve([]), vendasPorFilial(ant, antFim)]);
    const realPor = new Map(real.map((l) => [l.branchId, l.venda]));
    const lojas = new Map([...ref, ...real].filter((l) => l.regional !== TELEVENDAS).map((l) => [l.branchId, l]));
    linhas = [...lojas.values()]
      .sort((a, b) => a.regional.localeCompare(b.regional) || a.codigo.localeCompare(b.codigo))
      .map((l) => ({ chave: chaveMetaFilial(l), titulo: <><span className="font-mono text-xs">{l.codigo}</span> <span className="text-sm">{l.nome}</span></>, detalhe: l.regional, referencia: ref.find((r) => r.branchId === l.branchId)?.venda ?? null, meta: meta(chaveMetaFilial(l)), realizado: temRealizado ? (realPor.get(l.branchId) ?? 0) : null }));
  } else if (secao === "televendas") {
    rotulo = "Televendas e vendedores do tele";
    rotuloTotal = "Total dos vendedores";
    const [real, ref, realV, refV, equipe] = await Promise.all([
      temRealizado ? vendasPorFilial(mes, ateReal) : Promise.resolve([]),
      vendasPorFilial(ant, antFim),
      temRealizado ? vendedoresNoPeriodo(mes, ateReal) : Promise.resolve([]),
      vendedoresNoPeriodo(ant, antFim),
      equipeTelevendas(),
    ]);
    const tele = (xs: typeof real) => xs.find((l) => l.regional === TELEVENDAS)?.venda ?? 0;
    linhas = [
      { chave: "televendas", titulo: <span className="text-sm font-semibold">Televendas (a loja)</span>, detalhe: "meta da loja · venda da equipe sem e-commerce", referencia: tele(ref), meta: meta("televendas"), realizado: temRealizado ? tele(real) : null, foraDoTotal: true },
      ...equipe.map((v) => ({
        chave: chaveMetaVendedor(v.vendedor_codigo),
        titulo: <span className="text-sm">{v.nome}</span>,
        detalhe: `${v.vendedor_codigo} · ${v.equipe}`,
        referencia: refV.find((x) => x.vendedorCodigo === v.vendedor_codigo)?.venda ?? null,
        meta: meta(chaveMetaVendedor(v.vendedor_codigo)),
        realizado: temRealizado ? (realV.find((x) => x.vendedorCodigo === v.vendedor_codigo)?.venda ?? 0) : null,
      })),
    ];
  } else {
    rotulo = "Vendedor";
    const [realV, refV] = await Promise.all([temRealizado ? vendedoresNoPeriodo(mes, ateReal) : Promise.resolve([]), vendedoresNoPeriodo(ant, antFim)]);
    // filial do vendedor = onde mais vendeu (no mês ou, sem venda ainda, no mês anterior); o tele fica na aba dele
    const todos = new Map([...refV, ...realV].filter((v) => !v.televendas).map((v) => [v.vendedorCodigo, v]));
    const lojas = new Map([...todos.values()].map((v) => [v.branchId, `${v.codigo} ${v.loja}`]));
    filiaisDoSeletor = [...lojas].map(([id, texto]) => ({ id, texto })).sort((a, b) => a.texto.localeCompare(b.texto));
    filialEscolhida = filiaisDoSeletor.some((f) => f.id === s("filial")) ? s("filial") : (filiaisDoSeletor[0]?.id ?? "");
    linhas = [...todos.values()]
      .filter((v) => v.branchId === filialEscolhida)
      .sort((a, b) => (refV.find((x) => x.vendedorCodigo === b.vendedorCodigo)?.venda ?? 0) - (refV.find((x) => x.vendedorCodigo === a.vendedorCodigo)?.venda ?? 0) || a.vendedorNome.localeCompare(b.vendedorNome))
      .map((v) => ({
        chave: chaveMetaVendedor(v.vendedorCodigo),
        titulo: <span className="text-sm">{v.vendedorNome}</span>,
        detalhe: String(v.vendedorCodigo),
        referencia: refV.find((x) => x.vendedorCodigo === v.vendedorCodigo)?.venda ?? null,
        meta: meta(chaveMetaVendedor(v.vendedorCodigo)),
        realizado: temRealizado ? (realV.find((x) => x.vendedorCodigo === v.vendedorCodigo)?.venda ?? 0) : null,
      }));
  }

  return (
    <>
      <PageHeader eyebrow="Vendas" titulo="Metas de venda" descricao="Meta do mês por filial, para o televendas e por vendedor (das filiais e do tele). O realizado vem do Trier (até ontem) e aparece também no painel, na venda por filial e no televendas." />
      <AbasVendas ativa="/vendas/metas" papel={sessao.papel} />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <input type="hidden" name="secao" value={secao} />
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Mês</span>
          <SelectNativo name="mes" defaultValue={mes.slice(0, 7)} className="w-48">
            {meses.map((m) => (
              <option key={m} value={m.slice(0, 7)}>
                {nomeMes(m)}
              </option>
            ))}
          </SelectNativo>
        </label>
        {secao === "vendedores" && filiaisDoSeletor.length > 0 && (
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Filial</span>
            <SelectNativo name="filial" defaultValue={filialEscolhida} className="w-64">
              {filiaisDoSeletor.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.texto}
                </option>
              ))}
            </SelectNativo>
          </label>
        )}
        <Button type="submit">Abrir</Button>
        <nav aria-label="Metas de" className="ml-auto flex flex-wrap gap-1 rounded-lg border p-0.5 text-sm">
          {SECOES.map((x) => (
            <Link key={x.chave} href={link({ secao: x.chave })} aria-current={secao === x.chave ? "page" : undefined} className={cn("rounded-md px-3 py-1", secao === x.chave ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {x.rotulo}
            </Link>
          ))}
        </nav>
      </form>

      <section className="rounded-2xl border bg-card px-5 py-5 sm:px-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
              <Target className="size-4 text-muted-foreground" aria-hidden /> Metas de {nomeMes(mes).toLowerCase()}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {temRealizado ? `Realizado até ${ateReal.slice(8, 10)}/${ateReal.slice(5, 7)} (${decimal(decorrido ?? 0, 0)}% do mês). Barra azul = no ritmo, amarela = abaixo do ritmo, verde = meta batida.` : "Mês ainda não começou: cadastre as metas com antecedência."}
              {!podeEditar && " Só o administrador e o financeiro alteram as metas."}
            </p>
          </div>
          {podeEditar && linhas.length > 0 && <FormPreencher action={preencherMetas} mes={mes} secao={secao} filial={filialEscolhida || undefined} mesAnterior={mesAnteriorTxt} />}
        </div>
        {!linhas.length ? (
          <EstadoVazio icone={Target} titulo="Nada para cadastrar aqui" descricao={secao === "televendas" ? "Cadastre a equipe de televendas na aba Televendas." : "Sem vendas guardadas no mês nem no anterior."} />
        ) : (
          <FormMetas key={`${mes}|${secao}|${filialEscolhida}`} action={salvarMetas} mes={mes} podeEditar={podeEditar}>
            <TabelaMetas linhas={linhas} rotulo={rotulo} rotuloTotal={rotuloTotal} mesAnterior={mesAnteriorTxt} temRealizado={temRealizado} decorrido={decorrido} />
          </FormMetas>
        )}
      </section>
    </>
  );
}
