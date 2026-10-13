import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoy, Pencil } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { obterAtivo } from "@/lib/data/ti";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { TIPO_ATIVO_LABEL, TIPOS_ATIVO } from "@/lib/ti/rotulos";
import { alterarStatusAtivo } from "../actions";
import { BadgeAtivo } from "../badge-ativo";

export async function generateMetadata({ params }: PageProps<"/ti/ativos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const a = await obterAtivo(id);
  return { title: a ? a.descricao : "Ativo" };
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{rotulo}</dt>
      <dd className={`mt-0.5 text-sm ${mono ? "font-mono" : ""}`}>{valor || "—"}</dd>
    </div>
  );
}

export default async function AtivoPage({ params, searchParams }: PageProps<"/ti/ativos/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/ti/ativos"), params, searchParams]);
  const a = await obterAtivo(id);
  if (!a) notFound();
  const podeEditar = sessao.papel === "admin" || sessao.papel === "ti";
  const tipo = TIPOS_ATIVO.find((t) => t.codigo === a.tipo);
  const tituloChamado = encodeURIComponent(`${a.descricao}${a.patrimonio ? ` (patrimônio ${a.patrimonio})` : ""}: `);

  return (
    <>
      <PageHeader
        eyebrow={[TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo, a.unidade ? `${a.unidade.codigo} · ${a.unidade.nome}` : null].filter(Boolean).join(" · ")}
        titulo={a.descricao}
        descricao={a.patrimonio ? `Patrimônio ${a.patrimonio}` : undefined}
        acoes={
          <>
            <BadgeAtivo status={a.status} />
            <Button variant="outline" nativeButton={false} render={<Link href={`/chamados/novo?titulo=${tituloChamado}&categoria=ti&filial=${a.branch_id}`} />}>
              <LifeBuoy data-icon="inline-start" />
              Abrir chamado
            </Button>
            {podeEditar && (
              <Button variant="outline" nativeButton={false} render={<Link href={`/ti/ativos/${a.id}/editar`} />}>
                <Pencil data-icon="inline-start" />
                Editar
              </Button>
            )}
          </>
        }
      />

      {sp.salvo === "1" && (
        <div className="mb-6">
          <AvisoSucesso mensagem="Ativo salvo." />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Dados do equipamento</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Dado rotulo="Tipo" valor={TIPO_ATIVO_LABEL[a.tipo] ?? a.tipo} />
            <Dado rotulo="Marca / modelo" valor={a.descricao} />
            <Dado rotulo="Patrimônio" valor={a.patrimonio} mono />
            <Dado rotulo="Número de série" valor={a.numero_serie} mono />
            <Dado rotulo="Unidade" valor={a.unidade ? `${a.unidade.codigo} — ${a.unidade.nome}` : null} />
            <Dado rotulo="Responsável" valor={a.responsavel ? `${a.responsavel.nome}${a.responsavel.cargo ? ` · ${a.responsavel.cargo}` : ""}` : null} />
            <Dado rotulo={tipo?.mensal ? "Valor mensal" : "Valor"} valor={a.valor !== null ? formatarMoeda(a.valor) : null} />
            <Dado rotulo="Aquisição" valor={a.data_aquisicao ? formatarData(a.data_aquisicao) : null} />
            <Dado rotulo="Fornecedor" valor={a.fornecedor} />
            <Dado rotulo="Cadastrado em" valor={formatarDataHora(a.created_at)} />
          </dl>
          {a.observacoes && <p className="mt-4 border-t pt-4 text-sm whitespace-pre-line">{a.observacoes}</p>}
        </section>

        {podeEditar && (
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-1 text-sm font-semibold">Situação</h2>
            <p className="mb-4 text-xs text-muted-foreground">Toda mudança fica registrada na auditoria.</p>
            <div className="flex flex-wrap gap-2">
              {a.status !== "em_uso" && a.status !== "baixado" && (
                <ConfirmarAcao titulo="Colocar em uso?" descricao="O equipamento volta a constar como em uso na unidade." rotuloBotao="Colocar em uso" action={alterarStatusAtivo} campos={{ id: a.id, status: "em_uso" }} />
              )}
              {a.status !== "manutencao" && a.status !== "baixado" && (
                <ConfirmarAcao titulo="Enviar para manutenção?" descricao="Marca o equipamento como em manutenção." rotuloBotao="Manutenção" action={alterarStatusAtivo} campos={{ id: a.id, status: "manutencao" }} />
              )}
              {a.status !== "estoque" && a.status !== "baixado" && (
                <ConfirmarAcao titulo="Mover para o estoque?" descricao="O equipamento fica disponível, sem uso em loja." rotuloBotao="Estoque" action={alterarStatusAtivo} campos={{ id: a.id, status: "estoque" }} />
              )}
              {a.status !== "baixado" ? (
                <ConfirmarAcao titulo="Dar baixa?" descricao="Equipamento descartado, vendido ou perdido. Continua no histórico, fora dos totais." rotuloBotao="Dar baixa" variant="destructive" action={alterarStatusAtivo} campos={{ id: a.id, status: "baixado" }} />
              ) : (
                <ConfirmarAcao titulo="Reverter a baixa?" descricao="O equipamento volta para o estoque." rotuloBotao="Reverter baixa" action={alterarStatusAtivo} campos={{ id: a.id, status: "estoque" }} />
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
