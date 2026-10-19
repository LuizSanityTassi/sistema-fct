"use client";

import * as React from "react";

// Aplicativo instalável (PWA): registra o service worker e guarda o pedido de instalação do Android/Chrome
// ("beforeinstallprompt"), que chega uma vez só, logo ao abrir; os botões "Instalar" usam depois.

type PedidoInstalacao = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let pedido: PedidoInstalacao | null = null;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** No layout raiz: registra o service worker (só em produção) e escuta o pedido de instalação. */
export function RegistrarApp() {
  React.useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* sem service worker o sistema funciona igual, só não instala */
      });
    }
    const guardar = (e: Event) => {
      e.preventDefault(); // não mostra a faixa padrão do Chrome: o sistema oferece no lugar certo
      pedido = e as PedidoInstalacao;
      avisar();
    };
    const instalou = () => {
      pedido = null;
      avisar();
    };
    window.addEventListener("beforeinstallprompt", guardar);
    window.addEventListener("appinstalled", instalou);
    return () => {
      window.removeEventListener("beforeinstallprompt", guardar);
      window.removeEventListener("appinstalled", instalou);
    };
  }, []);
  return null;
}

export type SituacaoApp = "instalado" | "pode-instalar" | "iphone" | "manual";

function situacaoAtual(): SituacaoApp {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "instalado";
  if (pedido) return "pode-instalar";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  return "manual";
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

/** Em que pé está a instalação neste aparelho (no servidor: "instalado", para não desenhar nada). */
export function useAppInstalavel() {
  const situacao = React.useSyncExternalStore(assinar, situacaoAtual, () => "instalado" as SituacaoApp);
  const instalar = React.useCallback(async () => {
    if (!pedido) return false;
    await pedido.prompt();
    const { outcome } = await pedido.userChoice;
    if (outcome === "accepted") pedido = null;
    avisar();
    return outcome === "accepted";
  }, []);
  return { situacao, instalar };
}
