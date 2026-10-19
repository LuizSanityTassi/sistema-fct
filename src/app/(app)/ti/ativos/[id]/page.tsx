import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoy, Pencil, Printer } from "lucide-react";
import { AvisoSucesso } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { listarEventosDoAtivo, obterAtivo } from "@/lib/data/ti";
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formatos";
import { linkDoAtivo, origemDoSistema, svgQr } from "@/lib/ti/qr";
import { TIPO_ATIVO_LABEL, TIPOS_ATIVO, TIPOS_EVENTO_ATIVO, type TipoEventoAtivo } from "@/lib/ti/rotulos";
import { alterarStatusAtivo, registrarEventoAtivo } from "../actions";
import { BadgeAtivo } from "../badge-ativo";
import { EventoForm } from "./evento-form";

// hoje no horário de Brasília (UTC−3), em aaaa-mm-dd
const hojeNoBrasil = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

export async function generateMetadata({ params }: PageProps<"/ti/ativos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const a = await obterAtivo(id);
  return { title: a ? a.descricao : "Ativo" };
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="sobrescrito">{rotulo}</dt>
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
  const [eventos, qr] = await Promise.all([listarEventosDoAtivo(a.id), origemDoSistema().then((o) => svgQr(linkDoAtivo(o, a.id)))]);
  const hoje = hojeNoBrasil();
  const garantia = a.garantia_ate ? (a.garantia_ate < hoje ? `vencida em ${formatarData(a.garantia_ate)}` : `até ${formatarData(a.garantia_ate)}`) : null;

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
            <Button variant="outline" nativeButton={false} render={<a href={`/etiquetas/ti?ids=${a.id}`} target="_blank" rel="noopener" />}>
              <Printer data-icon="inline-start" />
              Imprimir etiqueta
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
            <Dado rotulo="Garantia" valor={garantia} />
            <Dado rotulo="Fornecedor" valor={a.fornecedor} />
            <Dado rotulo="Setor" valor={a.setor} />
            <Dado rotulo="Nome na rede" valor={a.hostname} mono />
            <Dado rotulo="IP" valor={a.ip} mono />
            <Dado rotulo="AnyDesk" valor={a.anydesk} mono />
            <Dado rotulo="Cadastrado em" valor={formatarDataHora(a.created_at)} />
          </dl>
          {a.observacoes && <p className="mt-4 border-t pt-4 text-sm whitespace-pre-line">{a.observacoes}</p>}
        </section>

        <div className="space-y-4">
          <section className="flex items-center gap-4 rounded-xl border bg-card p-5">
            <div
              className="size-28 shrink-0 rounded-md border bg-white p-1.5 [&_svg]:size-full"
              role="img"
              aria-label={`QR Code que abre esta ficha (${a.patrimonio ?? "sem patrimônio"})`}
              dangerouslySetInnerHTML={{ __html: qr }}
            />
            <div className="min-w-0">
              <p className="font-mono text-sm font-semibold break-all">{a.patrimonio ?? "sem patrimônio"}</p>
              <p className="mt-1 text-xs text-muted-foreground">Cole a etiqueta no equipamento: escaneou com o celular, abre esta ficha.</p>
              <a href={`/etiquetas/ti?ids=${a.id}`} target="_blank" rel="noopener" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-fct-tinta underline">
                <Printer className="size-3.5" aria-hidden /> Imprimir etiqueta
              </a>
            </div>
          </section>

          {podeEditar && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-1 text-sm font-semibold">Situação</h2>
              <p className="mb-4 text-xs text-muted-foreground">Toda mudança fica registrada na auditoria.</p>
              <div className="flex flex-wrap gap-2">
                {a.status !== "em_uso" && a.status !== "baixado" && (
                  <ConfirmarAcao
                    titulo="Colocar em uso?"
                    descricao="O equipamento volta a constar como em uso na unidade."
                    rotuloBotao="Colocar em uso"
                    action={alterarStatusAtivo}
                    campos={{ id: a.id, status: "em_uso" }}
                  />
                )}
                {a.status !== "manutencao" && a.status !== "baixado" && (
                  <ConfirmarAcao
                    titulo="Enviar para manutenção?"
                    descricao="Marca o equipamento como em manutenção."
                    rotuloBotao="Manutenção"
                    action={alterarStatusAtivo}
                    campos={{ id: a.id, status: "manutencao" }}
                  />
                )}
                {a.status !== "estoque" && a.status !== "baixado" && (
                  <ConfirmarAcao
                    titulo="Mover para o estoque?"
                    descricao="O equipamento fica disponível, sem uso em loja."
                    rotuloBotao="Estoque"
                    action={alterarStatusAtivo}
                    campos={{ id: a.id, status: "estoque" }}
                  />
                )}
                {a.status !== "baixado" ? (
                  <ConfirmarAcao
                    titulo="Dar baixa?"
                    descricao="Equipamento descartado, vendido ou perdido. Continua no histórico, fora dos totais."
                    rotuloBotao="Dar baixa"
                    variant="destructive"
                    action={alterarStatusAtivo}
                    campos={{ id: a.id, status: "baixado" }}
                  />
                ) : (
                  <ConfirmarAcao
                    titulo="Reverter a baixa?"
                    descricao="O equipamento volta para o estoque."
                    rotuloBotao="Reverter baixa"
                    action={alterarStatusAtivo}
                    campos={{ id: a.id, status: "estoque" }}
                  />
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      <section aria-labelledby="t-historico" className="mt-4 rounded-xl border bg-card p-5">
        <h2 id="t-historico" className="mb-1 text-sm font-semibold">
          Histórico do equipamento
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">Cadastro, transferências, situação e responsável entram sozinhos; manutenção e troca de peça a TI registra aqui.</p>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
        ) : (
          <ol className="space-y-3 border-l pl-5">
            {eventos.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-fct-tinta/60" aria-hidden />
                <p className="text-xs text-muted-foreground">
                  {formatarData(e.data)} · {TIPOS_EVENTO_ATIVO[e.tipo as TipoEventoAtivo] ?? e.tipo}
                  {e.autor_nome ? ` · ${e.autor_nome}` : ""}
                </p>
                <p className="text-sm">{e.descricao}</p>
              </li>
            ))}
          </ol>
        )}
        {podeEditar && (
          <div className="mt-4">
            <EventoForm action={registrarEventoAtivo.bind(null, a.id)} hoje={hoje} />
          </div>
        )}
      </section>
    </>
  );
}
