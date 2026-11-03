import Link from "next/link";
import { CircleCheckBig, Clock, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { SetaLink } from "@/components/layout/seta-link";
import { Status } from "@/components/layout/status";
import type { AreaPendencia, Pendencia } from "@/lib/data/pendencias";
import { nivelDaPendencia, ORDEM_NIVEL, ROTULO_NIVEL, TOM_NIVEL, type NivelPrioridade } from "@/lib/pendencias-visual";
import { pluralizar } from "@/lib/formatos";
import { TEXTO } from "@/lib/tons";

const ICONE_NIVEL: Record<NivelPrioridade, LucideIcon> = { critico: OctagonAlert, atencao: TriangleAlert, vencendo: Clock, em_dia: CircleCheckBig };
const BORDA_NIVEL: Record<NivelPrioridade, string> = { critico: "border-t-red-600", atencao: "border-t-orange-500", vencendo: "border-t-amber-400", em_dia: "border-t-emerald-500" };

export type ResumoNivel = { nivel: NivelPrioridade; quantidade: number; texto: string; unidade: string };

/** O número de cada nível é de assuntos (e não a soma dos itens): uma mesma quebra pode estar em mais de um assunto. */
export function resumirNiveis(pendencias: Pendencia[], modulos: { area: AreaPendencia }[]): ResumoNivel[] {
  const comPendencia = new Set(pendencias.map((p) => p.area));
  const emDia = modulos.filter((m) => !comPendencia.has(m.area)).map((m) => m.area);
  return ORDEM_NIVEL.map((nivel) => {
    if (nivel === "em_dia") return { nivel, quantidade: emDia.length, texto: emDia.join(", ") || "Nenhum módulo sem pendência", unidade: emDia.length === 1 ? "módulo" : "módulos" };
    const itens = pendencias.filter((p) => nivelDaPendencia(p) === nivel);
    return { nivel, quantidade: itens.length, texto: itens[0] ? `${itens[0].titulo}${itens.length > 1 ? ` e mais ${itens.length - 1}` : ""}` : "Nada aqui agora", unidade: itens.length === 1 ? "assunto" : "assuntos" };
  });
}

/** Os 4 níveis lado a lado; cada um abre a central já filtrada. A cor só aparece quando há algo no nível. */
export function NiveisPrioridade({ resumo, ativo, className }: { resumo: ResumoNivel[]; ativo?: NivelPrioridade | ""; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-2 lg:grid-cols-4", className)}>
      {resumo.map(({ nivel, quantidade, texto, unidade }) => {
        const Icone = ICONE_NIVEL[nivel];
        const aceso = quantidade > 0;
        return (
          <li key={nivel} className="min-w-0">
            <Link
              href={`/pendencias?nivel=${nivel}`}
              aria-current={ativo === nivel ? "page" : undefined}
              aria-label={`${ROTULO_NIVEL[nivel]}: ${pluralizar(quantidade, unidade, unidade)}. ${texto}`}
              className={cn("cartao-interativo group flex h-full flex-col rounded-lg border border-t-[3px] bg-card p-3", aceso ? BORDA_NIVEL[nivel] : "border-t-border", ativo === nivel && "ring-2 ring-ring")}
            >
              <span className={cn("flex items-center gap-1.5 text-xs font-semibold", aceso ? TEXTO[TOM_NIVEL[nivel]] : "text-muted-foreground")}>
                <Icone className="size-3.5 shrink-0" aria-hidden />
                {ROTULO_NIVEL[nivel]}
                <SetaLink className="ml-auto size-3.5" />
              </span>
              <span className="mt-1.5 flex items-baseline gap-1.5">
                <span className={cn("numero", !aceso && "text-muted-foreground/60")}>{quantidade}</span>
                <span className="text-xs text-muted-foreground">{unidade}</span>
              </span>
              <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{texto}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** As prioridades uma a uma, da mais grave para a menos grave; cada linha abre a tela já filtrada. */
export function ListaPrioridades({ pendencias }: { pendencias: Pendencia[] }) {
  return (
    <ul className="divide-y border-t">
      {pendencias.map((p) => {
        const nivel = nivelDaPendencia(p);
        const Icone = ICONE_NIVEL[nivel];
        return (
          <li key={p.id}>
            <Link href={p.href} className="group flex items-center gap-3 px-5 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 active:bg-muted">
              <Icone className={cn("size-4 shrink-0", TEXTO[TOM_NIVEL[nivel]])} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.titulo}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {p.area}
                  {p.detalhe ? ` · ${p.detalhe}` : ""}
                </span>
              </span>
              <Status tom={TOM_NIVEL[nivel]} className="hidden sm:inline-flex">
                {ROTULO_NIVEL[nivel]}
              </Status>
              <span className="sr-only sm:hidden">{ROTULO_NIVEL[nivel]}</span>
              <SetaLink />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
