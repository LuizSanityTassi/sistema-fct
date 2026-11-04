// Leitor de digital (só navegador): quem fala com o leitor USB é um programa instalado no computador da loja, que atende
// em 127.0.0.1. GET /status devolve { leitor, leitorId, erro } e POST /capturar abre a janela do leitor e devolve { template,
// leitor }, com o código da digital em base64 (nunca a imagem). Para bater o ponto, POST /parear guarda o segredo do computador
// POST /esperar espera o dedo e guarda a leitura na memória, e POST /identificar compara essa leitura com as digitais cifradas
// da filial e devolve { employee, dedo, assinatura }.
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
export async function verLeitor(): Promise<{ leitor: string | null; leitorId?: string | null; versao?: number; erro?: string }> {
  try {
    const r = await fetch(`${ENDERECO}/status`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return { leitor: null, erro: SEM_AGENTE };
    const { leitor, leitorId, versao, erro } = await r.json();
    return typeof leitor === "string" && leitor
      ? { leitor, leitorId: typeof leitorId === "string" ? leitorId : null, versao: typeof versao === "number" ? versao : 1 }
      : { leitor: null, erro: typeof erro === "string" ? erro : SEM_AGENTE };
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

async function enviar(caminho: string, corpo: unknown, tempoMs: number) {
  try {
    const r = await fetch(`${ENDERECO}${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(tempoMs) });
    return { ok: r.ok, corpo: await r.json().catch(() => null) };
  } catch {
    throw new Error("O programa do leitor não respondeu. Confira se ele está aberto neste computador.");
  }
}

/** Guarda neste computador o segredo que o portal entregou ao ativar o leitor. */
export async function parearLeitor(id: string, segredo: string): Promise<void> {
  const { ok, corpo } = await enviar("/parear", { id, segredo }, 5000);
  if (!ok) throw new Error(corpo?.erro ?? "Não consegui ativar o leitor neste computador.");
}

/** A partir desta versão o programa do leitor identifica a pessoa só pelo dedo. */
export const VERSAO_SO_DEDO = 2;

/** Espera um dedo no leitor (até 15 segundos): true = tem dedo lido, guardado no programa; false = ninguém colocou o dedo. */
export async function esperarDedo(): Promise<boolean> {
  let r: Response;
  try {
    r = await fetch(`${ENDERECO}/esperar`, { method: "POST", signal: AbortSignal.timeout(25_000) });
  } catch {
    throw new Error("O programa do leitor não respondeu. Confira se ele está aberto neste computador.");
  }
  // outra leitura ainda em andamento (a tela acabou de abrir, por exemplo): é só esperar um pouco
  if (r.status === 409) {
    await new Promise((fim) => setTimeout(fim, 1000));
    return false;
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(corpo?.erro ?? "O leitor não conseguiu ler o dedo. Tente de novo.");
  return corpo?.lido === true;
}

export type LeituraDigital = { desafio: string; nonce: string; digitais: { employee: string; dedo: number; iv: string; cifra: string }[] };

/** Compara o dedo lido com as digitais da filial e devolve de quem é, com a assinatura que o portal confere. */
export async function identificarDigital(leitura: LeituraDigital): Promise<{ employee: string; dedo: number; assinatura: string }> {
  const { ok, corpo } = await enviar("/identificar", { desafio: leitura.desafio, nonce: leitura.nonce, digitais: leitura.digitais }, 15_000);
  if (!ok || typeof corpo?.assinatura !== "string" || typeof corpo?.dedo !== "number" || typeof corpo?.employee !== "string") throw new Error(corpo?.erro ?? "Não consegui conferir a digital. Tente de novo.");
  return { employee: corpo.employee, dedo: corpo.dedo, assinatura: corpo.assinatura };
}
