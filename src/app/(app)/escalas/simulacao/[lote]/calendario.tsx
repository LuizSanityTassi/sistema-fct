"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AvisoSucesso, ErroFormulario, SelectNativo } from "@/components/form/campo";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ROTULO_DIA, ROTULO_FUNCAO, diasComMesmoHorario, diasDoPeriodo, hora, minutos, rotuloData, type DiaCobertura, type PeriodoEscala, type PessoaEscala, type Turno } from "@/lib/escalas/motor";
import { celula } from "@/lib/escalas/resumo";
import { cn } from "@/lib/utils";
import { ajustarDia } from "../../actions";

type Props = {
  simId: string;
  ano: number;
  mes: number;
  /** 1º dia do período (nulo nas escalas antigas, do mês civil) */
  inicio: string | null;
  jornadaSemanal: number;
  equipe: PessoaEscala[];
  cobertura: DiaCobertura[];
  abertura: Record<string, string>;
  editavel: boolean;
};

const COR: Record<string, string> = {
  trabalho: "bg-emerald-50 text-emerald-900",
  folga: "bg-amber-100 text-amber-900 font-semibold",
  fechado: "bg-muted text-muted-foreground",
  afastamento: "bg-violet-100 text-violet-800",
  inativo: "bg-muted text-muted-foreground",
};

function dica(p: PessoaEscala, t: Turno, periodo: PeriodoEscala) {
  const data = `${rotuloData(periodo, t.data)} (${ROTULO_DIA[t.dia]})`;
  if (t.status !== "trabalho") return `${p.nome} · ${data} · ${t.status}${t.ajustado ? " · ajuste manual" : ""}`;
  const almoco = t.intervaloInicio ? ` · almoço ${t.intervaloInicio}–${t.intervaloFim}` : " · sem almoço";
  return `${p.nome} · ${data} · entrada ${t.inicio}${almoco} · saída ${t.fim} · ${t.horas.toFixed(1)} h${t.ajustado ? " · ajuste manual" : ""}`;
}

/** Calendário do mês (uma linha por pessoa). Clique num dia aberto para trocar folga ou horário. */
export function Calendario({ simId, ano, mes, inicio, jornadaSemanal, equipe, cobertura, abertura, editavel }: Props) {
  const periodo: PeriodoEscala = { ano, mes, inicio };
  // mês de cada dia do período (o período da folha atravessa dois meses)
  const mesDoDia = new Map(diasDoPeriodo(periodo).map((d) => [d.data, d]));
  const router = useRouter();
  const [aberto, setAberto] = React.useState<{ p: PessoaEscala; t: Turno } | null>(null);
  const [status, setStatus] = React.useState<"trabalho" | "folga">("trabalho");
  const [erro, setErro] = React.useState<string | undefined>();
  const [aviso, setAviso] = React.useState<string | undefined>();
  const [replicar, setReplicar] = React.useState(true);
  const [pendente, iniciar] = React.useTransition();
  const dias = cobertura.map((c) => c.data);
  const abertoNoDia = new Map(cobertura.map((c) => [c.data, c.aberto]));
  // outros dias da pessoa com o mesmo horário do dia clicado (recebem o novo horário junto, se marcado)
  const iguais = aberto ? diasComMesmoHorario({ equipe, cobertura }, aberto.p.id, aberto.t.data) : [];

  const abrir = (p: PessoaEscala, t: Turno) => {
    setAberto({ p, t });
    setStatus(t.status === "folga" ? "folga" : "trabalho");
    setReplicar(true);
    setErro(undefined);
  };
  const salvar = (fd: FormData) => {
    if (!aberto) return;
    const v = (n: string) => String(fd.get(n) ?? "");
    iniciar(async () => {
      const r = await ajustarDia(
        simId,
        {
          pessoaId: aberto.p.id,
          data: aberto.t.data,
          status,
          inicio: v("inicio"),
          fim: v("fim"),
          intervaloInicio: v("intervaloInicio"),
          intervaloFim: v("intervaloFim"),
        },
        status === "trabalho" && replicar && iguais.length > 0,
      );
      if (r.erro) {
        setErro(r.erro);
        return;
      }
      setAberto(null);
      setAviso(r.ok);
      router.refresh();
    });
  };

  // valores sugeridos no diálogo quando o dia está de folga
  const padrao = (() => {
    if (!aberto) return { inicio: "", fim: "", ii: "", fi: "" };
    const { p, t } = aberto;
    if (t.status === "trabalho" && t.inicio) return { inicio: t.inicio, fim: t.fim ?? "", ii: t.intervaloInicio ?? "", fi: t.intervaloFim ?? "" };
    const ini = minutos(abertura[t.dia] || "08:00");
    const horas = Number(p.horasDia || jornadaSemanal / 5);
    const int = Number(p.intervaloMin ?? 60);
    const almoco = ini + Math.round((horas * 60 - int) / 2);
    return { inicio: hora(ini), fim: hora(ini + horas * 60 + int), ii: int ? hora(almoco) : "", fi: int ? hora(almoco + int) : "" };
  })();

  return (
    <>
      {aviso && (
        <div className="px-5 pb-2">
          <AvisoSucesso mensagem={aviso} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-52 border-r border-b bg-card px-3 py-2 text-left font-medium text-muted-foreground">Pessoa / função</th>
              {cobertura.map((c) => {
                const virada = c.data === 1 && dias[0] !== 1;
                return (
                  <th
                    key={c.data}
                    title={rotuloData(periodo, c.data)}
                    className={cn("min-w-11 border-r border-b px-0.5 py-1 text-center font-medium", !abertoNoDia.get(c.data) && "bg-muted/60 text-muted-foreground", virada && "border-l-2 border-l-foreground/40")}
                  >
                    <span className="block text-sm text-foreground">{c.data}</span>
                    {ROTULO_DIA[c.dia]}
                    {(virada || c === cobertura[0]) && <span className="block text-[10px] text-muted-foreground">{String(mesDoDia.get(c.data)?.mes ?? mes).padStart(2, "0")}</span>}
                  </th>
                );
              })}
              <th className="border-b px-2 py-1 text-right font-medium text-muted-foreground">Horas</th>
            </tr>
          </thead>
          <tbody>
            {equipe.map((p) => (
              <tr key={p.id}>
                <th scope="row" className="sticky left-0 z-10 border-r border-b bg-card px-3 py-1 text-left font-normal">
                  <span className="block max-w-48 truncate text-sm font-medium">{p.nome}</span>
                  <span className="text-muted-foreground">
                    {ROTULO_FUNCAO[p.funcao]}
                    {p.situacao !== "ativo" ? ` · ${p.situacao}` : ""}
                  </span>
                </th>
                {p.turnos.map((t) => {
                  const pode = editavel && !!abertoNoDia.get(t.data) && p.situacao === "ativo";
                  return (
                    <td key={t.data} className={cn("h-10 border-r border-b p-0 text-center tabular-nums", COR[t.status])}>
                      <button
                        type="button"
                        disabled={!pode}
                        onClick={() => abrir(p, t)}
                        title={dica(p, t, periodo)}
                        aria-label={`${pode ? "Ajustar" : "Ver"} ${dica(p, t, periodo)}`}
                        className={cn("h-full w-full px-0.5", pode && "cursor-pointer hover:bg-black/5", t.ajustado && "ring-2 ring-sky-400 ring-inset")}
                      >
                        {celula(t.status, t.inicio)}
                      </button>
                    </td>
                  );
                })}
                <td className="border-b px-2 text-right font-medium tabular-nums">{p.totalHoras.toFixed(0)} h</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 pt-2 pb-4 text-xs text-muted-foreground">
        Hora = entrada · F folga · — loja fechada · A afastado · I inativo · contorno azul = ajuste manual. Passe o mouse para ver almoço e saída
        {editavel ? "; clique num dia aberto para ajustar." : "."}
      </p>

      <Dialog open={!!aberto} onOpenChange={(o) => !o && setAberto(null)}>
        <DialogContent className="sm:max-w-md">
          {aberto && (
            <>
              <DialogHeader>
                <DialogTitle>{aberto.p.nome}</DialogTitle>
                <DialogDescription>
                  {ROTULO_DIA[aberto.t.dia]} · {rotuloData(periodo, aberto.t.data)}/{mesDoDia.get(aberto.t.data)?.ano ?? ano} · {ROTULO_FUNCAO[aberto.p.funcao]}
                </DialogDescription>
              </DialogHeader>
              <form action={salvar} className="grid gap-3">
                <ErroFormulario mensagem={erro} />
                <label className="grid gap-1 text-sm">
                  <span className="font-medium">Neste dia</span>
                  <SelectNativo value={status} onChange={(e) => setStatus(e.target.value as "trabalho" | "folga")}>
                    <option value="trabalho">Trabalha</option>
                    <option value="folga">Folga</option>
                  </SelectNativo>
                </label>
                {status === "trabalho" ? (
                  <div key={`${aberto.p.id}-${aberto.t.data}`} className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Entrada</span>
                      <Input type="time" name="inicio" defaultValue={padrao.inicio} required />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Saída final</span>
                      <Input type="time" name="fim" defaultValue={padrao.fim} required />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Saída para almoço</span>
                      <Input type="time" name="intervaloInicio" defaultValue={padrao.ii} />
                    </label>
                    <label className="grid gap-1 text-sm">
                      <span className="font-medium">Retorno do almoço</span>
                      <Input type="time" name="intervaloFim" defaultValue={padrao.fi} />
                    </label>
                  </div>
                ) : null}
                {status === "trabalho" && iguais.length > 0 && (
                  <label className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                    <input type="checkbox" checked={replicar} onChange={(e) => setReplicar(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                    <span>
                      Aplicar também nos outros <strong>{iguais.length} dia(s)</strong> em que {aberto.p.nome.split(" ")[0]} trabalha no mesmo horário ({aberto.t.inicio} às {aberto.t.fim}):{" "}
                      <span className="tabular-nums">{iguais.map((d) => rotuloData(periodo, d)).join(", ")}</span>.
                      <span className="block text-xs text-sky-800/80">
                        O almoço de cada dia anda o mesmo tanto que o deste dia (o revezamento continua). Folgas e dias com outro horário (ex.: sábado) não mudam.
                      </span>
                    </span>
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  {status === "folga"
                    ? aberto.t.status === "trabalho"
                      ? "A folga que já existia nesta semana vira dia de trabalho (com o horário de abertura), para manter os cinco dias."
                      : "O dia continua de folga."
                    : "Horas, cobertura e pendências são recalculadas ao salvar. Depois clique em “Atualizar pendências” para registrar o que mudou."}
                </p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAberto(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={pendente}>
                    {pendente ? "Salvando…" : "Salvar ajuste"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
