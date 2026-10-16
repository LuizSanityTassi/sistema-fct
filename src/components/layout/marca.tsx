import Image from "next/image";
import { cn } from "@/lib/utils";

/** Emblema da logo (trabalhadores, sol e "FCT"), fundo transparente. Proporção 520 × 462. */
export function Emblema({ largura = 48, className, prioridade = false }: { largura?: number; className?: string; prioridade?: boolean }) {
  return <Image src="/marca/fct-emblema.png" alt="Farmácias FCT" width={largura} height={Math.round((largura * 462) / 520)} priority={prioridade} className={cn("h-auto select-none", className)} />;
}

/** A onda da logo: faixa azul sobre faixa verde, mais grossa no meio. Decorativa. */
export function Onda({ className, claro = false }: { className?: string; claro?: boolean }) {
  return (
    <svg viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden className={cn("block w-full", className)}>
      <path d="M0 12 C 110 44 270 50 400 20 C 300 58 110 60 0 26 Z" fill="var(--fct-green)" />
      <path d="M0 2 C 110 34 270 40 400 10 C 290 44 110 46 0 14 Z" fill={claro ? "white" : "var(--fct-navy)"} opacity={claro ? 0.9 : 1} />
    </svg>
  );
}

/** Sol da logo: semicírculo amarelo que sobe atrás do conteúdo. Decorativo. */
export function Sol({ className }: { className?: string }) {
  return <div aria-hidden className={cn("pointer-events-none rounded-full bg-fct-yellow", className)} />;
}
