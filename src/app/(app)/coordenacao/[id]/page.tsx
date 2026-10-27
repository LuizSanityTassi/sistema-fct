import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { DIRETRIZES_CHECKLIST, lerNotas, OBJETIVO_CHECKLIST, SITUACOES_CHECKLIST, TOM_CHECKLIST, type SituacaoChecklist } from "@/lib/coordenacao/checklist";
import { obterChecklist } from "@/lib/data/coordenacao";
import { formatarData, formatarDataHora } from "@/lib/formatos";
import { responderChecklist } from "../actions";
import { MostrarEstrelas } from "../estrelas";
import { BotaoImprimir, CancelarChecklist, RespostaGerente } from "./resposta";

export const metadata = { title: "Checklist da loja" };

const nota1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function ChecklistPage({ params, searchParams }: PageProps<"/coordenacao/[id]">) {
  const [sessao, { id }, sp] = await Promise.all([exigirAcesso("/coordenacao"), params, searchParams]);
  const c = await obterChecklist(id);
  if (!c) notFound();
  const filial = c.filial as { codigo: string; nome: string } | null;
  const situacao = c.situacao as SituacaoChecklist;
  const notas = lerNotas(c.notas);
  const media = c.media === null ? null : Number(c.media);
  const souGerente = c.gerente_id === sessao.id;
  const podeCancelar = situacao === "aguardando" && (c.coordenador_id === sessao.id || sessao.papel === "admin");

  return (
    <>
      <PageHeader
        eyebrow="Coordenação · Checklist da loja"
        titulo={`${filial?.codigo ?? ""} ${filial?.nome ?? ""} · ${formatarData(c.data)}`}
        acoes={
          <>
            <BotaoImprimir />
            <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/coordenacao" />} className="print:hidden">
              <ChevronLeft data-icon="inline-start" />
              Checklists
            </Button>
          </>
        }
      />
      {sp.novo === "1" && (
        <div className="mb-4 print:hidden">
          <AvisoSucesso mensagem={`Checklist enviado. Agora ${c.gerente_nome ?? "o gerente"} confirma no usuário dele.`} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Painel
            id="itens"
            titulo="Itens avaliados"
            acao={
              media !== null && (
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <MostrarEstrelas nota={media} />
                  <span className="tabular-nums">{nota1(media)}</span>
                </span>
              )
            }
          >
            <ul className="divide-y border-t">
              {notas.map((n) => (
                <li key={n.chave || n.item} className="flex items-center justify-between gap-3 px-5 py-2 text-sm">
                  <span>{n.item}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <MostrarEstrelas nota={n.nota} />
                    <span className={`w-4 text-right font-semibold tabular-nums ${n.nota <= 2 ? "text-red-700" : n.nota >= 4 ? "text-emerald-700" : ""}`}>{n.nota}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Painel>

          <div className="grid gap-4 md:grid-cols-2">
            <Painel id="direcionamentos" titulo="Direcionamentos" descricao="Orientações do coordenador ao gerente">
              <Lista itens={c.direcionamentos} vazio="Nenhum direcionamento." />
            </Painel>
            <Painel id="acordos" titulo="Acordado com o gerente" descricao="O que ficou combinado na visita">
              <Lista itens={c.acordos} vazio="Nada acordado." />
            </Painel>
          </div>
        </div>

        <div className="space-y-4">
          <Painel id="dados" titulo="Visita" acao={<Status tom={TOM_CHECKLIST[situacao] ?? "neutro"}>{SITUACOES_CHECKLIST[situacao] ?? situacao}</Status>}>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 border-t px-5 py-3 text-sm">
              <dt className="text-muted-foreground">Loja</dt>
              <dd>
                {filial?.codigo} — {filial?.nome}
              </dd>
              <dt className="text-muted-foreground">Data</dt>
              <dd>{formatarData(c.data)}</dd>
              <dt className="text-muted-foreground">Gerente</dt>
              <dd>{c.gerente_nome ?? "—"}</dd>
              <dt className="text-muted-foreground">Coordenador</dt>
              <dd>{c.coordenador_nome ?? "—"}</dd>
            </dl>
            <div className="space-y-1 border-t px-5 py-3 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">Objetivo: </span>
                {OBJETIVO_CHECKLIST}
              </p>
              <p>
                <span className="font-semibold text-foreground">Diretrizes: </span>
                {DIRETRIZES_CHECKLIST.join(" · ")}
              </p>
            </div>
          </Painel>

          <Painel id="assinaturas" titulo="Confirmações">
            <div className="space-y-3 border-t px-5 py-3 text-sm">
              <p>
                <span className="text-muted-foreground">Coordenador: </span>
                {c.coordenador_nome ?? "—"} · enviado em {formatarDataHora(c.criado_em)}
              </p>
              {situacao === "confirmado" && (
                <p className="text-emerald-800">
                  <span className="text-muted-foreground">Gerente: </span>
                  {c.gerente_nome} confirmou em {formatarDataHora(c.respondido_em)} que está ciente e de acordo.
                  {c.resposta_comentario && <span className="mt-1 block text-foreground">“{c.resposta_comentario}”</span>}
                </p>
              )}
              {situacao === "contestado" && (
                <p className="text-red-800">
                  <span className="text-muted-foreground">Gerente: </span>
                  {c.gerente_nome} não concordou ({formatarDataHora(c.respondido_em)}):
                  <span className="mt-1 block text-foreground">“{c.resposta_comentario}”</span>
                </p>
              )}
              {situacao === "cancelado" && (
                <p className="text-muted-foreground">
                  Cancelado em {formatarDataHora(c.cancelado_em)}: {c.motivo_cancelamento}
                </p>
              )}
              {situacao === "aguardando" && !souGerente && <p className="text-amber-800">Aguardando a confirmação de {c.gerente_nome ?? "o gerente"}.</p>}
            </div>
            {situacao === "aguardando" && souGerente && (
              <div className="border-t px-5 py-4 print:hidden">
                <RespostaGerente action={responderChecklist.bind(null, c.id)} />
              </div>
            )}
            {podeCancelar && (
              <div className="border-t px-5 py-3 print:hidden">
                <CancelarChecklist action={responderChecklist.bind(null, c.id)} />
              </div>
            )}
          </Painel>
        </div>
      </div>
    </>
  );
}

function Lista({ itens, vazio }: { itens: string[]; vazio: string }) {
  if (!itens.length) return <p className="border-t px-5 py-3 text-sm text-muted-foreground">{vazio}</p>;
  return (
    <ol className="list-decimal space-y-1 border-t py-3 pr-5 pl-10 text-sm">
      {itens.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ol>
  );
}
