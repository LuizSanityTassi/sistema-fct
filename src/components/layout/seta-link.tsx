"use client";

import { useLinkStatus } from "next/link";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { cn } from "cn";

/** Seta dentro de um <Link> (com `group`): anda no hover e vira um giro enquanto a próxima tela carrega. */
export function SetaLink({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (pending) return <LoaderCircle className={cn("size-4 shrink-0 animate-spin text-muted-foreground", className)} aria-hidden />;
  return <ArrowRight className={cn("size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground", className)} aria-hidden />;
}
