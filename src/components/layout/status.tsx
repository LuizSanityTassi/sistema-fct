import { cn } from "cn";
import { PONTO, TOM, type Tom } from "@/lib/tons";

/** Bolinha de situação (no lugar de 🟢🟡🔴). Com `rotulo`, o leitor de tela lê o significado. */
export function Ponto({ tom, rotulo, className }: { tom: Tom; rotulo?: string; className?: string }) {
  return (
    <span
      role={rotulo ? "img" : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
      className={cn("inline-block size-2 shrink-0 rounded-full align-middle", PONTO[tom], className)}
    />
  );
}

/** Selo de situação padrão do sistema: pílula com a bolinha do tom. */
export function Status({ tom = "neutro", ponto = true, className, children }: { tom?: Tom; ponto?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap", TOM[tom], className)}>
      {ponto && <span className={cn("size-1.5 shrink-0 rounded-full", PONTO[tom])} aria-hidden />}
      {children}
    </span>
  );
}
