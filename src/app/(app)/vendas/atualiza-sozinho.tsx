"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os números da tela a cada 10 minutos (o ritmo do robô de hoje) e quando a aba volta a ficar visível
 * depois desse tempo. */
export function AtualizaSozinho({ minutos = 10 }: { minutos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const intervalo = minutos * 60_000;
    let ultima = Date.now();
    const puxar = () => {
      ultima = Date.now();
      router.refresh();
    };
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") puxar();
    }, intervalo);
    const voltar = () => {
      if (document.visibilityState === "visible" && Date.now() - ultima >= intervalo) puxar();
    };
    document.addEventListener("visibilitychange", voltar);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", voltar);
    };
  }, [router, minutos]);
  return null;
}
