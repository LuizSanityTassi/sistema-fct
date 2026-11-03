// Leitor de digital (só navegador): quem fala com o leitor USB é um programa instalado no computador da loja, que atende
// em 127.0.0.1. GET /status devolve { leitor } e POST /capturar espera o dedo e devolve { template, leitor }, com o
// código da digital em base64 (nunca a imagem).
const ENDERECO = "http://127.0.0.1:27015";

export const DEDOS: [number, string][] = [
  [1, "Polegar direito"],
  [2, "Indicador direito"],
  [3, "Médio direito"],
  [4, "Anelar direito"],
  [5, "Mínimo direito"],
  [6, "Polegar esquerdo"],
  [7, "Indicador esquerdo"],
  [8, "Médio esquerdo"],
  [9, "Anelar esquerdo"],
  [10, "Mínimo esquerdo"],
];
export const nomeDoDedo = (dedo: number) => DEDOS.find(([d]) => d === dedo)?.[1] ?? `Dedo ${dedo}`;

/** Nome do leitor ligado neste computador, ou null se o programa não estiver respondendo. */
export async function verLeitor(): Promise<string | null> {
  try {
    const r = await fetch(`${ENDERECO}/status`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const { leitor } = await r.json();
    return typeof leitor === "string" && leitor ? leitor : null;
  } catch {
    return null;
  }
}

/** Espera a pessoa colocar o dedo no leitor (até 30 segundos). */
export async function capturarDigital(): Promise<{ template: string; leitor: string }> {
  const r = await fetch(`${ENDERECO}/capturar`, { method: "POST", signal: AbortSignal.timeout(30_000) });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || typeof corpo?.template !== "string") throw new Error(corpo?.erro ?? "O leitor não conseguiu ler a digital. Tente de novo.");
  return { template: corpo.template, leitor: String(corpo.leitor ?? "") };
}
