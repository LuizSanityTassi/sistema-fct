import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarUnidadesParaSelecao } from "@/lib/data/funcionarios";
import { solicitarAcesso } from "../actions";
import { AcessoForm } from "../acesso-form";

export const metadata = { title: "Solicitar acesso" };

export default async function SolicitarAcessoPage() {
  const sessao = await exigirAcesso("/ti/acessos");
  const unidades = await listarUnidadesParaSelecao();

  return (
    <>
      <PageHeader
        eyebrow="TI"
        titulo="Solicitar acesso a um sistema"
        descricao="Vira um chamado de TI com as informações padronizadas. Você acompanha a resposta em Chamados."
      />
      <AcessoForm
        action={solicitarAcesso}
        unidades={unidades.filter((u) => u.ativo || u.id === sessao.branchId)}
        unidadePadrao={sessao.branchId}
        nomePadrao={sessao.nome}
      />
    </>
  );
}
