// Conta digitada numa célula do caixa contábil ("memória de cálculo"), como numa planilha: números no formato
// brasileiro (1.234,56 · 1234,56 · 1234.56) com + − × ÷ e parênteses. Ex.: "348300+200-100" → 348.400.

export type LeituraConta = { valor: number; conta: string | null };

/** Número de um pedaço da conta: vírgula = decimal; ponto em grupos de 3 = milhar; senão ponto = decimal. */
function numeroBr(t: string) {
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

/** Texto do número para continuar a conta na célula (vírgula decimal, sem milhar). */
export const numeroParaConta = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");

/**
 * Lê o que foi digitado. Número sozinho → { valor, conta: null }; conta → { valor (2 casas), conta: o texto
 * guardado como memória }. Vazio ou inválido → null.
 */
export function lerConta(texto: string): LeituraConta | null {
  const t = texto
    .replace(/\s+/g, "")
    .replace(/^=/, "")
    .replace(/[−–]/g, "-")
    .replace(/[×x]/gi, "*")
    .replace(/÷/g, "/");
  if (!t) return null;
  let i = 0;
  const fator = (): number | null => {
    if (t[i] === "+" || t[i] === "-") {
      const sinal = t[i++] === "-" ? -1 : 1;
      const v = fator();
      return v === null ? null : sinal * v;
    }
    if (t[i] === "(") {
      i++;
      const v = soma();
      if (v === null || t[i] !== ")") return null;
      i++;
      return v;
    }
    const m = /^\d[\d.]*(?:,\d+)?/.exec(t.slice(i));
    if (!m) return null;
    i += m[0].length;
    const n = numeroBr(m[0]);
    return Number.isFinite(n) ? n : null;
  };
  const termo = (): number | null => {
    let v = fator();
    while (v !== null && (t[i] === "*" || t[i] === "/")) {
      const op = t[i++];
      const d = fator();
      if (d === null || (op === "/" && d === 0)) return null;
      v = op === "*" ? v * d : v / d;
    }
    return v;
  };
  const soma = (): number | null => {
    let v = termo();
    while (v !== null && (t[i] === "+" || t[i] === "-")) {
      const op = t[i++];
      const d = termo();
      if (d === null) return null;
      v = op === "+" ? v + d : v - d;
    }
    return v;
  };
  const v = soma();
  if (v === null || i !== t.length || !Number.isFinite(v)) return null;
  const sozinho = /^[+-]?\d[\d.]*(?:,\d+)?$/.test(t);
  return { valor: Math.round(v * 100) / 100, conta: sozinho ? null : t };
}
