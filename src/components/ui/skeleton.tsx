import { cn } from "cn";

/** Bloco cinza com brilho, no lugar do conteúdo enquanto carrega. */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={cn("esqueleto", className)} />;
}
