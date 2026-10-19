import Link from "next/link";
import { Plus, Search, UserRoundCog, UsersRound, FileSpreadsheet } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { filiaisDoTrier } from "@/lib/caixa/coleta";
import { movimentadoDoCaixa, TOLERANCIA_CAIXA } from "@/lib/caixa/diferencas";
import { COR_SITUACAO, FILTROS_SITUACAO, ROTULO_CURTO, situacaoDoCaixa, textoDiferenca } from "@/lib/caixa/rotulos";
import { coletasDoPeriodo, funcionariosDoCaixa, lerFiltrosCaixa, listarCaixas, resumoCaixas, TAMANHO_PAGINA_CAIXA } from "@/lib/data/diferenca-caixa";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { buscarDoTrier } from "./actions";
import { BuscaTrier } from "./busca-trier";

export const metadata = { title: "Diferença de caixa" };
// a busca no Trier roda dentro da ação desta página: precisa do tempo máximo da função
export const maxDuration = 300;

export default async function DiferencaCaixaPage({ searchParams }: PageProps<"/financeiro/diferenca-caixa">) {
  const [, sp] = await Promise.all([exigirAcesso("/financeiro/diferenca-caixa"), searchParams]);
  const f = lerFiltrosCaixa(sp);
  const supabase = await createClient();
  const [filiais, resultado, resumo, coletas, funcionarios] = await Promise.all([filiaisDoTrier(supabase), listarCaixas(f), resumoCaixas(f), coletasDoPeriodo(f.de, f.ate), funcionariosDoCaixa()]);
  const nomeFuncionario = new Map(funcionarios.map((x) => [x.id, x.nome]));
  const params = { de: f.de, ate: f.ate, filial: f.filial ?? undefined, situacao: f.situacao || undefined, q: f.q ?? undefined };
  const filtroUrl = (extra: Record<string, string>) => `/financeiro/diferenca-caixa?${new URLSearchParams({ de: f.de, ate: f.ate, ...(f.filial ? { filial: f.filial } : {}), ...extra })}`;
  const errosColeta = coletas.filter((c) => c.status === "erro");
  const lojasLidas = new Set(coletas.filter((c) => c.status === "ok").map((c) => `${c.dia}|${c.filial?.codigo}`)).size;

  const cartoes = [
    { rotulo: "Caixas no período", valor: String(resumo.caixas), classe: "text-foreground", href: filtroUrl({}) },
    { rotulo: "Quebras (acima de R$ 2,00)", valor: String(resumo.quebras), classe: "text-red-700", href: filtroUrl({ situacao: "quebras" }) },
    { rotulo: "Aguardando justificativa", valor: String(resumo.pendentes), classe: "text-amber-700", href: filtroUrl({ situacao: "pendente" }) },
    { rotulo: "Justificadas p/ decidir", valor: String(resumo.justificadas), classe: "text-violet-700", href: filtroUrl({ situacao: "justificada" }) },
    { rotulo: "Faltas (quebras)", valor: formatarMoeda(resumo.totalFalta), classe: "text-red-700", href: filtroUrl({ situacao: "quebras" }) },
    { rotulo: "Sobras (quebras)", valor: formatarMoeda(resumo.totalSobra), classe: "text-sky-700", href: filtroUrl({ situacao: "quebras" }) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="Diferença de caixa"
        descricao={`Declarado × movimentado de cada caixa, lido do Trier (Relatório de Diferenças de Caixa). Até ${formatarMoeda(TOLERANCIA_CAIXA)} é tolerância e só aparece aqui; acima vira quebra: entra no desconto da folha e vai para o gestor da loja justificar (o colaborador só vê).`}
        acoes={
          <>
            <Button size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa/nova" />}>
              <Plus data-icon="inline-start" />
              Lançar quebra manual
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa/importar" />}>
              <FileSpreadsheet data-icon="inline-start" />
              Importar planilha POS
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa/gestores" />}>
              <UsersRound data-icon="inline-start" />
              Gestores das lojas
            </Button>
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa/operadores" />}>
              <UserRoundCog data-icon="inline-start" />
              Operadores × funcionários
            </Button>
          </>
        }
      />

      <section aria-labelledby="t-busca" className="mb-4 rounded-xl border bg-card p-4">
        <h2 id="t-busca" className="mb-3 text-sm font-semibold">
          Buscar os caixas no Trier
        </h2>
        <BuscaTrier action={buscarDoTrier} filiais={filiais} de={f.ate} ate={f.ate} />
        <p className="mt-2 text-xs text-muted-foreground">
          No período filtrado: {lojasLidas} loja(s) × dia lidas
          {errosColeta.length > 0 && (
            <span className="text-red-800">
              {" "}
              · {errosColeta.length} com erro (
              {errosColeta
                .slice(0, 4)
                .map((c) => `${c.filial?.codigo} ${formatarData(c.dia)}`)
                .join(", ")}
              {errosColeta.length > 4 ? "…" : ""})
            </span>
          )}
          .
        </p>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {cartoes.map((c) => (
          <Link key={c.rotulo} href={c.href} className="rounded-xl border bg-card p-4 hover:border-primary/40">
            <span className="block rotulo">{c.rotulo}</span>
            <span className={`mt-1 block numero-sm ${c.classe}`}>{c.valor}</span>
          </Link>
        ))}
      </section>
      {resumo.semFuncionario > 0 && (
        <p className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {resumo.semFuncionario} quebra(s) de operador ainda sem funcionário ligado: não vão para a folha nem para ninguém justificar até você ligar em{" "}
          <Link href="/financeiro/diferenca-caixa/operadores" className="font-medium underline">
            Operadores × funcionários
          </Link>
          .
        </p>
      )}

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 md:grid-cols-2 lg:grid-cols-[auto_auto_1fr_1fr_1fr_auto] lg:items-center">
        <Input name="de" type="date" defaultValue={f.de} aria-label="De" className="lg:w-40" />
        <Input name="ate" type="date" defaultValue={f.ate} aria-label="Até" className="lg:w-40" />
        <SelectNativo name="filial" defaultValue={f.filial ?? ""} aria-label="Filial">
          <option value="">Todas as lojas</option>
          {filiais.map((x) => (
            <option key={x.id} value={x.id}>
              {x.codigo} — {x.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="situacao" defaultValue={f.situacao} aria-label="Situação">
          {FILTROS_SITUACAO.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.rotulo}
            </option>
          ))}
        </SelectNativo>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input name="q" defaultValue={f.q ?? ""} placeholder="Operador ou nº do caixa" aria-label="Operador ou número do caixa" className="pl-8" />
        </div>
        <Button type="submit" variant="outline">
          Filtrar
        </Button>
      </form>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead>Caixa</TableHead>
              <TableHead>Operador</TableHead>
              <TableHead className="text-right">Declarado</TableHead>
              <TableHead className="hidden text-right md:table-cell">Movimentado</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultado.itens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="vazio">
                  Nenhum caixa nesse filtro. Use “Buscar do Trier” para ler o período.
                </TableCell>
              </TableRow>
            ) : (
              resultado.itens.map((c) => {
                const st = situacaoDoCaixa(c.classe, c.andamento);
                const dif = Number(c.diferenca);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{formatarData(c.dia)}</TableCell>
                    <TableCell className="font-mono text-xs text-fct-tinta">{c.filial?.codigo ?? "—"}</TableCell>
                    <TableCell>
                      <Link href={`/financeiro/diferenca-caixa/${c.id}`} className="font-mono font-semibold text-fct-tinta hover:underline">
                        {c.origem === "manual" ? "manual" : c.numero_caixa}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block">{c.nome_operador}</span>
                      {c.origem === "manual" ? (
                        <span className="block max-w-72 truncate text-xs text-muted-foreground" title={c.descricao ?? ""}>
                          lançada à mão{c.descricao ? ` · ${c.descricao}` : ""}
                        </span>
                      ) : (
                        <span className={`block text-xs ${c.employee_id ? "text-muted-foreground" : "text-amber-800"}`}>
                          {c.employee_id ? (nomeFuncionario.get(c.employee_id) ?? "funcionário ligado") : "sem funcionário ligado"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.origem === "manual" ? "—" : formatarMoeda(Number(c.informado))}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {c.origem === "manual" ? "—" : formatarMoeda(movimentadoDoCaixa({ informadoDinheiro: Number(c.informado), calculadoDinheiro: dif }))}
                    </TableCell>
                    <TableCell className={`text-right font-medium whitespace-nowrap tabular-nums ${c.classe === "quebra" ? (dif > 0 ? "text-red-700" : "text-sky-700") : "text-muted-foreground"}`}>
                      {textoDiferenca(dif)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${COR_SITUACAO[st]}`}>{ROTULO_CURTO[st]}</span>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <Paginacao pagina={resultado.pagina} paginas={resultado.paginas} total={resultado.total} tamanho={TAMANHO_PAGINA_CAIXA} params={params} />
        </div>
      </div>
    </>
  );
}
