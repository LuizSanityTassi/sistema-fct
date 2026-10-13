import Link from "next/link";
import { Download } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { gerarRelatorio, lerFiltrosRelatorio, TIPOS_RELATORIO, type TipoRelatorio } from "@/lib/data/relatorios";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { competenciaAtual, rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import type { Coluna, Valor } from "@/lib/relatorios/csv";

export const metadata = { title: "Relatórios" };

function celula(valor: Valor, coluna: Coluna) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (coluna.tipo) {
    case "moeda":
      return formatarMoeda(valor);
    case "numero":
      return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    case "data":
      return formatarData(String(valor));
    default:
      return String(valor);
  }
}

const alinhamento = (c: Coluna) => (c.tipo === "inteiro" || c.tipo === "numero" || c.tipo === "moeda" ? "text-right tabular-nums" : "");

export default async function RelatoriosPage({ searchParams }: PageProps<"/relatorios">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/relatorios"), searchParams]);
  const filtros = lerFiltrosRelatorio(sp);
  const podeFolha = sessao.papel === "admin" || sessao.papel === "rh";
  if (filtros.tipo === "folha" && !podeFolha) filtros.tipo = "funcionarios";
  const [unidades, relatorios] = await Promise.all([listarUnidadesParaSelecao(), gerarRelatorio(sessao, filtros)]);

  const tipos = (Object.keys(TIPOS_RELATORIO) as TipoRelatorio[]).filter((t) => t !== "folha" || podeFolha);
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries({ filial: filtros.filial, situacao: filtros.situacao, de: filtros.de, ate: filtros.ate, competencia: filtros.competencia })) {
    if (v) query.set(k, v);
  }
  const linkExportar = `/api/relatorios/${filtros.tipo}?${query.toString()}`;
  const competencias = [...new Set([competenciaAtual(), somarMeses(competenciaAtual(), -1), somarMeses(competenciaAtual(), -2), filtros.competencia])].sort().reverse();

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        titulo="Relatórios"
        descricao="Consolidados prontos para conferência e exportação em planilha. Cada papel vê só o que tem acesso."
        acoes={
          <Button className="bg-fct-yellow text-fct-navy hover:bg-fct-yellow/85" nativeButton={false} render={<a href={linkExportar} />}>
            <Download data-icon="inline-start" />
            Exportar CSV
          </Button>
        }
      />

      <nav aria-label="Tipo de relatório" className="mb-4 flex flex-wrap gap-2">
        {tipos.map((t) => (
          <Link
            key={t}
            href={`/relatorios?tipo=${t}`}
            aria-current={filtros.tipo === t ? "page" : undefined}
            className={`rounded-full border px-3 py-1 text-sm ${filtros.tipo === t ? "border-fct-navy bg-fct-navy text-white" : "bg-card hover:border-fct-navy/40"}`}
          >
            {TIPOS_RELATORIO[t]}
          </Link>
        ))}
      </nav>

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 lg:grid-cols-[auto_auto_auto_auto_auto_auto] lg:items-center">
        <input type="hidden" name="tipo" value={filtros.tipo} />
        <SelectNativo name="filial" defaultValue={filtros.filial ?? ""} aria-label="Unidade" className="lg:w-56">
          <option value="">Todas as unidades</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.codigo} — {u.nome}
            </option>
          ))}
        </SelectNativo>
        {filtros.tipo === "aso" && (
          <SelectNativo name="situacao" defaultValue={filtros.situacao ?? "todos"} aria-label="Situação" className="lg:w-44">
            <option value="todos">Todas as situações</option>
            <option value="vencido">Vencidos</option>
            <option value="vencendo">Vencem em 30 dias</option>
            <option value="valido">Válidos</option>
            <option value="sem_aso">Sem ASO</option>
          </SelectNativo>
        )}
        {filtros.tipo === "chamados" && (
          <>
            <Input name="de" type="date" defaultValue={filtros.de} aria-label="De" className="lg:w-40" />
            <Input name="ate" type="date" defaultValue={filtros.ate} aria-label="Até" className="lg:w-40" />
          </>
        )}
        {filtros.tipo === "folha" && (
          <SelectNativo name="competencia" defaultValue={filtros.competencia} aria-label="Competência" className="lg:w-48">
            {competencias.map((c) => (
              <option key={c} value={c}>
                {rotuloCompetencia(c)}
              </option>
            ))}
          </SelectNativo>
        )}
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href={`/relatorios?tipo=${filtros.tipo}`} />}>
          Limpar
        </Button>
      </form>

      {relatorios.map((r) => (
        <section key={r.titulo} className="mb-6 rounded-xl border bg-card">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">{r.titulo}</h2>
            <span className="text-xs text-muted-foreground">{r.linhas.length} linha(s)</span>
          </div>
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
              {r.linhas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={r.colunas.length} className="py-8 text-center text-muted-foreground">
                    Sem dados para os filtros escolhidos.
                  </TableCell>
                </TableRow>
              ) : (
                r.linhas.map((l, i) => (
                  <TableRow key={i}>
                    {r.colunas.map((c) => (
                      <TableCell key={c.chave} className={alinhamento(c)}>
                        {celula(l[c.chave], c)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
              {r.totais && r.linhas.length > 0 && (
                <TableRow className="bg-muted/50 font-semibold">
                  {r.colunas.map((c) => (
                    <TableCell key={c.chave} className={alinhamento(c)}>
                      {r.totais![c.chave] === undefined ? "" : celula(r.totais![c.chave], c)}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>
      ))}
    </>
  );
}
