// CNPJ: aceita o formato numérico e o alfanumérico (vigente desde julho/2026).
// Os 12 primeiros caracteres identificam a empresa; os 2 últimos são dígitos verificadores numéricos.

export function limparCnpj(valor: string) {
  return valor.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatarCnpj(valor: string) {
  const v = limparCnpj(valor);
  if (v.length !== 14) return valor.trim();
  return `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`;
}

// Valor de cada caractere no cálculo: código ASCII menos 48 (dígitos = 0..9, letras = 17..42).
function valorCaractere(ch: string) {
  return ch.charCodeAt(0) - 48;
}

function digitoVerificador(base: string) {
  // pesos 2..9 aplicados da direita para a esquerda
  let peso = 2;
  let soma = 0;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += valorCaractere(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string) {
  const v = limparCnpj(valor);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(v)) return false;
  if (/^(.)\1{13}$/.test(v)) return false; // todos iguais
  const d1 = digitoVerificador(v.slice(0, 12));
  const d2 = digitoVerificador(v.slice(0, 12) + d1);
  return v.endsWith(`${d1}${d2}`);
}
