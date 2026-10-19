"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { ArrowRight, Bell, CircleCheckBig } from "lucide-react";
import { Dica } from "@/components/ui/tooltip";
import { COR_SEVERIDADE, ROTULO_SEVERIDADE } from "@/lib/pendencias-visual";
import type { Severidade } from "@/lib/data/pendencias";
import { cn } from "@/lib/utils";

type Resumo = { total: number; criticas: number; itens: { id: string; severidade: Severidade; area: string; titulo: string; href: string }[] };

const INTERVALO = 5 * 60_000;
const MINIMO = 60_000;

async function buscarResumo(): Promise<Resumo | null> {
  try {
    const r = await fetch("/api/pendencias", { cache: "no-store" });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) return null;
    return (await r.json()) as Resumo;
  } catch {
    return null; // sem rede: mantém o último número
  }
}

/** Sino do cabeçalho: contagem de pendências (buscada no navegador, sem atrasar a página) e as mais graves. */
export function SinoPendencias() {
  const pathname = usePathname();
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const ultima = React.useRef(0);

  // ao trocar de página (depois de justificar, resolver…), a cada 5 min e quando a aba volta a ficar visível;
  // no máximo uma consulta por minuto
  React.useEffect(() => {
    let vivo = true;
    const puxar = (forcar = false) => {
      if (!forcar && Date.now() - ultima.current < MINIMO) return;
      ultima.current = Date.now();
      void buscarResumo().then((r) => {
        if (vivo && r) setResumo(r);
      });
    };
    puxar();
    const t = window.setInterval(() => puxar(true), INTERVALO);
    const voltar = () => {
      if (document.visibilityState === "visible") puxar();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", voltar);
    };
  }, [pathname]);

  const total = resumo?.total ?? 0;
  const rotulo = resumo ? (total ? `${total} ${total === 1 ? "pendência" : "pendências"}` : "Nenhuma pendência") : "Pendências";

  return (
    <Popover.Root open={aberto} onOpenChange={setAberto}>
      <Dica texto={rotulo} lado="bottom" desligada={aberto}>
        <Popover.Trigger
          aria-label={rotulo}
          className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted data-[popup-open]:text-foreground"
        >
          <Bell className="size-[18px]" aria-hidden />
          {total > 0 && (
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white ring-2 ring-background",
                resumo?.criticas ? "bg-fct-red" : "bg-foreground/80 dark:text-background",
              )}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Popover.Trigger>
      </Dica>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={8} className="z-50">
          <Popover.Popup className="w-[min(22rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-xl border bg-popover text-popover-foreground shadow-lg transition-[opacity,transform] duration-150 outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Popover.Title className="text-sm font-semibold">Precisa da sua atenção</Popover.Title>
              {total > 0 && <span className="text-xs text-muted-foreground tabular-nums">{total}</span>}
            </div>
            {!resumo ? (
              <div className="space-y-2 p-4">
                <div className="esqueleto h-4 w-3/4" />
                <div className="esqueleto h-4 w-2/3" />
                <div className="esqueleto h-4 w-1/2" />
              </div>
            ) : resumo.itens.length === 0 ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <CircleCheckBig className="size-4 text-emerald-600" aria-hidden />
                Tudo em dia nos módulos que você usa.
              </p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {resumo.itens.map((p) => (
                  <li key={p.id}>
                    <Link href={p.href} onClick={() => setAberto(false)} className="flex items-start gap-3 px-4 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", COR_SEVERIDADE[p.severidade].ponto)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="sr-only">{ROTULO_SEVERIDADE[p.severidade]}: </span>
                        <span className="block text-sm leading-snug">{p.titulo}</span>
                        <span className="text-xs text-muted-foreground">{p.area}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/pendencias"
              onClick={() => setAberto(false)}
              className="flex items-center justify-center gap-1 rounded-b-xl border-t px-4 py-2.5 text-sm font-medium transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
            >
              Abrir a central de pendências
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
