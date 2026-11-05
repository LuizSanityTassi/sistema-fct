"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { ArrowRight, Bell, CircleCheckBig } from "lucide-react";
import { Dica } from "@/components/ui/tooltip";
import { COR_SEVERIDADE, EVENTO_SINO, ROTULO_SEVERIDADE } from "@/lib/pendencias-visual";
import type { Severidade } from "@/lib/data/pendencias";
import { cn } from "@/lib/utils";

type Aviso = { id: string; severidade: Severidade; titulo: string; detalhe: string | null; href: string | null; created_at: string };
type Resumo = { total: number; criticas: number; itens: { id: string; severidade: Severidade; area: string; titulo: string; href: string }[]; avisos: Aviso[] };

const INTERVALO = 5 * 60_000;
const MINIMO = 60_000;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

async function buscarResumo(): Promise<Resumo | null> {
  try {
    const r = await fetch("/api/pendencias", { cache: "no-store" });
    if (!r.headers.get("content-type")?.includes("application/json")) return null;
    const corpo = (await r.json()) as Resumo & { erro?: boolean };
    // pendências deram erro: os avisos ainda valem, e o resto mantém o último número
    return r.ok ? corpo : corpo.avisos?.length ? corpo : null;
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
    // uma tela acabou de gerar um aviso (fim do envio ao Omie): aparece na hora
    const atualizar = () => puxar(true);
    document.addEventListener("visibilitychange", voltar);
    window.addEventListener(EVENTO_SINO, atualizar);
    return () => {
      vivo = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", voltar);
      window.removeEventListener(EVENTO_SINO, atualizar);
    };
  }, [pathname]);

  const marcarLidos = (ids: string[]) => {
    setResumo((r) => (r ? { ...r, avisos: r.avisos.filter((a) => !ids.includes(a.id)) } : r));
    void fetch("/api/avisos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) })
      .then(async (r) => {
        if (r.ok) return;
        const atual = await buscarResumo(); // não marcou: o aviso volta a aparecer
        if (atual) setResumo(atual);
      })
      .catch(() => undefined);
  };

  const avisos = resumo?.avisos ?? [];
  const pendencias = resumo?.total ?? 0;
  const total = pendencias + avisos.length;
  const urgente = !!resumo?.criticas || avisos.some((a) => a.severidade === "critico" || a.severidade === "alto");
  const partes = [avisos.length ? `${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"}` : "", pendencias ? `${pendencias} ${pendencias === 1 ? "pendência" : "pendências"}` : ""].filter(Boolean);
  const rotulo = resumo ? partes.join(" e ") || "Nenhuma pendência" : "Pendências";

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
                urgente ? "bg-fct-red" : "bg-foreground/80 dark:text-background",
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
            {avisos.length > 0 && (
              <div className="border-b">
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-sm font-semibold">Avisos</span>
                  {avisos.length > 1 && (
                    <button type="button" onClick={() => marcarLidos(avisos.map((a) => a.id))} className="text-xs text-fct-tinta underline">
                      marcar todos como lidos
                    </button>
                  )}
                </div>
                <ul className="max-h-72 overflow-y-auto pb-1">
                  {avisos.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", COR_SEVERIDADE[a.severidade].ponto)} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{a.titulo}</p>
                        {a.detalhe && <p className="mt-1 text-xs break-words whitespace-pre-line text-muted-foreground">{a.detalhe}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                          <span className="tabular-nums">{quando(a.created_at)}</span>
                          {a.href && (
                            <Link href={a.href} onClick={() => setAberto(false)} className="text-fct-tinta underline">
                              abrir
                            </Link>
                          )}
                          <button type="button" onClick={() => marcarLidos([a.id])} className="text-fct-tinta underline">
                            marcar como lido
                          </button>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex items-center justify-between border-b px-4 py-3">
              <Popover.Title className="text-sm font-semibold">Precisa da sua atenção</Popover.Title>
              {pendencias > 0 && <span className="text-xs text-muted-foreground tabular-nums">{pendencias}</span>}
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
                Nenhuma pendência nos módulos que você usa.
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
