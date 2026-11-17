import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, CalendarRange, FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { AvisoAtencao, AvisoSucesso, ErroFormulario } from "@/components/form/campo";
import { ConfirmarAcao } from "@/components/layout/confirmar-acao";
import { PageHeader } from "@/components/layout/page-header";
import { Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { opcoesDoLote, simulacoesDaFilial, type Simulacao } from "@/lib/data/escalas";
import { DIAS, ROTULO_DIA, type Dia } from "@/lib/escalas/motor";
import { agruparAlertas, datasTexto, estatFolgas, excedenteEquipe, horasEquipe, lacunas, mesCurto, nomeMes, rotuloDias, textoFuncionamento } from "@/lib/escalas/resumo";
import { formatarDataHora } from "@/lib/formatos";
import { cn } from "@/lib/utils";
import { descartarLote, publicarSimulacao, reanalisarSimulacao } from "../../actions";
import { AbasEscala } from "../../abas";
import { Calendario } from "./calendario";
import { ExportarIndividual } from "./exportar";

export const metadata = { title: "Opções de escala" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIAS_ORDEM: Dia[] = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];

function diferencas(s: Simulacao, base: Simulacao) {
  if (s.id === base.id) return null;
  const pessoas = new Map(base.equipe.map((p) => [p.id, p]));
  const mudancas: string[] = [];
  for (const p of s.equipe) {
    const b = pessoas.get(p.id);
    if (!b) continue;
    const turnos = new Map(b.turnos.map((t) => [t.data, t]));
    for (const t of p.turnos) {
      const a = turnos.get(t.data);
      if (!a || (["status", "inicio", "fim", "intervaloInicio", "intervaloFim"] as const).every((k) => (t[k] ?? "") === (a[k] ?? ""))) continue;
      const txt = (x: typeof t) => (x.status === "trabalho" ? x.inicio || "trabalho" : x.status);
      mudancas.push(`${p.nome} · ${String(t.data).padStart(2, "0")} ${ROTULO_DIA[t.dia]}: ${a.status !== t.status ? `${txt(a)} → ${txt(t)}` : `${a.inicio}–${a.fim} → ${t.inicio}–${t.fim}`}`);
    }
  }
  return mudancas;
}

export default async function SimulacaoPage({ params, searchParams }: PageProps<"/escalas/simulacao/[lote]">) {
  const [, { lote }, sp] = await Promise.all([exigirAcesso("/escalas"), params, searchParams]);
  if (!UUID.test(lote)) notFound();
  const resumo = await opcoesDoLote(lote);
  if (!resumo.length) notFound();
  const filiais = [...new Map(resumo.map((r) => [r.branch_id, r.filial])).values()];
  const filialId = typeof sp.filial === "string" && filiais.some((f) => f.id === sp.filial) ? sp.filial : filiais[0].id;
  const sims = await simulacoesDaFilial(lote, filialId);
  if (!sims.length) notFound();
  const sel = sims.find((s) => s.id === sp.op) ?? sims[0];
  const base = sims[0];
  const minFarm = Number(sel.config.minimos.farmaceutico ?? 0) || 1;
  const grupos = agruparAlertas(sel.alertas);
  const folgas = estatFolgas(sel);
  const rascunho = sel.situacao === "rascunho";
  const url = (op: string, filial = filialId) => `/escalas/simulacao/${lote}?filial=${filial}&op=${op}`;
  const volta = url(sel.id);
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const erro = typeof sp.erro === "string" ? sp.erro : undefined;
  const ignoradas = typeof sp.ignoradas === "string" ? sp.ignoradas : undefined;
  const opcoesDaRede = [...new Set(resumo.map((r) => r.opcao))].sort();
  const abertura = Object.fromEntries(DIAS.map((d) => [d, sel.config.horarios[d]?.abre ?? ""]));

  return (
    <>
      <PageHeader
        eyebrow="Escala 5x2 · opções"
        titulo={`${sel.filial.codigo} · ${sel.filial.nome} · ${nomeMes(sel.ano, sel.mes)}`}
        descricao={`${sel.jornadaSemanal} h/semana · folgas em ${rotuloDias(sel.folgasPermitidas)} · ${textoFuncionamento(sel.config)} · gerado em ${formatarDataHora(sel.criadoEm)}${sel.autor ? ` por ${sel.autor}` : ""}`}
        acoes={
          rascunho ? (
            <ConfirmarAcao
              titulo="Descartar os rascunhos desta geração?"
              descricao={`Apaga as ${resumo.filter((r) => r.situacao === "rascunho").length} opção(ões) em rascunho deste lote${filiais.length > 1 ? ` (${filiais.length} filiais)` : ""}. Escala oficial já publicada não é apagada.`}
              rotuloBotao="Descartar rascunhos"
              rotuloConfirmar="Descartar"
              variant="outline"
              action={descartarLote}
              campos={{ lote }}
            />
          ) : undefined
        }
      />
      <AbasEscala ativa={null} />
      <ErroFormulario mensagem={erro} />
      {ok && <AvisoSucesso mensagem={ok} />}
      {ignoradas && <AvisoAtencao mensagem={`Filiais sem opção gerada: ${ignoradas}`} />}

      {filiais.length > 1 && (
        <Painel titulo={`${filiais.length} filiais nesta geração`} descricao="Pendências de cada opção (0 = pode publicar). Clique para abrir a filial." className="mb-4">
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Filial</th>
                  {opcoesDaRede.map((o) => (
                    <th key={o} className="px-2 py-1.5 text-right font-medium">
                      Opção {o}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filiais.map((f) => (
                  <tr key={f.id} className={cn("border-b last:border-0", f.id === filialId && "bg-primary/5")}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/escalas/simulacao/${lote}?filial=${f.id}`} className="font-medium hover:underline">
                        {f.codigo} · {f.nome}
                      </Link>
                    </td>
                    {opcoesDaRede.map((o) => {
                      const r = resumo.find((x) => x.branch_id === f.id && x.opcao === o);
                      return (
                        <td key={o} className="px-2 py-1.5 text-right tabular-nums">
                          {r ? (
                            <Link href={url(r.id, f.id)} className={cn("hover:underline", r.qtd_alertas ? "text-amber-700" : "text-emerald-700")}>
                              {r.situacao === "oficial" ? "oficial" : (r.qtd_alertas ?? 0)}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex flex-wrap gap-3 text-xs">
              {opcoesDaRede.map((o) => (
                <a key={o} href={`/api/escalas/exportar?lote=${lote}&opcao=${o}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                  <FileSpreadsheet className="size-3.5" aria-hidden /> Excel da opção {o} (todas as filiais)
                </a>
              ))}
            </p>
          </div>
        </Painel>
      )}

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {sims.map((s) => {
          const g = agruparAlertas(s.alertas);
          const f = estatFolgas(s);
          return (
            <Link
              key={s.id}
              href={url(s.id)}
              aria-current={s.id === sel.id ? "true" : undefined}
              className={cn("rounded-xl border bg-card p-4 transition-colors hover:border-primary/50", s.id === sel.id && "border-primary ring-2 ring-primary/20")}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-semibold">Opção {s.opcao}</h2>
                {s.situacao === "oficial" ? (
                  <Status tom="sucesso">Oficial</Status>
                ) : s.situacao === "substituida" ? (
                  <Status tom="neutro">Substituída</Status>
                ) : s.alertas.length ? (
                  <Status tom="atencao">{s.alertas.length} pendência(s)</Status>
                ) : (
                  <Status tom="info">Sem pendências</Status>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Equipe ativa</dt>
                <dd className="text-right tabular-nums">{s.equipe.filter((p) => p.situacao === "ativo").length}</dd>
                <dt className="text-muted-foreground">Horas no mês</dt>
                <dd className="text-right tabular-nums">{horasEquipe(s).toFixed(0)} h</dd>
                <dt className="text-muted-foreground">Excedente semanal</dt>
                <dd className="text-right tabular-nums">{excedenteEquipe(s).toFixed(1)} h</dd>
                <dt className="text-muted-foreground">Tipos de pendência</dt>
                <dd className="text-right tabular-nums">{g.length}</dd>
                <dt className="text-muted-foreground">Folgas em ter–qui</dt>
                <dd className="text-right tabular-nums">
                  {f.preferidas}/{f.total} ({f.pct}%)
                </dd>
              </dl>
              {s.analisePendente && <p className="mt-2 text-xs font-medium text-amber-700">Ajustada: atualize as pendências.</p>}
            </Link>
          );
        })}
      </section>

      <Painel
        titulo={`Opção ${sel.opcao} · ${mesCurto(sel.ano, sel.mes)}`}
        icone={CalendarRange}
        descricao={
          sel.situacao === "oficial"
            ? `Escala oficial publicada ${sel.publicadoEm ? formatarDataHora(sel.publicadoEm) : ""}${sel.publicador ? ` por ${sel.publicador}` : ""}. Não muda mais.`
            : sel.situacao === "substituida"
              ? "Esta escala foi oficial e depois substituída por outra publicação."
              : `Folgas marcadas: ${folgas.preferidas}/${folgas.total} em terça–quinta (${folgas.pct}%) · ${folgas.venda} em segunda/sexta.`
        }
        acao={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {rascunho && (
              <form action={reanalisarSimulacao}>
                <input type="hidden" name="id" value={sel.id} />
                <input type="hidden" name="volta" value={volta} />
                <Button type="submit" variant="outline" size="sm">
                  <RefreshCw data-icon="inline-start" />
                  Atualizar pendências
                </Button>
              </form>
            )}
            <Button render={<a href={`/imprimir/escala/${sel.id}`} target="_blank" rel="noopener" />} nativeButton={false} variant="outline" size="sm">
              <Printer data-icon="inline-start" />
              PDF
            </Button>
            <Button render={<a href={`/api/escalas/exportar?id=${sel.id}`} />} nativeButton={false} variant="outline" size="sm">
              <FileSpreadsheet data-icon="inline-start" />
              Excel
            </Button>
            <ExportarIndividual simId={sel.id} pessoas={sel.equipe.filter((p) => p.situacao === "ativo").map((p) => ({ id: p.id, nome: p.nome }))} />
            {rascunho &&
              (sel.alertas.length || sel.analisePendente ? (
                <span className="text-xs text-muted-foreground" title="A escala oficial só é publicada sem pendências na auditoria.">
                  Publicar: resolva as pendências
                </span>
              ) : (
                <ConfirmarAcao
                  titulo="Publicar como escala oficial?"
                  descricao={`Vira a escala oficial de ${mesCurto(sel.ano, sel.mes)} da ${sel.filial.codigo}. Se já houver uma oficial neste mês, ela fica como substituída. A oficial não pode ser alterada depois.`}
                  rotuloBotao="Publicar oficial"
                  rotuloConfirmar="Publicar"
                  action={publicarSimulacao}
                  campos={{ id: sel.id, volta }}
                />
              ))}
          </div>
        }
        className="mb-4"
      >
        {rascunho && (
          <div className="mx-5 mb-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            {sel.analisePendente ? (
              <>
                <span className="font-medium">A escala foi ajustada.</span> A cobertura já foi recalculada; clique em “Atualizar pendências” para registrar o que foi resolvido, o que continua e o que é novo.
              </>
            ) : sel.analise ? (
              <>
                <span className="font-medium">Última atualização{sel.analisadoEm ? ` · ${formatarDataHora(sel.analisadoEm)}` : ""}:</span>{" "}
                {sel.analise.atuais === 0
                  ? "nenhuma pendência nesta opção."
                  : `${sel.analise.resolvidas} resolvida(s) · ${sel.analise.continuam} continuam · ${sel.analise.novas} nova(s).`}
                {sel.analise.mudancas.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                    {sel.analise.mudancas.slice(0, 5).map((m, i) => (
                      <li key={i}>
                        {m.mensagem} <b>{m.agora === 0 ? "resolvida" : m.antes === 0 ? `${m.agora} nova(s)` : `${m.antes} → ${m.agora}`}</b>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <span className="font-medium">{sel.alertas.length} ocorrência(s) de pendência.</span> Ajuste a escala clicando nos dias e use “Atualizar pendências” para comparar com a análise anterior.
              </>
            )}
          </div>
        )}
        <Calendario
          simId={sel.id}
          ano={sel.ano}
          mes={sel.mes}
          jornadaSemanal={sel.jornadaSemanal}
          equipe={sel.equipe}
          cobertura={sel.cobertura}
          abertura={abertura}
          editavel={rascunho}
        />
      </Painel>

      <Painel titulo={`Pendências da auditoria · ${grupos.length} tipos · ${sel.alertas.length} ocorrências`} icone={AlertTriangle} className="mb-4">
        {grupos.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-emerald-700">Nenhuma pendência nas regras e nos dados informados.</p>
        ) : (
          <ul className="space-y-3 px-5 pb-5">
            {grupos.map((g, i) => (
              <li key={i} className="rounded-lg border p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Status tom={g.severidade === "alta" ? "perigo" : "atencao"}>{g.severidade === "alta" ? "Alta" : "Média"}</Status>
                  <div className="min-w-0">
                    <p>{g.mensagem}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {g.ocorrencias} ocorrência(s) · datas: {datasTexto(g.datas, sel.mes)}
                    </p>
                    {g.faixasTodas.length > 0 && <p className="text-xs text-muted-foreground">Faixas sem cobertura (1 h cada): {g.faixasTodas.join(", ")}</p>}
                    {g.sugestoesTodas.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-medium text-primary">Alternativas para avaliar ({g.sugestoesTodas.length})</summary>
                        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                          {g.sugestoesTodas.map((s, k) => (
                            <li key={k}>{s}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {sims.length > 1 && (
        <Painel titulo="Comparar as opções" icone={ArrowLeftRight} descricao="Mesma filial, mês, jornada e equipe. As diferenças de escala são contra a opção 1.">
          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">O que comparar</th>
                  {sims.map((s) => (
                    <th key={s.id} className="px-3 py-2 font-medium">
                      Opção {s.opcao}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="align-top">
                {(
                  [
                    ["Folgas por dia", (s: Simulacao) => DIAS_ORDEM.map((d) => `${ROTULO_DIA[d]} ${estatFolgas(s).porDia[d]}`).join(" · ")],
                    ["Folgas em ter–qui / seg–sex", (s: Simulacao) => `${estatFolgas(s).preferidas} em ter–qui · ${estatFolgas(s).venda} em seg/sex`],
                    ["Horas de farmacêutico no mês", (s: Simulacao) => `${s.equipe.filter((p) => p.funcao === "farmaceutico").reduce((x, p) => x + p.totalHoras, 0).toFixed(0)} h`],
                    ["Dias com farmacêutico o tempo todo", (s: Simulacao) => `${lacunas(s, "farmaceutico", minFarm).diasCobertos} de ${lacunas(s, "farmaceutico", minFarm).diasAbertos}`],
                    [
                      "Faixas sem farmacêutico",
                      (s: Simulacao) => {
                        const l = lacunas(s, "farmaceutico", minFarm);
                        return (
                          <>
                            <b>
                              {l.faixas} faixa(s) em {l.dias} dia(s)
                            </b>
                            {l.detalhe && <span className="block text-xs text-muted-foreground">{l.detalhe}</span>}
                          </>
                        );
                      },
                    ],
                    ["Horas da equipe no mês", (s: Simulacao) => `${horasEquipe(s).toFixed(0)} h`],
                    ["Excedente semanal", (s: Simulacao) => `${excedenteEquipe(s).toFixed(1)} h`],
                    ["Pendências", (s: Simulacao) => `${agruparAlertas(s.alertas).length} tipos · ${s.alertas.length} ocorrência(s)`],
                    [
                      "O que muda em relação à opção 1",
                      (s: Simulacao) => {
                        const d = diferencas(s, base);
                        if (!d) return "Referência";
                        if (!d.length) return "Nenhuma diferença";
                        return (
                          <>
                            <b>{d.length} alteração(ões)</b>
                            <span className="block text-xs text-muted-foreground">
                              {d.slice(0, 3).join(" · ")}
                              {d.length > 3 ? " …" : ""}
                            </span>
                          </>
                        );
                      },
                    ],
                  ] as [string, (s: Simulacao) => ReactNode][]
                ).map(([rotulo, valor]) => (
                  <tr key={rotulo} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">{rotulo}</td>
                    {sims.map((s) => (
                      <td key={s.id} className="px-3 py-2">
                        {valor(s)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">Cada faixa é uma hora em que o mínimo de farmacêuticos ({minFarm}) não está na loja.</p>
          </div>
        </Painel>
      )}
    </>
  );
}
