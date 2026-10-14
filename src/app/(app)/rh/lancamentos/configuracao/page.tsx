import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { carregarEventos, carregarFiliais } from "@/lib/data/lancamentos-folha";
import { competenciaAtual } from "@/lib/rh/competencia";
import { nomeArquivoDominio } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";
import { salvarEmpresasDominio, salvarEventos } from "./actions";
import { EmpresasForm, EventosForm, type CnpjConfig } from "./formularios";

export const metadata = { title: "Configurar lançamentos da folha" };

export default async function ConfiguracaoLancamentosPage() {
  await exigirAcesso("/rh/lancamentos/configuracao");
  const supabase = await createClient();
  const [eventos, filiais, { data: emps, error }] = await Promise.all([
    carregarEventos(supabase),
    carregarFiliais(supabase),
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
      razaoPlanilha: f.razaoSocialPlanilha,
      razaoCadastro: f.razaoSocialCadastro,
      funcionarios: qtd.get(f.id) ?? 0,
    });
    porEmpresa.set(f.empresa, lista);
  }
  const grupos = [...porEmpresa.entries()]
    .map(([empresa, lista]) => ({ empresa, filiais: lista }))
    .sort((a, b) => b.filiais.reduce((s, f) => s + f.funcionarios, 0) - a.filiais.reduce((s, f) => s + f.funcionarios, 0));

  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Configurar lançamentos da folha"
        descricao="Os eventos viram as colunas da planilha da contabilidade, na ordem abaixo. Cada CNPJ precisa do código da empresa na Domínio (o “Codigo Empresa” do cabeçalho; a filial /0032 é 801)."
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
          Os códigos vieram da planilha da contabilidade de setembro. “Horas Extras 75%” aparece na planilha do RH, mas não tinha coluna no modelo: peça o código à contabilidade e marque “Na planilha”.
        </p>
        <EventosForm action={salvarEventos} eventos={eventos} />
      </section>
      <section className="rounded-xl border bg-card p-5">
        <h2 className="mb-1 text-sm font-semibold">Empresas na Domínio (um código por CNPJ)</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          O arquivo sai com o número da filial no CNPJ e o mês (ex.: 30.598.529/<strong>0032</strong>-16 → “32 SETEMBRO.xls”). A razão social em branco usa a do cadastro da filial.
        </p>
        <EmpresasForm action={salvarEmpresasDominio} grupos={grupos} />
      </section>
    </>
  );
}
