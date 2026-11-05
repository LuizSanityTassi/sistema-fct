// As datas de vencimento do filtro de DDA x Trier ficam guardadas no navegador até a pessoa trocar ou limpar.
// O endereço manda: com venc_de ou venc_ate nele (mesmo vazios, que é como se limpa), vale o endereço; sem nenhum, vale o guardado.
export const COOKIE_VENC = "fct_conc_venc";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Valor do cookie: "2026-11-05|2026-11-30"; um dos lados pode ficar vazio. */
export function datasDoCookie(valor: string | undefined): { de?: string; ate?: string } {
  const [de, ate] = (valor ?? "").split("|");
  return { de: de && DIA.test(de) ? de : undefined, ate: ate && DIA.test(ate) ? ate : undefined };
}

export function cookieDasDatas(de: string | undefined, ate: string | undefined) {
  const base = "path=/conciliacao; samesite=lax";
  return de || ate ? `${COOKIE_VENC}=${de ?? ""}|${ate ?? ""}; ${base}; max-age=31536000` : `${COOKIE_VENC}=; ${base}; max-age=0`;
}

export function comDatasGuardadas<T extends Record<string, string | string[] | undefined>>(sp: T, cookie: string | undefined): T {
  if ("venc_de" in sp || "venc_ate" in sp) return sp;
  const { de, ate } = datasDoCookie(cookie);
  return de || ate ? { ...sp, venc_de: de, venc_ate: ate } : sp;
}
