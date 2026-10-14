import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { competenciaAtual, competenciaValida } from "@/lib/rh/competencia";
import { importarPlanilhaRh } from "./actions";
import { ImportarRhForm } from "./importar-form";

export const metadata = { title: "Importar planilha do RH" };

export default async function ImportarPlanilhaRhPage({ searchParams }: PageProps<"/rh/lancamentos/importar">) {
  const [, sp] = await Promise.all([exigirAcesso("/rh/lancamentos/importar"), searchParams]);
  const pedido = typeof sp.competencia === "string" ? sp.competencia : undefined;
  const competencia = competenciaValida(pedido) ? pedido : competenciaAtual();
  return (
    <>
      <PageHeader
        eyebrow="Recursos Humanos"
        titulo="Importar planilha do RH"
        descricao="Traz para os lançamentos do mês o que já foi preenchido na planilha do Google (extras, adicional noturno, faltas, reembolsos e quebra de caixa). Serve para a transição: daqui pra frente dá para lançar direto no sistema."
        acoes={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/rh/lancamentos?competencia=${competencia}`} />}>
            <ChevronLeft data-icon="inline-start" />
            Lançamentos
          </Button>
        }
      />
      <ImportarRhForm action={importarPlanilhaRh} competencia={competencia} />
    </>
  );
}
