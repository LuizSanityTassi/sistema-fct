// Leitor de digital (só navegador): quem fala com o leitor USB é um programa instalado no computador da loja, que atende
// em 127.0.0.1. GET /status devolve { leitor, erro } e POST /capturar abre a janela do leitor e devolve { template,
// leitor }, com o código da digital em base64 (nunca a imagem).
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

const SEM_AGENTE = "Leitor não encontrado neste computador. Falta instalar o agente do leitor (ou ele não está aberto).";

/** Nome do leitor ligado neste computador ou, sem ele, o motivo. */
export async function verLeitor(): Promise<{ leitor: string | null; erro?: string }> {
  try {
    const r = await fetch(`${ENDERECO}/status`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { leitor: null, erro: SEM_AGENTE };
    const { leitor, erro } = await r.json();
    return typeof leitor === "string" && leitor ? { leitor } : { leitor: null, erro: typeof erro === "string" ? erro : SEM_AGENTE };
  } catch {
    return { leitor: null, erro: SEM_AGENTE };
  }
}

/** Abre a janela do leitor e espera a pessoa terminar o cadastro (até 3 minutos). */
export async function capturarDigital(): Promise<{ template: string; leitor: string }> {
  const r = await fetch(`${ENDERECO}/capturar`, { method: "POST", signal: AbortSignal.timeout(180_000) });
  const corpo = await r.json().catch(() => null);
  if (!r.ok || typeof corpo?.template !== "string") throw new Error(corpo?.erro ?? "O leitor não conseguiu ler a digital. Tente de novo.");
  return { template: corpo.template, leitor: String(corpo.leitor ?? "") };
}
