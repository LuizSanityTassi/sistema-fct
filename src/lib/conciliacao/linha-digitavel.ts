// Linha digitável (a que vem impressa em cima do boleto) a partir do código de barras de 44 números. Módulo puro.

const modulo10 = (num: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    const p = Number(num[i]) * peso;
    soma += Math.floor(p / 10) + (p % 10);
    peso = peso === 2 ? 1 : 2;
  }
  return (10 - (soma % 10)) % 10;
};

// arrecadação (contas de consumo, tributos): pesos 2 a 9 da direita para a esquerda
const modulo11Arrecadacao = (num: string) => {
  let soma = 0;
  let peso = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    soma += Number(num[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  if (resto === 0 || resto === 1) return 0;
  if (resto === 10) return 1;
  return 11 - resto;
};

/**
 * "34193164100015003171090003348568715218189000" → "34191.09008 03348.568712 52181.890006 3 16410001500317".
 * Boleto bancário: 5 campos (os 3 primeiros com dígito módulo 10). Arrecadação (começa com 8): 4 blocos de 11 com
 * dígito (módulo 10 ou 11 conforme o 3º número). O que não for um código de 44 números volta como veio.
 */
export function linhaDigitavel(barra: string | null | undefined): string {
  const b = (barra ?? "").replace(/\D/g, "");
  if (b.length !== 44) return barra ?? "";
  if (b[0] === "8") {
    const dv = b[2] === "6" || b[2] === "7" ? modulo10 : modulo11Arrecadacao;
    return [0, 11, 22, 33].map((i) => `${b.slice(i, i + 11)}-${dv(b.slice(i, i + 11))}`).join(" ");
  }
  const c1 = b.slice(0, 4) + b.slice(19, 24);
  const c2 = b.slice(24, 34);
  const c3 = b.slice(34, 44);
  const f = (c: string) => {
    const comDv = `${c}${modulo10(c)}`;
    return `${comDv.slice(0, 5)}.${comDv.slice(5)}`;
  };
  return `${f(c1)} ${f(c2)} ${f(c3)} ${b[4]} ${b.slice(5, 19)}`;
}
