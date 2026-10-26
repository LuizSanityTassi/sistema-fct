import { KeyRound, MapPin, Monitor, PencilLine, Smartphone, type LucideIcon } from "lucide-react";
import { local, METODO_LABEL, TIPO_MARCACAO_CURTO, type Marcacao } from "@/lib/ponto/calculo";
import { cn } from "@/lib/utils";
import { ICONE_TIPO_CLIENTE } from "./icones-tipo";

export const ICONE_TIPO = ICONE_TIPO_CLIENTE;
const ICONE_METODO: Record<string, LucideIcon> = { web: Monitor, celular: Smartphone, relogio_pin: KeyRound, ajuste: PencilLine };

export function horaLocal(iso: string) {
  const l = local(iso);
  return `${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
}

/** Marcações em pílulas: 08:02 · 12:00 · 13:01 · 17:50 (anuladas riscadas, ajustes com lápis). */
export function PilulasMarcacoes({ marcacoes, data, className }: { marcacoes: (Marcacao & { latitude?: number | null })[]; data?: string; className?: string }) {
  if (!marcacoes.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {marcacoes.map((m) => {
        const Icone = ICONE_METODO[m.metodo];
        const outroDia = data && local(m.momento).data !== data;
        return (
          <span
            key={m.id}
            title={`${TIPO_MARCACAO_CURTO[m.tipo]} · ${METODO_LABEL[m.metodo] ?? m.metodo}${m.nsr ? ` · nº ${m.nsr}` : ""}${m.anulada ? ` · ANULADA${m.anulada_motivo ? `: ${m.anulada_motivo}` : ""}` : ""}${outroDia ? " · dia seguinte" : ""}`}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs tabular-nums",
              m.anulada ? "border-dashed text-muted-foreground line-through" : m.origem === "ajuste" ? "border-violet-200 bg-violet-50 text-violet-800" : "bg-background",
            )}
          >
            {horaLocal(m.momento)}
            {outroDia && <sup>+1</sup>}
            {Icone && m.metodo !== "web" && <Icone className="size-3 opacity-60" aria-hidden />}
            {m.latitude != null && <MapPin className="size-3 opacity-60" aria-hidden />}
          </span>
        );
      })}
    </span>
  );
}
