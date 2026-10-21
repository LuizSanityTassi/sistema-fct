import Link from "next/link";
import { BellRing, ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { CHAVE_LEMBRETE_DRE, lerLembreteDre } from "@/lib/financeiro/dre-lembrete";
import { createClient } from "@/lib/supabase/server";
import { salvarLembreteDre } from "../actions";
import { conferirPlanilhaDre, importarPlanilhaDre } from "./actions";
import { ImportarDreForm } from "./importar-form";
import { LembreteForm } from "./lembrete-form";

export const metadata = { title: "Importar DRE" };

export default async function ImportarDrePage() {
  const sessao = await exigirAcesso("/financeiro/dre");
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro" && sessao.papel !== "contador") semAcesso("/financeiro/dre/importar");
  const supabase = await createClient();
  const { data: cfg } = await supabase.from("sistema_config").select("valor").eq("chave", CHAVE_LEMBRETE_DRE).maybeSingle();
  const lembrete = lerLembreteDre(cfg?.valor);
  return (
    <>
      <PageHeader
        eyebrow="Financeiro · DRE"
        titulo="Importar a DRE do contador"
        descricao="Envie a planilha “DRE POR FILIAIS”. O sistema guarda os lançamentos de cada filial e calcula receita líquida, margem, lucro e os resumos sozinho."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/financeiro/dre" />}>
            <ChevronLeft data-icon="inline-start" />
            DRE
          </Button>
        }
      />
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
