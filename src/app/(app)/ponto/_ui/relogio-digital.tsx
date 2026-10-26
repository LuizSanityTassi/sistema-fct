"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });

/** Relógio de Brasília que anda a cada segundo (só no navegador, para não divergir do servidor). */
export function RelogioDigital({ className, grande }: { className?: string; grande?: boolean }) {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={cn("text-center", className)} aria-live="off">
      <p className={cn("font-semibold tabular-nums tracking-tight", grande ? "text-6xl sm:text-7xl" : "text-5xl")}>{agora ? fmtHora.format(agora) : "--:--:--"}</p>
      <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">{agora ? fmtData.format(agora) : " "}</p>
    </div>
  );
}
