import Link from "next/link";
import { Building2, Lock, Printer, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, Painel } from "@/components/layout/painel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, listarFechamentos, type ApuracaoFunc } from "@/lib/data/ponto";
import { colaboradoresDaFolha, filiaisDaFolha, ROTA_IMPRIMIR_FOLHA } from "@/lib/data/ponto-folha";
import { atalhosPeriodo, competenciasDoPeriodo, lerParamsPontoFilial, MAX_DIAS_GRADE, ROTA_PONTO_FILIAL } from "@/lib/data/ponto-filial";
import { formatarData } from "@/lib/formatos";
import { AUSENCIA_LABEL, DIAS_SEMANA_CURTO, diaSemana, duracao, intervaloDias, local, saldoTexto, type ApuracaoDia, type SituacaoDia, type TipoAusencia } from "@/lib/ponto/calculo";
import { rotuloSituacao } from "@/lib/ponto/situacao";
import { cn } from "@/lib/utils";
import { SelectFilial } from "../folha-assinatura/select-filial";
import { horaLocal } from "../_ui/marcacoes";
import { textoHorario } from "../_ui/resumo-jornada";

export const metadata = { title: "Ponto por filial" };

/** Fundo da célula pela situação do dia (mesmas cores do espelho). */
const FUNDO: Partial<Record<SituacaoDia, string>> = {
  falta: "bg-red-50 text-red-800",
  incompleto: "bg-orange-50",
  debito: "bg-amber-50/70",
  extra: "bg-sky-50/70",
  ausencia: "bg-violet-50 text-violet-800",
  compensacao: "bg-violet-50 text-violet-800",
  folga: "bg-muted/60 text-muted-foreground",
  feriado: "bg-muted/60 text-muted-foreground",
  sem_jornada: "bg-amber-50 text-amber-900",
};

const AUSENCIA_CURTA: Record<TipoAusencia, string> = {
  ferias: "Férias",
  afastamento: "Afast.",
  atestado: "Atest.",
  licenca: "Licença",
  abono: "Abono",
  folga_compensatoria: "Comp.",
};

/** Texto da célula quando o dia não tem marcação. */
function rotuloSemMarcacao(d: ApuracaoDia) {
  switch (d.situacao) {
    case "falta":
      return "Falta";
    case "folga":
      return "Folga";
    case "feriado":
      return "Feriado";
    case "ausencia":
      return d.previsto.ausencia ? AUSENCIA_CURTA[d.previsto.ausencia.tipo] : "Ausência";
    case "compensacao":
      return "Comp.";
    case "sem_jornada":
      return "S/ jorn.";
    case "em_andamento":
      return "…";
    default:
      return "";
  }
}

function previstoTexto(d: ApuracaoDia) {
  const p = d.previsto;
  if (p.origem === "ausencia" && p.ausencia) return AUSENCIA_LABEL[p.ausencia.tipo];
  if (p.minutos > 0) return textoHorario(p.horarios);
  if (p.feriado) return `Feriado (${p.feriado})`;
  if (p.origem === "sem_jornada") return "Sem jornada";
  return "Folga";
}

/** Dica da célula (passar o mouse): dia, previsto, marcações, horas e ocorrências. */
function dicaDoDia(nome: string, d: ApuracaoDia) {
  const linhas = [`${nome} · ${DIAS_SEMANA_CURTO[diaSemana(d.data)]} ${formatarData(d.data)}`, `Situação: ${rotuloSituacao(d)}`, `Previsto: ${previstoTexto(d)}`];
  if (d.marcacoes.length) linhas.push(`Marcações: ${d.marcacoes.map((m) => `${horaLocal(m.momento)}${m.anulada ? " (anulada)" : m.origem === "ajuste" ? " (ajuste)" : ""}`).join(" · ")}`);
  if (d.trabalhado) linhas.push(`Trabalhado: ${duracao(d.trabalhado)}`);
  if (d.extra) linhas.push(`Extra: ${duracao(d.extra)}${d.extra100 ? ` (${duracao(d.extra100)} a 100%)` : ""}`);
  if (d.debito) linhas.push(`Débito: ${duracao(d.debito)}`);
  if (d.saldo) linhas.push(`Saldo do dia: ${saldoTexto(d.saldo)}`);
  for (const o of d.ocorrencias) linhas.push(`• ${o.texto}`);
  return linhas.join("\n");
}

function Celula({ nome, d }: { nome: string; d: ApuracaoDia }) {
  if (d.situacao === "futuro" || d.situacao === "fora_contrato") {
    return <td className={cn("border-r border-b px-1 py-1", d.situacao === "fora_contrato" && "bg-muted/30")} title={d.situacao === "fora_contrato" ? `${nome}: fora do período de contrato/controle` : undefined} />;
  }
  const grave = d.ocorrencias.some((o) => o.grave);
  const mostraSaldo = d.saldo !== 0 && d.situacao !== "em_andamento";
  return (
    <td title={dicaDoDia(nome, d)} className={cn("border-r border-b px-1 py-1 align-top text-center", FUNDO[d.situacao], grave && "ring-1 ring-red-400 ring-inset")}>
      {d.marcacoes.length ? (
        <span className="flex flex-col items-center leading-tight tabular-nums">
          {d.marcacoes.map((m) => (
            <span key={m.id} className={cn(m.anulada ? "text-muted-foreground line-through" : m.origem === "ajuste" && "text-violet-700")}>
              {horaLocal(m.momento)}
              {local(m.momento).data !== d.data && <sup>+1</sup>}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-[11px] font-medium">{rotuloSemMarcacao(d)}</span>
      )}
      {mostraSaldo && <span className={cn("mt-0.5 block text-[10px] font-semibold tabular-nums", d.saldo < 0 ? "text-red-700" : "text-emerald-700")}>{saldoTexto(d.saldo)}</span>}
    </td>
  );
}

export default async function PontoFilialPage({ searchParams }: PageProps<"/ponto/filial">) {
  const [sessao, sp] = await Promise.all([exigirAcesso(ROTA_PONTO_FILIAL), searchParams]);
  const filiais = await filiaisDaFolha(sessao);
  const p = lerParamsPontoFilial(sp, sessao);
  const filial = filiais.find((f) => f.id === p.filial) ?? (filiais.length === 1 ? filiais[0] : undefined);
  const colaboradores = filial ? (await colaboradoresDaFolha(filial.id, p.de)).filter((f) => !f.data_admissao || f.data_admissao <= p.ate) : [];
  const [aps, fechamentos] = colaboradores.length ? await Promise.all([apurar(colaboradores, p.de, p.ate), listarFechamentos(competenciasDoPeriodo(p.de, p.ate))]) : [[] as ApuracaoFunc[], []];
  const fechado = filial ? fechamentos.filter((f) => f.branch_id === filial.id && f.status === "fechado") : [];
  const dias = intervaloDias(p.de, p.ate);
  const at = atalhosPeriodo(p.de);
  const link = (de: string, ate: string) => `${ROTA_PONTO_FILIAL}?${new URLSearchParams({ ...(filial ? { filial: filial.id } : {}), de, ate })}`;

  // feriado de cada coluna (vem da apuração de qualquer colaborador da filial)
  const feriadoDoDia = new Map<string, string>();
  for (const a of aps) for (const d of a.dias) if (d.previsto.feriado && !feriadoDoDia.has(d.data)) feriadoDoDia.set(d.data, d.previsto.feriado);
  // quantos marcaram em cada dia
  const presentes = dias.map((dia) => aps.filter((a) => a.dias.find((d) => d.data === dia)?.marcacoes.some((m) => !m.anulada)).length);

  const tot = aps.reduce(
    (t, a) => ({
      trabalhado: t.trabalhado + a.totais.trabalhado,
      extra: t.extra + a.totais.extra,
      extra100: t.extra100 + a.totais.extra100,
      debito: t.debito + a.totais.debito,
      saldo: t.saldo + a.totais.saldo,
      faltas: t.faltas + a.totais.faltas,
      atrasos: t.atrasos + a.totais.atrasos,
      inconsistencias: t.inconsistencias + a.totais.inconsistencias,
    }),
    { trabalhado: 0, extra: 0, extra100: 0, debito: 0, saldo: 0, faltas: 0, atrasos: 0, inconsistencias: 0 },
  );
  const imprimir = filial ? `${ROTA_IMPRIMIR_FOLHA}?${new URLSearchParams({ filial: filial.id, de: p.de, ate: p.ate })}` : null;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Ponto por filial"
        descricao="Todos os colaboradores da filial lado a lado, com as marcações de cada dia do período escolhido. Passe o mouse no dia para ver o previsto, as horas e as ocorrências; clique no nome para abrir o espelho da pessoa."
        acoes={
          imprimir &&
          aps.length > 0 && (
            <Button variant="outline" nativeButton={false} render={<a href={imprimir} target="_blank" rel="noopener" />}>
              <Printer aria-hidden /> Folhas para assinatura
            </Button>
          )
        }
      />

      {!filiais.length ? (
        <Painel>
          <EstadoVazio icone={Building2} titulo="Nenhuma filial disponível" descricao="Seu usuário não está ligado a uma filial. Peça ao administrador." />
        </Painel>
      ) : (
        <>
          <form method="get" action={ROTA_PONTO_FILIAL} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
            <SelectFilial name="filial" rota={ROTA_PONTO_FILIAL} defaultValue={filial?.id ?? ""} disabled={filiais.length === 1} aria-label="Filial" className="w-auto min-w-64 flex-1 sm:flex-none">
              {!filial && (
                <option value="" disabled>
                  Escolha a filial…
                </option>
              )}
              {filiais.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.codigo} - {u.nome}
                </option>
              ))}
            </SelectFilial>
            {filiais.length === 1 && filial && <input type="hidden" name="filial" value={filial.id} />}
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              De
              <Input type="date" name="de" defaultValue={p.de} required className="h-9 w-40" />
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
              até
              <Input type="date" name="ate" defaultValue={p.ate} required className="h-9 w-40" />
            </label>
            <Button type="submit" variant="outline">
              Ver
            </Button>
          </form>
          <nav aria-label="Atalhos de período" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={link(at.anterior.de, at.anterior.ate)} />}>
              ← Mês anterior
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={link(at.primeiraQuinzena.de, at.primeiraQuinzena.ate)} />}>
              1ª quinzena
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={link(at.segundaQuinzena.de, at.segundaQuinzena.ate)} />}>
              2ª quinzena
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={link(at.inteiro.de, at.inteiro.ate)} />}>
              Mês inteiro
            </Button>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={link(at.proximo.de, at.proximo.ate)} />}>
              Próximo mês →
            </Button>
            {p.cortado && <span className="ml-2 text-xs text-amber-800">Período cortado em {MAX_DIAS_GRADE} dias (uma coluna por dia).</span>}
          </nav>
        </>
      )}

      {filiais.length > 0 && !filial && (
        <Painel>
          <EstadoVazio icone={Building2} titulo="Escolha a filial" descricao="Escolha acima a filial e o período para ver o ponto de todos os colaboradores." />
        </Painel>
      )}

      {filial && !aps.length && (
        <Painel>
          <EstadoVazio icone={Users} titulo="Nenhum colaborador nesta filial no período" descricao="Confira o cadastro no RH ou o seu acesso à filial." />
        </Painel>
      )}

      {filial && aps.length > 0 && (
        <>
          {fechado.length > 0 && (
            <p className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <Lock className="size-4" aria-hidden /> Mês fechado nesta filial ({fechado.map((f) => f.competencia.slice(5, 7) + "/" + f.competencia.slice(0, 4)).join(", ")}): as marcações estão travadas.
            </p>
          )}

          <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <Indicador rotulo="Colaboradores" valor={aps.length} />
            <Indicador rotulo="Trabalhado" valor={duracao(tot.trabalhado)} />
            <Indicador rotulo="Extras" valor={duracao(tot.extra)} detalhe={tot.extra100 ? `${duracao(tot.extra100)} a 100%` : undefined} tomValor={tot.extra ? "info" : undefined} />
            <Indicador rotulo="Débito" valor={duracao(tot.debito)} tomValor={tot.debito ? "atencao" : undefined} />
            <Indicador rotulo="Faltas" valor={tot.faltas} tomValor={tot.faltas ? "perigo" : undefined} />
            <Indicador rotulo="Atrasos" valor={tot.atrasos} tomValor={tot.atrasos ? "atencao" : undefined} />
            <Indicador rotulo="Dias com inconsistência" valor={tot.inconsistencias} tomValor={tot.inconsistencias ? "perigo" : undefined} />
          </section>

          <Painel
            titulo={`${filial.codigo} ${filial.nome} · ${formatarData(p.de)} a ${formatarData(p.ate)}`}
            descricao="Cada coluna é um dia. Roxo = marcação incluída por ajuste; riscada = anulada; +1 = depois da meia-noite; número embaixo = saldo do dia. Contorno vermelho = inconsistência."
          >
            <div className="max-h-[calc(100vh-14rem)] overflow-auto border-t">
              <table className="w-max border-separate border-spacing-0 text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="sticky top-0 left-0 z-30 min-w-56 border-r border-b bg-card px-3 py-2 text-left font-medium">Colaborador</th>
                    {dias.map((dia) => {
                      const ds = diaSemana(dia);
                      const feriado = feriadoDoDia.get(dia);
                      return (
                        <th key={dia} title={feriado ? `Feriado: ${feriado}` : undefined} className={cn("sticky top-0 z-20 w-12 min-w-12 border-r border-b px-1 py-1.5 text-center font-medium", ds === 0 || ds === 6 || feriado ? "bg-muted" : "bg-card", feriado && "text-red-700")}>
                          <span className="block text-sm text-foreground tabular-nums">{dia.slice(8, 10)}</span>
                          <span className="block text-[10px]">{feriado ? "Fer." : DIAS_SEMANA_CURTO[ds]}</span>
                        </th>
                      );
                    })}
                    {["Trabalhado", "Extra", "Débito", "Saldo", "Faltas", "Atrasos"].map((t) => (
                      <th key={t} className="sticky top-0 z-20 border-b bg-card px-2 py-1.5 text-right font-medium whitespace-nowrap">
                        {t}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {aps.map(({ func: f, dias: ds, totais: t, jornadaAtual }) => (
                    <tr key={f.id} className="group">
                      <td className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1.5 align-top group-hover:bg-muted">
                        <Link href={`/ponto/espelho?funcionario=${f.id}&mes=${p.de.slice(0, 7)}`} className="font-medium text-foreground hover:underline">
                          {f.nome}
                        </Link>
                        <span className="block text-[11px] text-muted-foreground">
                          {[f.matricula && `Mat. ${f.matricula}`, f.cargo].filter(Boolean).join(" · ")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{jornadaAtual ?? "Sem jornada definida"}</span>
                        {f.status === "desligado" && <span className="block text-[11px] text-red-700">Desligado em {formatarData(f.data_desligamento)}</span>}
                      </td>
                      {ds.map((d) => (
                        <Celula key={d.data} nome={f.nome} d={d} />
                      ))}
                      <td className="border-b px-2 py-1.5 text-right align-top tabular-nums">{t.trabalhado ? duracao(t.trabalhado) : "—"}</td>
                      <td className="border-b px-2 py-1.5 text-right align-top text-sky-700 tabular-nums">{t.extra ? duracao(t.extra) : ""}</td>
                      <td className="border-b px-2 py-1.5 text-right align-top text-amber-800 tabular-nums">{t.debito ? duracao(t.debito) : ""}</td>
                      <td className={cn("border-b px-2 py-1.5 text-right align-top font-semibold tabular-nums", t.saldo < 0 ? "text-red-700" : t.saldo > 0 ? "text-emerald-700" : "text-muted-foreground")}>{t.saldo ? saldoTexto(t.saldo) : "0:00"}</td>
                      <td className={cn("border-b px-2 py-1.5 text-right align-top tabular-nums", t.faltas && "font-semibold text-red-700")}>{t.faltas || ""}</td>
                      <td className={cn("border-b px-2 py-1.5 text-right align-top tabular-nums", t.atrasos && "text-amber-800")}>{t.atrasos || ""}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="sticky left-0 z-10 border-r bg-card px-3 py-2 text-left">
                      Marcaram no dia
                      <span className="block text-[11px] font-normal text-muted-foreground">de {aps.length} colaborador(es)</span>
                    </td>
                    {presentes.map((n, i) => (
                      <td key={dias[i]} className="border-r px-1 py-2 text-center tabular-nums">
                        {n || <span className="text-muted-foreground">0</span>}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right tabular-nums">{duracao(tot.trabalhado)}</td>
                    <td className="px-2 py-2 text-right text-sky-700 tabular-nums">{tot.extra ? duracao(tot.extra) : ""}</td>
                    <td className="px-2 py-2 text-right text-amber-800 tabular-nums">{tot.debito ? duracao(tot.debito) : ""}</td>
                    <td className={cn("px-2 py-2 text-right tabular-nums", tot.saldo < 0 ? "text-red-700" : "text-emerald-700")}>{saldoTexto(tot.saldo)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{tot.faltas || ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{tot.atrasos || ""}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Painel>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
            {(
              [
                ["bg-red-50", "Falta"],
                ["bg-orange-50", "Incompleto (falta marcação)"],
                ["bg-amber-50", "Débito / sem jornada"],
                ["bg-sky-50", "Hora extra"],
                ["bg-violet-50", "Férias, atestado, afastamento, abono"],
                ["bg-muted", "Folga, feriado, fim de semana"],
              ] as const
            ).map(([cor, texto]) => (
              <li key={texto} className="flex items-center gap-1.5">
                <span className={cn("size-3 rounded-sm border", cor)} aria-hidden />
                {texto}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
