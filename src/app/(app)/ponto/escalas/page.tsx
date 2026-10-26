import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EstadoVazio, Painel } from "@/components/layout/painel";
import { exigirAcesso } from "@/lib/auth/session";
import { apurar, lerMes, listarEquipe, mesAnterior, proximoMes, rotuloMes } from "@/lib/data/ponto";
import { DIAS_SEMANA_CURTO, diaSemana, duracao, hojeLocal, limitesMes, type ApuracaoDia, type TipoAusencia } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";
import { MarcarTodos } from "../equipe/lote-form";
import { BarraFiltrosPonto, lerFiltrosPonto } from "../_ui/filtros";
import { textoHorario } from "../_ui/resumo-jornada";
import { programarPeriodo } from "./actions";
import { EscalaForm, ID_FORM_ESCALA } from "./escala-form";

export const metadata = { title: "Escalas" };

const LIMITE = 80;
const SIGLA_AUSENCIA: Record<TipoAusencia, string> = { ferias: "Fé", afastamento: "Af", atestado: "At", licenca: "Li", abono: "Ab", folga_compensatoria: "FC" };

function Celula({ d, hoje }: { d: ApuracaoDia; hoje: string }) {
  const p = d.previsto;
  const h = (t: string | null) => (t ? (t.slice(3, 5) === "00" ? t.slice(0, 2) : t.slice(0, 5)) : "");
  let texto = "";
  let classe = "";
  if (p.origem === "fora_contrato" || p.origem === "sem_jornada") {
    texto = "—";
    classe = "text-muted-foreground/50";
  } else if (p.ausencia) {
    texto = SIGLA_AUSENCIA[p.ausencia.tipo];
    classe = "bg-violet-100 text-violet-800";
  } else if (p.minutos === 0) {
    texto = p.feriado && p.origem !== "escala" ? "Fer" : "F";
    classe = cn("bg-muted text-muted-foreground", p.origem === "escala" && "ring-1 ring-sky-400 ring-inset");
  } else {
    texto = `${h(p.horarios?.entrada ?? null)}–${h(p.horarios?.saida ?? null)}`;
    classe = p.origem === "escala" ? "bg-sky-100 text-sky-900" : "";
  }
  const titulo = `${d.data.split("-").reverse().join("/")} · ${p.ausencia ? SIGLA_AUSENCIA[p.ausencia.tipo] : p.minutos ? `${textoHorario(p.horarios)} (${duracao(p.minutos)})` : p.feriado ? `Feriado: ${p.feriado}` : "Folga"}${p.origem === "escala" ? ` · escala${p.motivoEscala ? `: ${p.motivoEscala}` : ""}` : ""}${d.falta ? " · FALTA" : ""}`;
  return (
    <td title={titulo} className={cn("h-9 min-w-11 border-r border-b px-0.5 text-center text-[10px] leading-tight whitespace-nowrap tabular-nums", classe, d.data === hoje && "outline-2 -outline-offset-2 outline-fct-tinta", d.falta && "text-red-700 line-through")}>
      {texto}
    </td>
  );
}

export default async function EscalasPage({ searchParams }: PageProps<"/ponto/escalas">) {
  const [sessao, sp] = await Promise.all([exigirAcesso("/ponto/escalas"), searchParams]);
  const filtros = lerFiltrosPonto(sp, sessao.papel === "gerente" ? sessao.branchId : null);
  const mes = lerMes(sp.mes);
  const { de, ate } = limitesMes(mes);
  const hoje = hojeLocal();
  const equipe = await listarEquipe({ filial: filtros.filial, departamento: filtros.departamento, q: filtros.q });
  const grande = equipe.length > LIMITE;
  const aps = grande ? [] : await apurar(equipe, de, ate);
  const podeEditar = sessao.papel !== "coordenador";
  const dias = aps[0]?.dias.map((d) => d.data) ?? [];
  const qs = (m: string) => `/ponto/escalas?${new URLSearchParams(Object.entries({ mes: m, filial: filtros.filial, departamento: filtros.departamento, q: filtros.q }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader
        eyebrow="Ponto"
        titulo={`Escalas · ${rotuloMes(mes)}`}
        descricao="O que cada funcionário tem previsto em cada dia: jornada normal, escala do dia (azul), folga (F), feriado (Fer) ou ausência (roxo). Marque os funcionários e programe a escala abaixo."
        acoes={
          <div className="flex gap-1">
            <Link href={qs(mesAnterior(mes))} className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted">
              ← {rotuloMes(mesAnterior(mes)).split(" ")[0]}
            </Link>
            <Link href={qs(proximoMes(mes))} className="rounded-md border px-2.5 py-1.5 text-sm hover:bg-muted">
              {rotuloMes(proximoMes(mes)).split(" ")[0]} →
            </Link>
          </div>
        }
      />
      <BarraFiltrosPonto rota="/ponto/escalas" filtros={filtros} mes={mes} />

      {grande ? (
        <Painel>
          <EstadoVazio icone={CalendarDays} titulo={`${equipe.length} funcionários neste filtro`} descricao={`Escolha uma filial (ou departamento) para ver a grade: até ${LIMITE} pessoas por vez.`} />
        </Painel>
      ) : equipe.length === 0 ? (
        <Painel>
          <EstadoVazio icone={CalendarDays} titulo="Ninguém neste filtro" compacto />
        </Painel>
      ) : (
        <Painel>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-56 border-r border-b bg-card px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    <span className="flex items-center gap-2">
                      {podeEditar && <MarcarTodos formId={ID_FORM_ESCALA} />}
                      Funcionário
                    </span>
                  </th>
                  {dias.map((d) => (
                    <th key={d} className={cn("border-r border-b px-0.5 py-1 text-center text-[10px] font-medium", [0, 6].includes(diaSemana(d)) ? "bg-muted/60 text-muted-foreground" : "text-muted-foreground")}>
                      {DIAS_SEMANA_CURTO[diaSemana(d)].slice(0, 1)}
                      <br />
                      <span className="text-xs text-foreground">{d.slice(8, 10)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aps.map((a) => (
                  <tr key={a.func.id}>
                    <th scope="row" className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left font-normal">
                      <span className="flex items-center gap-2">
                        {podeEditar && <input type="checkbox" name="ids" value={a.func.id} form={ID_FORM_ESCALA} aria-label={`Marcar ${a.func.nome}`} className="size-4 accent-fct-tinta" />}
                        <span className="min-w-0">
                          <Link href={`/ponto/espelho?funcionario=${a.func.id}&mes=${mes}`} className="block max-w-48 truncate text-sm hover:underline">
                            {a.func.nome}
                          </Link>
                          <span className="block truncate text-[11px] text-muted-foreground">{a.jornadaAtual ?? "sem jornada"}</span>
                        </span>
                      </span>
                    </th>
                    {a.dias.map((d) => (
                      <Celula key={d.data} d={d} hoje={hoje} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {podeEditar && <EscalaForm action={programarPeriodo} de={de < hoje ? hoje : de} ate={ate} />}
        </Painel>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Legenda: <span className="rounded bg-sky-100 px-1 text-sky-900">08–17</span> escala do dia · F folga · Fer feriado · <span className="rounded bg-violet-100 px-1 text-violet-800">Fé At Af Li Ab FC</span> férias, atestado, afastamento, licença, abono,
        folga compensatória · riscado em vermelho = falta.{" "}
        <Link href="/ponto/ausencias" className="underline">
          Lançar ausências
        </Link>
      </p>
    </>
  );
}
