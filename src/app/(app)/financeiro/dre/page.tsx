import Link from "next/link";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { anosFinanceiro, dreDoPeriodo, GRUPOS_ESCOPO, lerEscopo } from "@/lib/data/dre";
import { listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { moedaFin } from "@/lib/financeiro/formatos";
import { podeLancar } from "@/lib/financeiro/permissoes";
import { ordemGrupo } from "@/lib/financeiro/rotulos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { salvarAjusteDre, salvarSaldoDre } from "./actions";
import { DreTabela } from "./dre-tabela";

export const metadata = { title: "DRE" };

export default async function DrePage({ searchParams }: PageProps<"/financeiro/dre">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/financeiro/dre"), searchParams]);
  const escopo = lerEscopo(sp);
  const [anos, unidades, dre] = await Promise.all([anosFinanceiro(), listarUnidadesFinanceiro(), dreDoPeriodo(escopo, escopo.ano, escopo.de)]);
  const supabase = await createClient();
  const { data: ajustesRows } = await supabase
    .from("fin_dre_ajustes")
    .select("categoria_id, competencia, valor")
    .eq("grupo", escopo.grupo)
    .filter("branch_id", escopo.filial ? "eq" : "is", escopo.filial ?? null)
    .gte("competencia", `${escopo.ano}-01`)
    .lte("competencia", `${escopo.ano}-12`);
  const ajustes = Object.fromEntries((ajustesRows ?? []).map((a) => [`${a.categoria_id}|${a.competencia.trim()}`, Number(a.valor)]));
  const unidadesDoGrupo = unidades.filter((u) => escopo.grupo === "TODOS" || u.grupo === escopo.grupo);
  const gruposUnid = new Map<string, typeof unidades>();
  for (const u of unidadesDoGrupo) gruposUnid.set(u.grupo, [...(gruposUnid.get(u.grupo) ?? []), u]);
  const filialSel = escopo.filial ? unidades.find((u) => u.id === escopo.filial) : undefined;
  const podeEditar = podeLancar(sessao.papel);
  const ultimo = dre.mesesTotal[dre.mesesTotal.length - 1];

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo="DRE"
        descricao={`Demonstrativo contábil ${escopo.grupo === "TODOS" ? "do grupo" : `· ${escopo.grupo}`}${filialSel ? ` · ${filialSel.codigo} ${filialSel.nome}` : ""} · ${escopo.ano}. Receitas, custo e despesas por mês, com ajustes do contador e cadeia de caixa.`}
        acoes={
          <Button variant="outline" nativeButton={false} render={<Link href={`/financeiro/analise?grupo=${encodeURIComponent(escopo.grupo)}&ano=${escopo.ano}`} />}>
            Ranking e comparativo
          </Button>
        }
      />

      <form method="get" className="mb-4 grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2 lg:grid-cols-[auto_1fr_auto_auto_auto_auto] lg:items-center">
        <SelectNativo name="grupo" defaultValue={escopo.grupo} aria-label="Grupo" className="lg:w-44">
          {GRUPOS_ESCOPO.map((g) => (
            <option key={g} value={g}>
              {g === "TODOS" ? "Todas (grupo)" : g}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="filial" defaultValue={escopo.filial ?? ""} aria-label="Unidade">
          <option value="">Todas as unidades</option>
          {[...gruposUnid.keys()].sort(ordemGrupo).map((g) => (
            <optgroup key={g} label={g}>
              {gruposUnid.get(g)!.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} — {u.nome}
                  {u.ativo ? "" : " (inativa)"}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectNativo>
        <SelectNativo name="ano" defaultValue={escopo.ano} aria-label="Ano" className="lg:w-28">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="de" defaultValue={escopo.de ?? ""} aria-label="Totais a partir de" className="lg:w-48" title="Meses anteriores aparecem, mas não entram no total">
          <option value="">Totais desde o 1º mês</option>
          {dre.meses.map((m) => (
            <option key={m} value={m}>
              Totais a partir de {rotuloCompetencia(m)}
            </option>
          ))}
        </SelectNativo>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
        <Button type="button" variant="ghost" nativeButton={false} render={<Link href="/financeiro/dre" />}>
          Limpar
        </Button>
      </form>

      {dre.meses.length === 0 ? (
        <section className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">Sem lançamentos para este recorte em {escopo.ano}.</section>
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Receitas", moedaFin(dre.receitas.total), "text-emerald-700"],
              ["Saídas", moedaFin(dre.saidas.total), "text-red-700"],
              ["Resultado", moedaFin(dre.resultado.total), dre.resultado.total < 0 ? "text-red-700" : "text-emerald-700"],
              ["Caixa acumulado", moedaFin(ultimo ? (dre.acumulado[ultimo] ?? 0) : 0), (ultimo ? (dre.acumulado[ultimo] ?? 0) : 0) < 0 ? "text-red-700" : "text-emerald-700"],
            ].map(([r, v, t]) => (
              <div key={r} className="rounded-xl border bg-card px-4 py-3">
                <p className="rotulo">{r}</p>
                <p className={`mt-1 numero-sm ${t}`}>{v}</p>
              </div>
            ))}
          </section>
          <DreTabela dre={dre} escopo={{ grupo: escopo.grupo, filial: escopo.filial ?? "" }} podeEditar={podeEditar} salvarAjuste={salvarAjusteDre} salvarSaldo={salvarSaldoDre} ajustes={ajustes} />
        </>
      )}
    </>
  );
}
