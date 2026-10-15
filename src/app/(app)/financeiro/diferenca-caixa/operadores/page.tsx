import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Paginacao } from "@/components/layout/paginacao";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { exigirAcesso } from "@/lib/auth/session";
import { sugerirFuncionario } from "@/lib/caixa/vinculo";
import { funcionariosDoCaixa, listarOperadores, type FuncionarioCaixa } from "@/lib/data/diferenca-caixa";
import { formatarData } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { vincularOperador } from "../actions";
import { VinculoForm, type GrupoFuncionarios } from "./vinculo-form";

export const metadata = { title: "Operadores do caixa" };

const POR_PAGINA = 30;

export default async function OperadoresPage({ searchParams }: PageProps<"/financeiro/diferenca-caixa/operadores">) {
  const [, sp] = await Promise.all([exigirAcesso("/financeiro/diferenca-caixa"), searchParams]);
  const mostrar = sp.mostrar === "todos" ? "todos" : sp.mostrar === "ligados" ? "ligados" : "sem";
  const todasFiliais = sp.todas === "1";
  const pagina = Math.max(1, Number.parseInt(typeof sp.pagina === "string" ? sp.pagina : "1", 10) || 1);
  const supabase = await createClient();
  const [operadores, funcionarios, { data: lojas }] = await Promise.all([listarOperadores(), funcionariosDoCaixa(), supabase.from("branches").select("id, codigo")]);
  const codigoLoja = new Map((lojas ?? []).map((b) => [b.id, b.codigo]));
  const porId = new Map(funcionarios.map((f) => [f.id, f]));
  const ativos = funcionarios.filter((f) => f.status !== "desligado");

  const filtrados = operadores.filter((o) => (mostrar === "sem" ? !o.employee_id : mostrar === "ligados" ? !!o.employee_id : true));
  const total = filtrados.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pedaco = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const semFuncionario = operadores.filter((o) => !o.employee_id).length;

  const rotulo = (f: FuncionarioCaixa) => `${f.nome}${f.matricula ? ` · mat. ${f.matricula}` : ""}${f.cargo ? ` · ${f.cargo}` : ""}${f.status === "desligado" ? " (desligado)" : ""}`;
  const gruposPara = (filiais: string[], atual: string | null): GrupoFuncionarios[] => {
    const daLoja = ativos.filter((f) => filiais.includes(f.branch_id));
    const grupos: GrupoFuncionarios[] = [];
    for (const id of filiais) {
      const lista = daLoja.filter((f) => f.branch_id === id);
      if (lista.length) grupos.push({ titulo: `Loja ${codigoLoja.get(id) ?? ""}`, opcoes: lista.map((f) => ({ id: f.id, rotulo: rotulo(f) })) });
    }
    if (todasFiliais) {
      const outros = ativos.filter((f) => !filiais.includes(f.branch_id));
      if (outros.length) grupos.push({ titulo: "Outras lojas", opcoes: outros.map((f) => ({ id: f.id, rotulo: `${rotulo(f)} — ${f.filial}` })) });
    }
    // o já ligado sempre aparece (mesmo desligado ou de outra loja)
    if (atual && !grupos.some((g) => g.opcoes.some((o) => o.id === atual))) {
      const f = porId.get(atual);
      if (f) grupos.unshift({ titulo: "Ligado hoje", opcoes: [{ id: f.id, rotulo: `${rotulo(f)} — ${f.filial}` }] });
    }
    return grupos;
  };
  const link = (extra: Record<string, string>) => `/financeiro/diferenca-caixa/operadores?${new URLSearchParams({ mostrar, ...(todasFiliais ? { todas: "1" } : {}), ...extra })}`;

  return (
    <>
      <PageHeader
        eyebrow="Diferença de caixa"
        titulo="Operadores × funcionários"
        descricao="O Trier identifica o caixa pelo operador (código e nome curto). Ligue cada operador ao funcionário do cadastro: é assim que a quebra vai para a folha certa e aparece para a pessoa justificar. A sugestão vem pelo nome, mas só vale depois de confirmar."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/diferenca-caixa" />}>
            <ChevronLeft data-icon="inline-start" />
            Diferença de caixa
          </Button>
        }
      />

      <nav aria-label="Filtro" className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {[
          { v: "sem", r: `Sem funcionário (${semFuncionario})` },
          { v: "ligados", r: `Ligados (${operadores.length - semFuncionario})` },
          { v: "todos", r: `Todos (${operadores.length})` },
        ].map((x) => (
          <Link
            key={x.v}
            href={`/financeiro/diferenca-caixa/operadores?${new URLSearchParams({ mostrar: x.v, ...(todasFiliais ? { todas: "1" } : {}) })}`}
            aria-current={mostrar === x.v ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${mostrar === x.v ? "border-fct-navy bg-fct-navy text-white" : "bg-card hover:border-fct-navy/40"}`}
          >
            {x.r}
          </Link>
        ))}
        <Link href={link(todasFiliais ? {} : { todas: "1" })} className="ml-auto text-fct-navy underline">
          {todasFiliais ? "Mostrar só funcionários das lojas do operador" : "Incluir funcionários de todas as lojas na lista"}
        </Link>
      </nav>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operador no Trier</TableHead>
              <TableHead>Lojas</TableHead>
              <TableHead className="text-right">Caixas</TableHead>
              <TableHead className="text-right">Quebras</TableHead>
              <TableHead>Funcionário</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pedaco.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  {operadores.length === 0 ? "Nenhum operador ainda: busque os caixas no Trier primeiro." : "Nenhum operador nesse filtro."}
                </TableCell>
              </TableRow>
            ) : (
              pedaco.map((o) => {
                const filiais = o.filiais ?? [];
                const candidatos = ativos.filter((f) => filiais.includes(f.branch_id));
                const sugestao = o.employee_id ? null : sugerirFuncionario(o.nome_trier ?? "", candidatos);
                return (
                  <TableRow key={o.cod_operador}>
                    <TableCell>
                      <span className="block font-medium">{o.nome_trier}</span>
                      <span className="block text-xs text-muted-foreground">
                        cód. {o.cod_operador} · visto em {formatarData(o.ultimo_dia)}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{filiais.map((id) => codigoLoja.get(id)).filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{o.caixas ?? 0}</TableCell>
                    <TableCell className={`text-right tabular-nums ${(o.quebras_sem_funcionario ?? 0) > 0 ? "font-semibold text-amber-800" : ""}`}>{o.quebras ?? 0}</TableCell>
                    <TableCell className="min-w-80">
                      <VinculoForm
                        key={`${o.cod_operador}-${o.employee_id ?? ""}`}
                        action={vincularOperador.bind(null, o.cod_operador ?? 0)}
                        atual={o.employee_id}
                        sugestao={sugestao ? { id: sugestao.id, rotulo: sugestao.nome } : null}
                        grupos={gruposPara(filiais, o.employee_id)}
                        rotulo={o.nome_trier ?? ""}
                      />
                      {sugestao && <span className="mt-1 block text-xs text-violet-800">Sugestão pelo nome: {sugestao.nome}</span>}
                      {!o.employee_id && !sugestao && candidatos.length === 0 && (
                        <span className="mt-1 block text-xs text-muted-foreground">Nenhum funcionário cadastrado nessas lojas. Use “Incluir funcionários de todas as lojas”.</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3">
          <Paginacao pagina={pagina} paginas={paginas} total={total} tamanho={POR_PAGINA} params={{ mostrar, todas: todasFiliais ? "1" : undefined }} />
        </div>
      </div>
    </>
  );
}
