import Link from "next/link";
import { FileClock, Lock, TimerReset, UserX } from "lucide-react";
import { SelectNativo } from "@/components/form/campo";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, gerePonto, lerMes, lerUuid, listarEquipe, listarFechamentos, meuFuncionario, mesAnterior, obterFuncPonto, proximoMes, rotuloMes } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { AUSENCIA_LABEL, DIAS_SEMANA_CURTO, diaSemana, duracao, limitesMes, saldoTexto } from "@/lib/ponto/calculo";
import { rotuloSituacao, TOM_SITUACAO } from "@/lib/ponto/situacao";
import { cn } from "@/lib/utils";
import { BotoesExportar } from "../_ui/exportar";
import { PilulasMarcacoes } from "../_ui/marcacoes";
import { textoHorario } from "../_ui/resumo-jornada";

export const metadata = { title: "Espelho de ponto" };

export default async function EspelhoPage({ searchParams }: PageProps<"/ponto/espelho">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/espelho"), searchParams]);
  const mes = lerMes(sp.mes);
  const gestor = gerePonto(sessao);
  const eu = await meuFuncionario();
  const pedido = lerUuid(sp.funcionario);
  const func = pedido && gestor ? await obterFuncPonto(pedido) : eu;
  const filialEquipe = lerUuid(sp.filial) ?? func?.branch_id ?? (sessao.papel === "gerente" ? sessao.branchId : null) ?? undefined;
  const equipe = gestor ? await listarEquipe({ filial: filialEquipe }) : [];

  const seletor = (
    <form method="get" className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      <Input type="month" name="mes" defaultValue={mes} aria-label="Mês" className="h-9 w-40" />
      {gestor && (
        <SelectNativo name="funcionario" defaultValue={func?.id ?? ""} aria-label="Funcionário" className="w-auto min-w-64 flex-1 sm:flex-none">
          <option value="" disabled>
            Escolha o funcionário…
          </option>
          {eu && !equipe.some((f) => f.id === eu.id) && <option value={eu.id}>{eu.nome} (eu)</option>}
          {equipe.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} · {f.filialCodigo}
            </option>
          ))}
        </SelectNativo>
      )}
      <Button type="submit" variant="outline">
        Ver
      </Button>
      {gestor && (
        <Button variant="ghost" nativeButton={false} render={<Link href={`/ponto/filial?mes=${mes}${filialEquipe ? `&filial=${filialEquipe}` : ""}`} />}>
          Ver a filial inteira
        </Button>
      )}
      {func && (
        <span className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/ponto/espelho?mes=${mesAnterior(mes)}${pedido ? `&funcionario=${func.id}` : ""}`} />}>
            ← {rotuloMes(mesAnterior(mes)).split(" ")[0]}
          </Button>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/ponto/espelho?mes=${proximoMes(mes)}${pedido ? `&funcionario=${func.id}` : ""}`} />}>
            {rotuloMes(proximoMes(mes)).split(" ")[0]} →
          </Button>
        </span>
      )}
    </form>
  );

  if (!func) {
    return (
      <>
        <PageHeader eyebrow="Ponto" titulo="Espelho de ponto" descricao="Marcações do mês dia a dia, horas trabalhadas, extras, faltas e saldo." />
        {seletor}
        <Painel>
          <EstadoVazio
            icone={gestor ? FileClock : UserX}
            titulo={gestor ? "Escolha um funcionário" : "Seu usuário não está ligado a um funcionário"}
            descricao={gestor ? "Escolha acima o funcionário e o mês. Para ver todos da filial juntos, use “Ver a filial inteira”." : "Peça ao administrador para ligar o seu usuário ao seu cadastro no RH."}
          />
        </Painel>
      </>
    );
  }

  const { de, ate } = limitesMes(mes);
  const [[ap], fechs] = await Promise.all([apurar([func], de, ate), listarFechamentos([`${mes}-01`])]);
  const fechado = fechs.find((f) => f.branch_id === func.branch_id && f.status === "fechado");
  const t = ap.totais;
  const params = { relatorio: "espelho", mes, funcionario: func.id };
  const linkAjuste = (data: string) => `/ponto/ajustes?novo=1&funcionario=${func.id}&data=${data}`;
  const proprio = func.id === eu?.id;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo={`Espelho de ponto · ${rotuloMes(mes)}`}
        descricao={`${func.nome}${func.matricula ? ` · matrícula ${func.matricula}` : ""} · ${func.filialCodigo} ${func.filialNome}${func.cargo ? ` · ${func.cargo}` : ""}${func.departamento ? ` · ${func.departamento}` : ""}`}
        acoes={<BotoesExportar params={params} />}
      />
      {seletor}
      {fechado && (
        <p className="mb-4 flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Lock className="size-4" aria-hidden /> Mês fechado em {formatarData(fechado.fechado_em)}: as marcações estão travadas; o saldo foi lançado no banco de horas. Correções só com o administrador.
        </p>
      )}

      <section className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <Indicador rotulo="Previsto" valor={duracao(t.previsto)} />
        <Indicador rotulo="Trabalhado" valor={duracao(t.trabalhado)} />
        <Indicador rotulo="Saldo" valor={saldoTexto(t.saldo)} tomValor={t.saldo < 0 ? "perigo" : t.saldo > 0 ? "sucesso" : undefined} />
        <Indicador rotulo="Extras" valor={duracao(t.extra)} detalhe={t.extra100 ? `${duracao(t.extra100)} a 100%` : undefined} tomValor={t.extra ? "info" : undefined} />
        <Indicador rotulo="Débito" valor={duracao(t.debito)} tomValor={t.debito ? "atencao" : undefined} />
        <Indicador rotulo="Faltas" valor={t.faltas} tomValor={t.faltas ? "perigo" : undefined} />
        <Indicador rotulo="Atrasos" valor={t.atrasos} detalhe={t.minutosAtraso ? `${duracao(t.minutosAtraso)} no total` : undefined} tomValor={t.atrasos ? "atencao" : undefined} />
        <Indicador rotulo="Noturno" valor={duracao(t.noturno)} detalhe="22h às 5h" />
      </section>

      <Painel
        titulo="Dia a dia"
        descricao={`Jornada: ${ap.jornadaAtual ?? "sem jornada definida"}. Marcação riscada = anulada; roxa = incluída por ajuste aprovado; +1 = depois da meia-noite.`}
        acao={
          !fechado && (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/ponto/ajustes?novo=1&funcionario=${func.id}`} />}>
              <TimerReset aria-hidden /> Pedir ajuste
            </Button>
          )
        }
      >
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Dia</th>
                <th className="px-2 py-2 font-medium">Previsto</th>
                <th className="px-2 py-2 font-medium">Marcações</th>
                <th className="px-2 py-2 text-right font-medium">Trabalhado</th>
                <th className="px-2 py-2 text-right font-medium">Extra</th>
                <th className="px-2 py-2 text-right font-medium">Débito</th>
                <th className="px-2 py-2 text-right font-medium">Saldo</th>
                <th className="px-2 py-2 font-medium">Situação</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {ap.dias.map((d) => {
                const p = d.previsto;
                const fimDeSemana = [0, 6].includes(diaSemana(d.data));
                return (
                  <tr key={d.data} className={cn("border-b align-top last:border-0", (p.folga || fimDeSemana) && "bg-muted/30", d.situacao === "falta" && "bg-red-50/60")}>
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                      <span className="inline-block w-8 text-muted-foreground">{DIAS_SEMANA_CURTO[diaSemana(d.data)]}</span>
                      {formatarData(d.data).slice(0, 5)}
                    </td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground">
                      {p.origem === "ausencia" && p.ausencia ? AUSENCIA_LABEL[p.ausencia.tipo] : p.minutos > 0 ? textoHorario(p.horarios) : p.feriado ? "Feriado" : p.origem === "fora_contrato" ? "—" : p.origem === "sem_jornada" ? "Sem jornada" : "Folga"}
                      {p.origem === "escala" && <span className="ml-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800">escala</span>}
                    </td>
                    <td className="px-2 py-2">
                      <PilulasMarcacoes marcacoes={d.marcacoes} data={d.data} />
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{d.trabalhado ? duracao(d.trabalhado) : ""}</td>
                    <td className="px-2 py-2 text-right text-sky-700 tabular-nums">{d.extra ? duracao(d.extra) : ""}</td>
                    <td className="px-2 py-2 text-right text-amber-800 tabular-nums">{d.debito ? duracao(d.debito) : ""}</td>
                    <td className={cn("px-2 py-2 text-right font-medium tabular-nums", d.saldo < 0 ? "text-red-700" : d.saldo > 0 ? "text-emerald-700" : "text-muted-foreground")}>{d.saldo ? saldoTexto(d.saldo) : ""}</td>
                    <td className="px-2 py-2">
                      {d.situacao !== "futuro" && d.situacao !== "fora_contrato" && <Status tom={TOM_SITUACAO[d.situacao]}>{rotuloSituacao(d)}</Status>}
                      {d.ocorrencias
                        .filter((o) => o.codigo !== "falta")
                        .map((o) => (
                          <p key={o.codigo} className={cn("mt-0.5 text-xs", o.grave ? "text-red-700" : "text-amber-800")}>
                            {o.texto}
                          </p>
                        ))}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {!fechado && d.situacao !== "futuro" && d.situacao !== "fora_contrato" && (d.ocorrencias.length > 0 || d.marcacoes.length > 0) && (
                        <Link href={linkAjuste(d.data)} className="text-xs whitespace-nowrap text-fct-tinta underline">
                          Ajustar
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="px-4 py-2" colSpan={3}>
                  Total do mês {t.inconsistencias ? <span className="ml-2 text-xs font-normal text-red-700">{t.inconsistencias} dia(s) com inconsistência</span> : null}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">{duracao(t.trabalhado)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{duracao(t.extra)}</td>
                <td className="px-2 py-2 text-right tabular-nums">{duracao(t.debito)}</td>
                <td className={cn("px-2 py-2 text-right tabular-nums", t.saldo < 0 ? "text-red-700" : "text-emerald-700")}>{saldoTexto(t.saldo)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Painel>
      {!proprio && gestor && (
        <p className="mt-3 text-xs text-muted-foreground">
          <Link href={`/ponto/banco?funcionario=${func.id}`} className="underline">
            Banco de horas de {func.nome.split(" ")[0]}
          </Link>{" "}
          ·{" "}
          <Link href={`/rh/funcionarios/${func.id}`} className="underline">
            Ficha no RH
          </Link>
        </p>
      )}
    </>
  );
}
