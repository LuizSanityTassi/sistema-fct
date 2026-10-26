import Link from "next/link";
import { CalendarClock, FileClock, Fingerprint, Hourglass, TimerReset, UserX } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Indicador, LinkPainel, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { Button } from "@/components/ui/button";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, bancoDeHoras, configFiliais, listarAjustes, meuFuncionario } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { DIAS_SEMANA_CURTO, diaSemana, duracao, hojeLocal, METODO_LABEL, proximoTipo, saldoTexto, somarDias, TIPO_MARCACAO_LABEL } from "@/lib/ponto/calculo";
import { rotuloSituacao, situacaoAgora, TOM_SITUACAO } from "@/lib/ponto/situacao";
import { createClient } from "@/lib/supabase/server";
import { definirPin } from "../equipe/actions";
import { horaLocal, ICONE_TIPO, PilulasMarcacoes } from "../_ui/marcacoes";
import { PinForm } from "../_ui/pin-form";
import { textoHorario } from "../_ui/resumo-jornada";
import { registrarMeuPonto } from "./actions";
import { RegistroPessoal } from "./registro-pessoal";

export const metadata = { title: "Meu ponto" };

export default async function MeuPontoPage() {
  await exigirAcesso("/ponto/registrar");
  const func = await meuFuncionario();
  if (!func) {
    return (
      <>
        <PageHeader eyebrow="Ponto" titulo="Meu ponto" />
        <Painel>
          <EstadoVazio
            icone={UserX}
            titulo="Seu usuário não está ligado a um funcionário"
            descricao="Para registrar o ponto, o administrador precisa ligar o seu usuário ao seu cadastro no RH (Administração → Usuários → editar → Funcionário)."
          />
        </Painel>
      </>
    );
  }

  const agora = new Date();
  const hoje = hojeLocal(agora);
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const deSemana = somarDias(hoje, -6) < inicioMes ? somarDias(hoje, -6) : inicioMes;
  const supabase = await createClient();
  const [[ap], [banco], configs, ajustes, { data: comPin }] = await Promise.all([
    apurar([func], deSemana, hoje, { agora }),
    bancoDeHoras([func], { agora }),
    configFiliais(),
    listarAjustes({ funcionario: func.id, status: "pendente", limite: 20 }),
    supabase.rpc("ponto_tem_pin", { p_employees: [func.id] }),
  ]);
  const diaHoje = ap.dias[ap.dias.length - 1];
  const doMes = ap.dias.filter((d) => d.data >= inicioMes);
  const saldoMes = doMes.reduce((s, d) => s + d.saldo, 0);
  const faltasMes = doMes.filter((d) => d.falta).length;
  const atrasosMes = doMes.filter((d) => d.atraso > 0).length;
  // próxima marcação pela sequência do turno (entrada → intervalo → retorno → saída); turno da noite que começou
  // ontem e ainda não fechou continua valendo depois da meia-noite
  const ontem = ap.dias[ap.dias.length - 2];
  const turnoAberto =
    !diaHoje.marcacoes.length && ontem?.marcacoes.length && ontem.marcacoes[ontem.marcacoes.length - 1].tipo !== "saida" && agora.getTime() - Date.parse(ontem.marcacoes[0].momento) <= 16 * 3_600_000;
  const sugestao = proximoTipo(turnoAberto ? ontem.marcacoes.length : diaHoje.marcacoes.length);
  const s = situacaoAgora(diaHoje, agora);
  const p = diaHoje.previsto;
  const temPin = (comPin ?? []).includes(func.id);
  const ultimos = ap.dias.slice(-7).reverse();

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo="Meu ponto"
        descricao={`${func.nome} · ${func.filialCodigo} ${func.filialNome}${func.matricula ? ` · matrícula ${func.matricula}` : ""}`}
        acoes={
          <>
            <Button variant="outline" nativeButton={false} render={<Link href="/ponto/espelho" />}>
              <FileClock aria-hidden /> Meu espelho
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/ponto/ajustes?novo=1" />}>
              <TimerReset aria-hidden /> Pedir ajuste
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RegistroPessoal sugestao={sugestao} exigeLocalizacao={configs.get(func.branch_id)?.exige_localizacao ?? false} registrar={registrarMeuPonto} />

        <Painel titulo="Hoje" icone={CalendarClock} acao={<Status tom={s.tom}>{s.texto}</Status>}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t px-5 py-4 text-sm">
            <div className="col-span-2">
              <dt className="rotulo">Jornada prevista</dt>
              <dd className="mt-0.5 font-medium">
                {p.origem === "ausencia" || p.origem === "fora_contrato" || p.origem === "sem_jornada" ? rotuloSituacao(diaHoje) : p.minutos > 0 ? `${textoHorario(p.horarios)} (${duracao(p.minutos)})` : p.feriado ? `Feriado · ${p.feriado}` : "Folga"}
                {p.origem === "escala" && <span className="ml-1 text-xs text-muted-foreground">(escala do dia{p.motivoEscala ? `: ${p.motivoEscala}` : ""})</span>}
              </dd>
              {p.jornada && <dd className="text-xs text-muted-foreground">{p.jornada}</dd>}
            </div>
            <div>
              <dt className="rotulo">Trabalhado</dt>
              <dd className="mt-0.5 numero-sm">{duracao(diaHoje.trabalhado)}</dd>
            </div>
            <div>
              <dt className="rotulo">Saldo do dia</dt>
              <dd className={`mt-0.5 numero-sm ${diaHoje.saldo < 0 ? "text-red-700" : diaHoje.saldo > 0 ? "text-emerald-700" : ""}`}>
                {diaHoje.situacao === "em_andamento" ? saldoTexto(diaHoje.trabalhado - p.minutos) : saldoTexto(diaHoje.saldo)}
              </dd>
              {diaHoje.situacao === "em_andamento" && <dd className="text-xs text-muted-foreground">parcial, até agora</dd>}
            </div>
          </dl>
          <div className="border-t px-5 py-3">
            <p className="rotulo mb-2">Marcações de hoje</p>
            {diaHoje.marcacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ainda.</p>
            ) : (
              <ol className="space-y-1.5">
                {diaHoje.marcacoes.map((m) => {
                  const Icone = ICONE_TIPO[m.tipo];
                  return (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <Icone className="size-4 text-muted-foreground" aria-hidden />
                      <span className="w-12 font-semibold tabular-nums">{horaLocal(m.momento)}</span>
                      <span>{TIPO_MARCACAO_LABEL[m.tipo]}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{METODO_LABEL[m.metodo] ?? m.metodo}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {diaHoje.ocorrencias.length > 0 && (
            <ul className="space-y-1 border-t px-5 py-3 text-xs">
              {diaHoje.ocorrencias.map((o) => (
                <li key={o.codigo} className={o.grave ? "text-red-700" : "text-amber-800"}>
                  {o.texto}
                </li>
              ))}
            </ul>
          )}
        </Painel>
      </div>

      <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Saldo do mês" valor={saldoTexto(saldoMes)} tomValor={saldoMes < 0 ? "perigo" : saldoMes > 0 ? "sucesso" : undefined} detalhe="Dias fechados até hoje" href="/ponto/espelho" />
        <Indicador rotulo="Banco de horas" icone={Hourglass} valor={saldoTexto(banco.total)} tomValor={banco.total < 0 ? "perigo" : banco.total > 0 ? "sucesso" : undefined} detalhe="Saldo acumulado" href="/ponto/banco" />
        <Indicador rotulo="Faltas no mês" valor={faltasMes} tomValor={faltasMes ? "perigo" : undefined} />
        <Indicador rotulo="Atrasos no mês" valor={atrasosMes} tomValor={atrasosMes ? "atencao" : undefined} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Painel titulo="Últimos 7 dias" acao={<LinkPainel href="/ponto/espelho">Espelho do mês</LinkPainel>}>
          <ul className="border-t">
            {ultimos.map((d) => (
              <li key={d.data} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 border-b px-5 py-2 text-sm last:border-0 sm:grid-cols-[4.5rem_1fr_4rem_5rem_7rem]">
                <span className="tabular-nums">
                  <span className="text-muted-foreground">{DIAS_SEMANA_CURTO[diaSemana(d.data)]}</span> {formatarData(d.data).slice(0, 5)}
                </span>
                <PilulasMarcacoes marcacoes={d.marcacoes} data={d.data} />
                <span className="hidden text-right tabular-nums sm:block">{d.trabalhado ? duracao(d.trabalhado) : ""}</span>
                <span className={`hidden text-right tabular-nums sm:block ${d.saldo < 0 ? "text-red-700" : d.saldo > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>{d.saldo ? saldoTexto(d.saldo) : ""}</span>
                <span className="text-right">
                  <Status tom={TOM_SITUACAO[d.situacao]}>{rotuloSituacao(d)}</Status>
                </span>
              </li>
            ))}
          </ul>
        </Painel>
        <div className="space-y-4">
          <Painel titulo="PIN do relógio da filial" icone={Fingerprint} descricao="Na loja, você registra com a matrícula e este PIN.">
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              {temPin ? <Status tom="sucesso">PIN cadastrado</Status> : <Status tom="atencao">Sem PIN</Status>}
              <PinForm action={definirPin.bind(null, func.id)} nome={func.nome} temPin={temPin} />
            </div>
          </Painel>
          <Painel titulo="Meus pedidos de ajuste" icone={TimerReset} acao={<LinkPainel href="/ponto/ajustes">Ver todos</LinkPainel>}>
            {ajustes.length === 0 ? (
              <p className="border-t px-5 py-3 text-sm text-muted-foreground">Nenhum pedido aguardando o gestor.</p>
            ) : (
              <ul className="border-t text-sm">
                {ajustes.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 border-b px-5 py-2 last:border-0">
                    <span>
                      {formatarData(a.data)} · {a.acao === "anular" ? "Anular marcação" : a.tipo_marcacao ? TIPO_MARCACAO_LABEL[a.tipo_marcacao] : "Marcação"}
                      {a.horario_solicitado ? ` às ${horaLocal(a.horario_solicitado)}` : ""}
                    </span>
                    <Status tom="atencao">Pendente</Status>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      </div>
    </>
  );
}
