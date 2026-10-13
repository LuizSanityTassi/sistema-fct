import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { abrirChamado } from "../actions";
import { ChamadoForm } from "../chamado-form";

export const metadata = { title: "Novo chamado" };

export default async function NovoChamadoPage() {
  const sessao = await exigirAcesso("/chamados");
  const unidades = await listarUnidadesParaSelecao();

  return (
    <>
      <PageHeader
        eyebrow="Chamados"
        titulo="Novo chamado"
        descricao="Descreva o que precisa. O chamado recebe um número e você acompanha cada atualização por aqui."
      />
      <ChamadoForm
        action={abrirChamado}
        unidades={unidades.filter((u) => u.ativo || u.id === sessao.branchId)}
        unidadePadrao={sessao.branchId}
      />
    </>
  );
}
