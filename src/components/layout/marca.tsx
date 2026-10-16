import Image from "next/image";
import { cn } from "@/lib/utils";

/** Emblema da logo (trabalhadores, sol e "FCT"), fundo transparente. Proporção 520 × 462. */
export function Emblema({ largura = 48, className, prioridade = false }: { largura?: number; className?: string; prioridade?: boolean }) {
  return <Image src="/marca/fct-emblema.png" alt="Farmácias FCT" width={largura} height={Math.round((largura * 462) / 520)} priority={prioridade} className={cn("h-auto select-none", className)} />;
}

const CORES_ONDA = {
  /** as cores do desenho da logo */
  logo: ["var(--fct-navy)", "var(--fct-green)"],
  /** sobre fundo vermelho: tinta por cima, amarelo por baixo */
  vermelho: ["var(--fct-tinta)", "var(--fct-yellow)"],
  /** sobre fundo escuro: vermelho por cima, amarelo por baixo */
  escuro: ["var(--fct-red)", "var(--fct-yellow)"],
} as const;

/** A onda da logo: duas faixas, mais grossas no meio. Decorativa. */
export function Onda({ className, tom = "logo" }: { className?: string; tom?: keyof typeof CORES_ONDA }) {
  const [cima, baixo] = CORES_ONDA[tom];
  return (
    <svg viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden className={cn("block w-full", className)}>
      <path d="M0 12 C 110 44 270 50 400 20 C 300 58 110 60 0 26 Z" fill={baixo} />
      <path d="M0 2 C 110 34 270 40 400 10 C 290 44 110 46 0 14 Z" fill={cima} />
    </svg>
  );
}
