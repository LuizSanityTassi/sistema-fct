import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { mesesParaEscolher, responderPergunta } from "@/lib/data/perguntas";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import { perguntaPorId, perguntasDoPapel } from "@/lib/perguntas/catalogo";
import type { Coluna, Valor } from "@/lib/relatorios/csv";
import { rotuloCompetencia } from "@/lib/rh/competencia";

export async function generateMetadata({ params }: PageProps<"/perguntas/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: perguntaPorId(id)?.pergunta ?? "Pergunta" };
}

function celula(valor: Valor, coluna: Coluna) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (coluna.tipo) {
    case "moeda":
      return formatarMoeda(valor);
    case "numero":
      return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    case "inteiro":
      return Number(valor).toLocaleString("pt-BR");
    case "data":
      return formatarData(String(valor));
    default:
      return String(valor);
  }
}
const alinhamento = (c: Coluna) => (c.tipo === "inteiro" || c.tipo === "numero" || c.tipo === "moeda" ? "text-right tabular-nums" : "");
const LIMITE_TELA = 500;

export default async function PerguntaPage({ params, searchParams }: PageProps<"/perguntas/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/perguntas"), params, searchParams]);
  const pergunta = perguntaPorId(id);
  if (!pergunta || !podeAcessar(sessao.papel, pergunta.rota)) notFound();
  const filtros = { mes: typeof sp.mes === "string" ? sp.mes : undefined, filial: typeof sp.filial === "string" ? sp.filial : undefined };
  const [resposta, unidades] = await Promise.all([responderPergunta(sessao, id, filtros), pergunta.parametros.includes("filial") ? listarUnidadesParaSelecao() : Promise.resolve([])]);
  if (!resposta) notFound();
  const { relatorio: r, mes, nota } = resposta;
  const query = new URLSearchParams();
  if (mes && filtros.mes) query.set("mes", mes);
  if (filtros.filial) query.set("filial", filtros.filial);
  const outras = perguntasDoPapel(sessao.papel).filter((p) => p.area === pergunta.area && p.id !== pergunta.id);
  const linhas = r.linhas.slice(0, LIMITE_TELA);
  const link = (href: unknown) => (typeof href === "string" && podeAcessar(sessao.papel, href.split("?")[0]) ? href : null);

  return (
    <>
      <PageHeader
        eyebrow={`Perguntas prontas · ${pergunta.area}`}
        titulo={pergunta.pergunta}
        descricao={pergunta.descricao}
        acoes={
          <>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/perguntas" />}>
              <ChevronLeft data-icon="inline-start" />
              Perguntas
            </Button>
            {r.linhas.length > 0 && (
              <Button size="sm" nativeButton={false} render={<a href={`/api/perguntas/${pergunta.id}?${query.toString()}`} />}>
                <Download data-icon="inline-start" />
                Baixar para o Excel
              </Button>
            )}
          </>
        }
      />

      {pergunta.parametros.length > 0 && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
          {pergunta.parametros.includes("mes") && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Mês</span>
              <SelectNativo name="mes" defaultValue={mes ?? ""} className="w-48">
                {mesesParaEscolher(mes).map((m) => (
                  <option key={m} value={m}>
                    {rotuloCompetencia(m)}
                  </option>
                ))}
              </SelectNativo>
            </label>
          )}
          {pergunta.parametros.includes("filial") && (
            <label className="grid gap-1 text-sm">
              <span className="font-medium">Unidade</span>
              <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} className="w-64">
                <option value="">Todas que você vê</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.codigo} · {u.nome}
                    {u.ativo ? "" : " (inativa)"}
                  </option>
                ))}
              </SelectNativo>
            </label>
          )}
          <Button type="submit" size="sm">
            Ver resposta
          </Button>
        </form>
      )}

      {nota && <p className="mb-3 text-sm text-muted-foreground">{nota}</p>}

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-4">
          <h2 className="text-sm font-semibold">{r.titulo}</h2>
          <p className="text-xs text-muted-foreground">
            {r.linhas.length === 1 ? "1 linha" : `${r.linhas.length.toLocaleString("pt-BR")} linhas`}
            {r.linhas.length > LIMITE_TELA ? ` · mostrando as ${LIMITE_TELA} primeiras (a planilha leva todas)` : ""}
          </p>
        </div>
        {r.linhas.length === 0 ? (
          <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">Nada para mostrar com esses filtros. Tente outro mês ou outra unidade.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {r.colunas.map((c) => (
                  <TableHead key={c.chave} className={alinhamento(c)}>
                    {c.titulo}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((l, i) => {
                const href = link(l._href);
                return (
                  <TableRow key={i}>
                    {r.colunas.map((c, j) => (
                      <TableCell key={c.chave} className={alinhamento(c)}>
                        {j === 0 && href ? (
                          <Link href={href} className="font-medium text-fct-navy hover:underline">
                            {celula(l[c.chave], c)}
                          </Link>
                        ) : (
                          celula(l[c.chave], c)
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
            {r.totais && (
              <TableFooter>
                <TableRow>
                  {r.colunas.map((c) => (
                    <TableCell key={c.chave} className={`font-semibold ${alinhamento(c)}`}>
                      {r.totais![c.chave] === undefined ? "" : celula(r.totais![c.chave], c)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </section>

      {outras.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Outras perguntas de {pergunta.area}</h2>
          <ul className="flex flex-wrap gap-2">
            {outras.map((p) => (
              <li key={p.id}>
                <Link href={`/perguntas/${p.id}`} className="inline-block rounded-full border bg-card px-3 py-1 text-sm hover:border-fct-navy/40">
                  {p.pergunta}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
