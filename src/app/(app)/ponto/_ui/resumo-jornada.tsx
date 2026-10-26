import { DIAS_SEMANA_CURTO, duracao, minutosPrevistos, type JornadaModelo } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";

const h = (t: string | null) => (t ? t.slice(0, 5) : "");

/** Horário de um dia: "08:00–12:00 · 13:00–17:48". */
export function textoHorario(d: { entrada: string | null; intervalo_inicio: string | null; intervalo_fim: string | null; saida: string | null } | null) {
  if (!d?.entrada || !d.saida) return "Folga";
  return d.intervalo_inicio && d.intervalo_fim ? `${h(d.entrada)}–${h(d.intervalo_inicio)} · ${h(d.intervalo_fim)}–${h(d.saida)}` : `${h(d.entrada)}–${h(d.saida)}`;
}

/** Dias do modelo em linhas compactas (Seg 08:00–12:00 · 13:00–17:48  8:48). */
export function ResumoJornada({ jornada, className }: { jornada: Pick<JornadaModelo, "tipo" | "ciclo_dias" | "dias">; className?: string }) {
  const qtd = jornada.tipo === "semanal" ? 7 : (jornada.ciclo_dias ?? jornada.dias.length);
  const ordem = jornada.tipo === "semanal" ? [1, 2, 3, 4, 5, 6, 0] : Array.from({ length: qtd }, (_, i) => i);
  return (
    <ul className={cn("grid gap-0.5 text-xs", className)}>
      {ordem.map((pos) => {
        const d = jornada.dias.find((x) => x.posicao === pos);
        const folga = !d || d.folga;
        return (
          <li key={pos} className={cn("grid grid-cols-[2.5rem_1fr_auto] gap-2 tabular-nums", folga && "text-muted-foreground")}>
            <span className="font-medium">{jornada.tipo === "semanal" ? DIAS_SEMANA_CURTO[pos] : `D${pos + 1}`}</span>
            <span>{folga ? "Folga" : textoHorario(d)}</span>
            <span>{folga ? "" : duracao(minutosPrevistos(d))}</span>
          </li>
        );
      })}
    </ul>
  );
}
