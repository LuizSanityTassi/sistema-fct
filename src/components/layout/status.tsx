import { cn } from "cn";
import { PONTO, TOM, type Tom } from "@/lib/tons";

/** Selo de situação padrão do sistema: pílula com a bolinha do tom. */
export function Status({ tom = "neutro", ponto = true, className, children }: { tom?: Tom; ponto?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap", TOM[tom], className)}>
      {ponto && <span className={cn("size-1.5 shrink-0 rounded-full", PONTO[tom])} aria-hidden />}
      {children}
    </span>
  );
}
