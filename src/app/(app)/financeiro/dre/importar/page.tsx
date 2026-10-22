import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { empresasDre } from "@/lib/data/dre-contabil";
import { CHAVE_LEMBRETE_DRE, lerLembreteDre, mesesAtrasadosDre } from "@/lib/financeiro/dre-lembrete";
import { rotuloCompetencia, somarMeses } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { salvarLembreteDre } from "../actions";
import { AbasDre } from "../comum";
import { conferirPlanilhaDre, importarPlanilhaDre } from "./actions";
import { ImportarDreForm } from "./importar-form";
import { LembreteForm } from "./lembrete-form";

export const metadata = { title: "Importar novo mês · DRE" };

const hojeBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

/** Aba "Importar novo mês" da DRE: todo mês o contador sobe a planilha DRE POR FILIAIS e grava só o mês novo. */
export default async function ImportarDrePage() {
  const sessao = await exigirAcesso("/financeiro/dre");
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro" && sessao.papel !== "contador") semAcesso("/financeiro/dre/importar");
  const supabase = await createClient();
  const [{ data: cfg }, empresas] = await Promise.all([supabase.from("sistema_config").select("valor").eq("chave", CHAVE_LEMBRETE_DRE).maybeSingle(), empresasDre()]);
  const lembrete = lerLembreteDre(cfg?.valor);
  const hoje = hojeBrasil();

  return (
    <>
      <PageHeader
        eyebrow="Financeiro · DRE"
        titulo="Importar novo mês"
        descricao="Todo mês o contador envia aqui a planilha “DRE POR FILIAIS” de cada empresa. Confira e importe só o mês novo: o sistema guarda os lançamentos de cada filial e calcula receita líquida, margem, lucro e os resumos sozinho."
      />
      <AbasDre ativa="importar" podeImportar />

      {empresas.length > 0 && (
        <section aria-label="Situação por empresa" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {empresas.map((e) => {
            const ultimo = e.meses[0];
            const atrasados = mesesAtrasadosDre(e.meses, hoje, lembrete);
            return (
              <div key={e.empresa} className={`rounded-xl border p-4 ${atrasados.length ? "border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10" : "bg-card"}`}>
                <p className="rotulo">{e.empresa}</p>
                <p className="mt-1 text-sm">
                  Último mês importado: <span className="font-semibold">{rotuloCompetencia(ultimo)}</span>
                </p>
                <p className={`text-xs ${atrasados.length ? "font-medium text-amber-900 dark:text-amber-200" : "text-muted-foreground"}`}>
                  {atrasados.length
                    ? `Falta importar: ${atrasados.map(rotuloCompetencia).join(", ")}`
                    : `Próximo: ${rotuloCompetencia(somarMeses(ultimo, 1))}`}
                </p>
              </div>
            );
          })}
        </section>
      )}

      <ImportarDreForm conferir={conferirPlanilhaDre} importar={importarPlanilhaDre} />

      <section aria-labelledby="t-lembrete" className="mt-6 rounded-xl border bg-card p-5">
        <h2 id="t-lembrete" className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-muted-foreground" aria-hidden />
          Lembrete no sino
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          A DRE de um mês chega no mês seguinte. A partir do dia escolhido, se a do mês anterior ainda não tiver sido importada para alguma empresa, o sino avisa o Administrador, o Financeiro e o Contador.
          {sessao.papel === "contador" && " Só o Administrador e o Financeiro mudam esta configuração."}
        </p>
        <LembreteForm action={salvarLembreteDre} config={lembrete} podeEditar={sessao.papel === "admin" || sessao.papel === "financeiro"} />
      </section>
    </>
  );
}
