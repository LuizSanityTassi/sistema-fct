import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Download, History, MessageSquare, Paperclip } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { exigirAcesso } from "@/lib/auth/session";
import { ETAPAS_CHAMADO, papelAtende, STATUS_CHAMADO_LABEL, STATUS_ENCERRADOS, TRANSICOES, TRANSICOES_SOLICITANTE } from "@/lib/chamados/rotulos";
import { COR_SLA, duracao, situacaoSla } from "@/lib/chamados/sla";
import { linhaDoTempo, listarAtendentes, obterChamado } from "@/lib/data/chamados";
import { formatarDataHora } from "@/lib/formatos";
import { alterarStatusChamado, assumirChamado, atribuirChamado, comentarChamado } from "../actions";
import { AlterarStatusChamado, AtribuirChamado, ComentarioForm } from "../acoes-chamado";
import { BadgeStatusChamado, BadgeTipo } from "../badges-chamado";

export async function generateMetadata({ params }: PageProps<"/chamados/[id]">): Promise<Metadata> {
  const { id } = await params;
  const t = await obterChamado(id);
  return { title: t ? `#${t.numero} ${t.titulo}` : "Chamado" };
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="sobrescrito">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export default async function ChamadoPage({ params, searchParams }: PageProps<"/chamados/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/chamados"), params, searchParams]);
  const t = await obterChamado(id);
  if (!t) notFound();

  const atendente = t.responsavel === sessao.id || papelAtende(sessao.papel, t.categoria);
  const solicitante = t.solicitante === sessao.id;
  const encerrado = STATUS_ENCERRADOS.includes(t.status);
  const transicoes = atendente ? TRANSICOES[t.status] : solicitante ? TRANSICOES_SOLICITANTE[t.status] : [];
  const podeAssumir = !encerrado && papelAtende(sessao.papel, t.categoria) && t.responsavel !== sessao.id;
  const [itens, atendentes] = await Promise.all([linhaDoTempo(id), atendente && !encerrado ? listarAtendentes() : Promise.resolve([])]);
  const sla = situacaoSla(t);
  // trilho: as duas esperas ficam na etapa "Em atendimento"; cancelado mostra o trilho apagado
  const etapaAtual = t.status === "aguardando_usuario" || t.status === "aguardando_terceiro" ? "em_atendimento" : t.status;
  const indiceAtual = ETAPAS_CHAMADO.indexOf(etapaAtual);
  const tempoResolucao = t.resolved_at ? duracao((Date.parse(t.resolved_at) - Date.parse(t.created_at)) / 60_000) : null;

  return (
    <>
      <PageHeader
        eyebrow={`Chamado #${t.numero}`}
        titulo={t.titulo}
        acoes={
          <>
            <BadgeStatusChamado status={t.status} />
            {podeAssumir && (
              <ConfirmarAcao
                titulo="Assumir este chamado?"
                descricao="Você passa a ser o responsável e o solicitante vê o seu nome."
                rotuloBotao="Assumir"
                action={assumirChamado}
                campos={{ id: t.id }}
              />
            )}
            <AlterarStatusChamado action={alterarStatusChamado.bind(null, t.id)} statusAtual={t.status} opcoes={transicoes} />
          </>
        }
      />

      {sp.aberto === "1" && (
        <div className="mb-6">
          <AvisoSucesso mensagem={`Chamado #${t.numero} aberto. Você será avisado por aqui a cada atualização.`} />
        </div>
      )}

      <nav aria-label="Etapas do chamado" className="mb-4 rounded-xl border bg-card p-4">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {ETAPAS_CHAMADO.map((e, i) => {
            const feita = t.status !== "cancelado" && i < indiceAtual;
            const atual = t.status !== "cancelado" && i === indiceAtual;
            return (
              <li key={e} className="flex items-center gap-2">
                {i > 0 && <span className={`h-px w-6 ${feita || atual ? "bg-fct-tinta" : "bg-border"}`} aria-hidden />}
                <span
                  aria-current={atual ? "step" : undefined}
                  className={`rounded-full border px-2.5 py-1 font-medium ${atual ? "border-primary bg-primary text-primary-foreground" : feita ? "border-primary/30 bg-fct-tinta/5 text-fct-tinta" : "text-muted-foreground"}`}
                >
                  {STATUS_CHAMADO_LABEL[e]}
                  {atual && (t.status === "aguardando_usuario" || t.status === "aguardando_terceiro") ? ` · ${STATUS_CHAMADO_LABEL[t.status].toLowerCase()}` : ""}
                </span>
              </li>
            );
          })}
          {t.status === "cancelado" && <li className="ml-2 rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 font-medium text-slate-700">Cancelado</li>}
        </ol>
      </nav>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Descrição</h2>
            {t.descricao ? (
              <p className="text-sm whitespace-pre-line">{t.descricao}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem descrição.</p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Linha do tempo</h2>
            <ol className="space-y-4">
              {itens.map((item) => (
                <li key={`${item.tipo}-${item.id}`} className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-fct-tinta/6 text-fct-tinta">
                    {item.tipo === "comentario" ? (
                      <MessageSquare className="size-3.5" aria-hidden />
                    ) : item.tipo === "anexo" ? (
                      <Paperclip className="size-3.5" aria-hidden />
                    ) : (
                      <History className="size-3.5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{item.autor ?? "Sistema"}</span> · {formatarDataHora(item.quando)}
                    </p>
                    {item.tipo === "comentario" && <p className="mt-1 text-sm whitespace-pre-line">{item.texto}</p>}
                    {item.tipo === "anexo" && item.anexo && (
                      <a href={`/api/arquivos/anexo/${item.anexo.id}`} className="mt-1 inline-flex items-center gap-1 text-sm text-fct-tinta underline">
                        <Download className="size-3.5" aria-hidden /> {item.anexo.nome}
                      </a>
                    )}
                    {item.tipo === "historico" && (
                      <p className="mt-1 text-sm">
                        {item.acao === "aberto" && "Abriu o chamado"}
                        {item.acao === "status" && (
                          <>
                            Situação: {item.de ?? "—"} <ArrowRight className="inline size-3" aria-hidden /> <strong>{item.para}</strong>
                          </>
                        )}
                        {item.acao === "responsavel" && (
                          <>
                            Responsável: {item.de ?? "ninguém"} <ArrowRight className="inline size-3" aria-hidden /> <strong>{item.para}</strong>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!encerrado ? (
              <div className="mt-6 border-t pt-4">
                <ComentarioForm action={comentarChamado.bind(null, t.id)} />
              </div>
            ) : (
              <p className="mt-6 border-t pt-4 text-sm text-muted-foreground">Chamado encerrado. Reabra para comentar.</p>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-2 text-sm font-semibold">Prazo de atendimento (SLA)</h2>
            <span className={`inline-block rounded-full border px-2.5 py-1 text-sm font-medium ${COR_SLA[sla.estado]}`}>{sla.texto}</span>
            <p className="mt-2 text-xs text-muted-foreground">
              Primeira resposta em até {duracao(sla.prazoMin)} (tempo corrido). Conta quando quem atende assume, muda a situação ou comenta.
            </p>
            {tempoResolucao && <p className="mt-2 text-xs text-muted-foreground">Resolvido em {tempoResolucao} desde a abertura.</p>}
          </section>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Informações</h2>
            <dl className="grid gap-4">
              <Dado rotulo="Categoria">
                <BadgeTipo subcategoria={t.subcategoria} categoria={t.categoria} />
              </Dado>
              <Dado rotulo="Unidade">
                {t.unidade ? (
                  <Link href={`/filiais/${t.unidade.id}`} className="hover:underline">
                    <span className="font-mono text-xs text-fct-tinta">{t.unidade.codigo}</span> {t.unidade.nome}
                  </Link>
                ) : (
                  "—"
                )}
              </Dado>
              <Dado rotulo="Solicitante">{t.quem_abriu?.nome ?? "—"}</Dado>
              <Dado rotulo="Responsável">{t.quem_atende?.nome ?? <span className="text-muted-foreground">sem responsável</span>}</Dado>
              <Dado rotulo="Aberto em">{formatarDataHora(t.created_at)}</Dado>
              <Dado rotulo="Última atualização">{formatarDataHora(t.updated_at)}</Dado>
              {t.resolved_at && <Dado rotulo="Resolvido em">{formatarDataHora(t.resolved_at)}</Dado>}
            </dl>
          </section>
          {atendente && !encerrado && atendentes.length > 0 && (
            <section className="rounded-xl border bg-card p-5">
              <AtribuirChamado action={atribuirChamado.bind(null, t.id)} atendentes={atendentes} responsavelAtual={t.responsavel} />
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
