"use client";

import * as React from "react";
import { cookieDasDatas } from "@/lib/conciliacao/datas-filtro";

/** Guarda as datas que estão valendo na tela. Sem nenhuma (a pessoa limpou), apaga o que estava guardado. */
export function GuardarDatas({ de, ate }: { de?: string; ate?: string }) {
  React.useEffect(() => {
    document.cookie = cookieDasDatas(de, ate);
  }, [de, ate]);
  return null;
}
