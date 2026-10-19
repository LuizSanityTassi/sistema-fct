"use client";

import * as React from "react";
import { CHAVE_TEMA, TEMA_PADRAO, type Tema } from "@/lib/tema";

const EVENTO = "fct:tema";
const consultaEscuro = () => window.matchMedia("(prefers-color-scheme: dark)");

function lerTema(): Tema {
  try {
    const v = window.localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "escuro" || v === "sistema" ? v : TEMA_PADRAO;
  } catch {
    return TEMA_PADRAO;
  }
}

function aplicar(tema: Tema) {
  const escuro = tema === "escuro" || (tema === "sistema" && consultaEscuro().matches);
  const html = document.documentElement;
  html.classList.toggle("dark", escuro);
  html.style.colorScheme = escuro ? "dark" : "light";
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** Tema escolhido pelo usuário (claro, escuro ou o do sistema operacional). */
export function useTema() {
  const tema = React.useSyncExternalStore(assinar, lerTema, () => TEMA_PADRAO);

  // no modo "sistema", acompanha a troca do Windows/celular sem recarregar
  React.useEffect(() => {
    aplicar(tema);
    if (tema !== "sistema") return;
    const mq = consultaEscuro();
    const mudar = () => aplicar("sistema");
    mq.addEventListener("change", mudar);
    return () => mq.removeEventListener("change", mudar);
  }, [tema]);

  const escolher = React.useCallback((novo: Tema) => {
    try {
      window.localStorage.setItem(CHAVE_TEMA, novo);
    } catch {
      /* navegador sem armazenamento: vale só nesta página */
    }
    aplicar(novo);
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  return { tema, escolher };
}
