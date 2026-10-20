import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso, semAcesso } from "@/lib/auth/session";
import { conferirPlanilhaDre, importarPlanilhaDre } from "./actions";
import { ImportarDreForm } from "./importar-form";

export const metadata = { title: "Importar DRE" };

export default async function ImportarDrePage() {
  const sessao = await exigirAcesso("/financeiro/dre");
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro" && sessao.papel !== "contador") semAcesso("/financeiro/dre/importar");
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
    </>
  );
}
