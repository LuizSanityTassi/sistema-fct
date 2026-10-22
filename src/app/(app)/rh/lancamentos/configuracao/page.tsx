import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { carregarCodigosFilial, carregarEventos, carregarFiliais } from "@/lib/data/lancamentos-folha";
import { competenciaAtual } from "@/lib/rh/competencia";
import { nomeArquivoDominio, numeroFilialCnpj } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { atualizarCodigosDaContabilidade, salvarEmpresasDominio, salvarEventos } from "./actions";
import { CodigosContabilidadeForm } from "./codigos-form";
import { EmpresasForm, EventosForm, type CnpjConfig } from "./formularios";

export const metadata = { title: "Configurar lançamentos da folha" };

export default async function ConfiguracaoLancamentosPage() {
  await exigirAcesso("/rh/lancamentos/configuracao");
  const supabase = await createClient();
  const [eventos, filiais, codigosFilial, { data: emps, error }] = await Promise.all([
    carregarEventos(supabase),
    carregarFiliais(supabase),
    carregarCodigosFilial(supabase),
    supabase.from("employees").select("branch_id").neq("status", "desligado"),
  ]);
  if (error) throw new Error(error.message);
  const qtd = new Map<string, number>();
  for (const e of emps) if (e.branch_id) qtd.set(e.branch_id, (qtd.get(e.branch_id) ?? 0) + 1);
  const competencia = competenciaAtual();

  const porEmpresa = new Map<string, CnpjConfig[]>();
  for (const f of filiais) {
    if (!f.cnpj || (!f.ativo && !qtd.get(f.id))) continue;
    const lista = porEmpresa.get(f.empresa) ?? [];
    lista.push({
      id: f.id,
      codigo: f.codigo,
      nome: f.nome,
      cnpj: f.cnpj,
      arquivo: nomeArquivoDominio(f.cnpj, competencia, f.codigo),
      codigoDominio: f.codigoDominio,
      provisorio: numeroFilialCnpj(f.cnpj) ? Number(numeroFilialCnpj(f.cnpj)) : null,
      razaoPlanilha: f.razaoSocialPlanilha,
      razaoCadastro: f.razaoSocialCadastro,
      funcionarios: qtd.get(f.id) ?? 0,
    });
    porEmpresa.set(f.empresa, lista);
  }
  // códigos por filial: uma linha por CNPJ com códigos próprios, uma coluna por evento (o código daquele CNPJ)
  const eventoDe = new Map(eventos.map((e) => [e.id, e]));
  const comCodigos = filiais.filter((f) => codigosFilial.has(f.id));
  const eventosNaGrade = eventos.filter((e) => comCodigos.some((f) => codigosFilial.get(f.id)!.some((c) => c.eventoId === e.id)));

  const grupos = [...porEmpresa.entries()]
    .map(([empresa, lista]) => ({ empresa, filiais: lista }))
    .sort((a, b) => b.filiais.reduce((s, f) => s + f.funcionarios, 0) - a.filiais.reduce((s, f) => s + f.funcionarios, 0));

  return (
    <>
      <PageHeader
        eyebrow="Pessoas"
        titulo="Configurar lançamentos da folha"
        descricao="Os eventos viram as colunas da planilha da contabilidade, na ordem abaixo. O “Codigo Empresa” do cabeçalho é o código da empresa na Domínio (a filial /0032 é 801). Enquanto não for informado, a planilha sai com o número da filial no CNPJ (provisório)."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/rh/lancamentos" />}>
            <ChevronLeft data-icon="inline-start" />
            Lançamentos
          </Button>
        }
      />
      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Eventos (colunas da planilha)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Códigos gerais: valem para os CNPJs que não têm códigos próprios em “Códigos da Domínio por filial” (abaixo). “Horas Extras 75%” aparece na planilha do RH, mas não tinha coluna no modelo: peça o código à contabilidade e marque “Na planilha”.
        </p>
        <EventosForm action={salvarEventos} eventos={eventos} />
      </section>
      <section className="mb-6 rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Códigos da Domínio por filial</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Na Domínio cada CNPJ tem os seus códigos de evento (o “Feriado trabalhado” é 259 numa filial, 261 noutra, 202 noutra) e a sua ordem de colunas. A planilha de cada filial abaixo sai com os códigos e a ordem dela; filial que não está aqui usa os códigos
          gerais dos eventos. Quando a contabilidade mudar algum código, suba de novo as planilhas que ela devolve: o sistema copia só os códigos (empresa, eventos e funcionários) — os valores das planilhas não entram e funcionário que já mudou de
          filial no sistema fica onde está.
        </p>
        <CodigosContabilidadeForm action={atualizarCodigosDaContabilidade} />
        {comCodigos.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-max text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    Filial
                  </th>
                  <th scope="col" className="px-2 py-1.5 text-right font-medium">
                    Empresa
                  </th>
                  {eventosNaGrade.map((e) => (
                    <th key={e.id} scope="col" className="px-2 py-1.5 text-right font-medium" title={`Código geral: ${e.codigo ?? "—"}`}>
                      {e.nome}
                    </th>
                  ))}
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">
                    Colunas sem evento
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comCodigos.map((f) => {
                  const cols = codigosFilial.get(f.id)!;
                  return (
                    <tr key={f.id}>
                      <th scope="row" className="px-2 py-1 text-left font-normal whitespace-nowrap">
                        <span className="font-mono">{f.codigo}</span> <span className="text-muted-foreground">{f.nome}</span>
                      </th>
                      <td className="px-2 py-1 text-right tabular-nums">{f.codigoDominio ?? "—"}</td>
                      {eventosNaGrade.map((e) => {
                        const c = cols.find((x) => x.eventoId === e.id);
                        const diferente = c && eventoDe.get(e.id)?.codigo !== c.codigo;
                        return (
                          <td key={e.id} className={`px-2 py-1 text-right tabular-nums ${diferente ? "font-semibold text-amber-800 dark:text-amber-300" : ""}`} title={c ? `coluna ${c.coluna}: ${c.rotulo}` : "não tem esta coluna"}>
                            {c ? c.codigo : <span className="text-muted-foreground">—</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-muted-foreground">
                        {cols
                          .filter((c) => !c.eventoId)
                          .map((c) => `${c.rotulo} (${c.codigo})`)
                          .join(", ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {comCodigos.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Em destaque: código diferente do código geral do evento. Passe o mouse para ver a coluna e o rótulo da planilha da contabilidade.</p>}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Empresas na Domínio (um código por CNPJ)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O arquivo sai com o número da filial no CNPJ e o mês (ex.: 30.598.529/<strong>0032</strong>-16 → “32 SETEMBRO.xls”). Código em branco = provisório (número da filial no CNPJ). Razão social em branco usa a do cadastro da filial.
        </p>
        <EmpresasForm action={salvarEmpresasDominio} grupos={grupos} />
      </section>
    </>
  );
}
