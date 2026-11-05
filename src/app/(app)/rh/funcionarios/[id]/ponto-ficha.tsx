import Link from "next/link";
import { CalendarClock, FileClock, Hourglass } from "lucide-react";
import { Indicador, LinkPainel, Painel } from "@/components/layout/painel";
import { Status } from "@/components/layout/status";
import { cancelarExtra, definirPin, liberarExtra } from "@/app/(app)/ponto/equipe/actions";
import { LiberarExtra } from "@/app/(app)/ponto/_ui/liberar-extra";
import { PinForm } from "@/app/(app)/ponto/_ui/pin-form";
import { ResumoJornada } from "@/app/(app)/ponto/_ui/resumo-jornada";
import { apurar, bancoDeHoras, chamadosDeExtraAbertos, extrasLiberadas, listarJornadas, listarVinculos, obterFuncPonto } from "@/lib/data/ponto";
import { formatarData } from "@/lib/formatos";
import { duracao, hojeLocal, saldoTexto } from "@/lib/ponto/calculo";
import { situacaoAgora } from "@/lib/ponto/situacao";
import { createClient } from "@/lib/supabase/server";

/** Aba "Ponto" da ficha do RH: jornada (com histórico), PIN, hoje, mês e banco de horas. O cadastro é o mesmo. */
export async function PontoDaFicha({ employeeId, podeEditar }: { employeeId: string; podeEditar: boolean }) {
  const func = await obterFuncPonto(employeeId);
  if (!func) return <p className="text-sm text-muted-foreground">Ponto indisponível para este funcionário.</p>;
  const agora = new Date();
  const hoje = hojeLocal(agora);
  const supabase = await createClient();
  const [[ap], [banco], jornadas, vinculos, { data: comPin }] = await Promise.all([
    apurar([func], `${hoje.slice(0, 7)}-01`, hoje, { agora }),
    bancoDeHoras([func], { agora }),
    listarJornadas(),
    listarVinculos([func.id]),
    supabase.rpc("ponto_tem_pin", { p_employees: [func.id] }),
  ]);
  const dia = ap.dias[ap.dias.length - 1];
  const s = situacaoAgora(dia, agora);
  const atual = vinculos.find((v) => v.inicio <= hoje && (!v.fim || v.fim >= hoje));
  const jornada = jornadas.find((j) => j.id === atual?.jornada_id) ?? (ap.jornadaAtual ? jornadas.find((j) => j.nome === ap.jornadaAtual) : undefined);
  const temPin = (comPin ?? []).includes(func.id);
  // a ficha só deixa editar para RH/DP e admin, os mesmos que liberam extra
  const [chamadosExtra, extras] = podeEditar ? await Promise.all([chamadosDeExtraAbertos(), extrasLiberadas([func.id])]) : [[], new Map<string, { id: string; dia: string; numero: number | null }[]>()];

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rotulo="Agora" valor={<Status tom={s.tom}>{s.texto}</Status>} />
        <Indicador rotulo="Saldo do mês" valor={saldoTexto(ap.totais.saldo)} tomValor={ap.totais.saldo < 0 ? "perigo" : ap.totais.saldo > 0 ? "sucesso" : undefined} detalhe={`${duracao(ap.totais.trabalhado)} trabalhadas`} href={`/ponto/espelho?funcionario=${func.id}`} />
        <Indicador rotulo="Banco de horas" icone={Hourglass} valor={saldoTexto(banco.total)} tomValor={banco.total < 0 ? "perigo" : banco.total > 0 ? "sucesso" : undefined} href={`/ponto/banco?funcionario=${func.id}`} />
        <Indicador rotulo="Faltas / atrasos no mês" valor={`${ap.totais.faltas} / ${ap.totais.atrasos}`} tomValor={ap.totais.faltas ? "perigo" : undefined} />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Painel titulo={`Jornada: ${jornada?.nome ?? ap.jornadaAtual ?? "não definida"}`} icone={CalendarClock} acao={<LinkPainel href={`/ponto/equipe?filial=${func.branch_id}&q=${encodeURIComponent(func.nome)}`}>Trocar</LinkPainel>}>
          <div className="border-t px-5 py-3">
            {jornada ? <ResumoJornada jornada={jornada} /> : <p className="text-sm text-muted-foreground">Sem jornada própria nem jornada padrão da filial: o ponto não gera saldo.</p>}
            {!atual && ap.jornadaAtual && <p className="mt-2 text-xs text-muted-foreground">Usando a jornada padrão da filial.</p>}
          </div>
          {vinculos.length > 0 && (
            <ul className="border-t px-5 py-3 text-xs text-muted-foreground">
              {vinculos
                .slice()
                .reverse()
                .map((v) => (
                  <li key={v.id}>
                    {jornadas.find((j) => j.id === v.jornada_id)?.nome ?? "—"}: {formatarData(v.inicio)} {v.fim ? `a ${formatarData(v.fim)}` : "em diante"}
                  </li>
                ))}
            </ul>
          )}
        </Painel>
        <Painel titulo="Registro de ponto" icone={FileClock}>
          <div className="space-y-3 border-t px-5 py-3 text-sm">
            <p className="flex items-center justify-between gap-2">
              <span>PIN do relógio da filial</span>
              <span className="flex items-center gap-2">
                {temPin ? <Status tom="sucesso">Cadastrado</Status> : <Status tom="atencao">Sem PIN</Status>}
                {podeEditar && <PinForm action={definirPin.bind(null, func.id)} nome={func.nome} temPin={temPin} compacto />}
              </span>
            </p>
            {podeEditar && (
              <p className="flex items-center justify-between gap-2">
                <span>Entrada e saída extra</span>
                <LiberarExtra action={liberarExtra.bind(null, func.id)} cancelar={cancelarExtra.bind(null, func.id)} nome={func.nome} hoje={hoje} chamados={chamadosExtra} liberadas={extras.get(func.id) ?? []} />
              </p>
            )}
            <p className="text-muted-foreground">No relógio da loja: matrícula {func.matricula ?? "(sem matrícula — cadastre na edição da ficha)"} + PIN.</p>
            <p className="flex flex-wrap gap-3">
              <Link href={`/ponto/espelho?funcionario=${func.id}`} className="text-fct-tinta underline">
                Espelho do mês
              </Link>
              <Link href={`/ponto/ajustes?novo=1&funcionario=${func.id}`} className="text-fct-tinta underline">
                Ajustar marcação
              </Link>
              <Link href={`/ponto/ausencias?filial=${func.branch_id}&q=${encodeURIComponent(func.nome)}`} className="text-fct-tinta underline">
                Ausências
              </Link>
            </p>
          </div>
        </Painel>
      </div>
    </div>
  );
}
