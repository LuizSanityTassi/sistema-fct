import { notFound, redirect } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { listarCategorias, listarUnidadesFinanceiro, mesFechado, obterLancamento } from "@/lib/data/financeiro";
import { podeExcluirLancamento, podeLancar } from "@/lib/financeiro/permissoes";
import { ORIGEM_FIN_LABEL } from "@/lib/financeiro/rotulos";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { rotuloCompetencia } from "@/lib/rh/competencia";
import { excluirLancamento, salvarLancamento } from "../../actions";
import { LancamentoForm } from "../../lancamento-form";

export const metadata = { title: "Editar lançamento" };

export default async function EditarLancamentoPage({ params, searchParams }: PageProps<"/financeiro/lancamentos/[id]/editar">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/financeiro/lancamentos"), params, searchParams]);
  if (!podeLancar(sessao.papel)) redirect("/financeiro/lancamentos");
  const l = await obterLancamento(id);
  if (!l) notFound();
  const competencia = l.competencia.trim();
  const [unidades, categorias, fechado] = await Promise.all([listarUnidadesFinanceiro(), listarCategorias(), mesFechado(competencia)]);
  const admin = sessao.papel === "admin";
  const bloqueado = fechado && !admin;
  const erro = typeof sp.erro === "string" ? sp.erro : null;
  const voltar = `/financeiro/lancamentos?competencia=${competencia}`;

  return (
    <>
      <PageHeader
        eyebrow="Financeiro"
        titulo={bloqueado ? "Lançamento" : "Editar lançamento"}
        descricao={`${l.unidade?.codigo ?? ""} ${l.unidade?.nome ?? ""} · ${formatarData(l.data)} · origem ${ORIGEM_FIN_LABEL[l.origem]}${l.legado_id ? ` · nº ${l.legado_id} no sistema anterior` : ""}`}
        acoes={
          podeExcluirLancamento(sessao.papel) && !bloqueado ? (
            <ConfirmarAcao
              titulo="Excluir lançamento?"
              descricao="O registro sai das somas e das telas. A auditoria guarda o que foi excluído e por quem."
              rotuloBotao="Excluir"
              rotuloConfirmar="Excluir"
              variant="destructive"
              action={excluirLancamento}
              campos={{ id: l.id }}
            />
          ) : undefined
        }
      />

      {erro && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{erro}</p>
        </div>
      )}
      {fechado && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            A competência {rotuloCompetencia(competencia)} está fechada.{" "}
            {admin ? "Como administrador, você ainda pode alterar; a mudança fica na auditoria." : "Somente leitura: peça ao administrador para reabrir o mês."}
          </p>
        </div>
      )}

      <LancamentoForm
        action={salvarLancamento.bind(null, l.id)}
        unidades={unidades.filter((u) => u.ativo || u.id === l.branch_id)}
        categorias={categorias}
        valores={{ branch_id: l.branch_id, tipo: l.tipo, categoria_id: l.categoria_id, valor: l.valor, data: l.data, descricao: l.descricao }}
        voltarPara={voltar}
        somenteLeitura={bloqueado}
      />

      <p className="mt-4 text-xs text-muted-foreground">
        Registrado {l.autor?.nome ? `por ${l.autor.nome} ` : ""}em {formatarDataHora(l.created_at)}
        {l.updated_at !== l.created_at ? ` · última alteração ${formatarDataHora(l.updated_at)}` : ""}.
      </p>
    </>
  );
}
