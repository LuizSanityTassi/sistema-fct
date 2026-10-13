export function limparCpf(valor: string) {
  return valor.replace(/\D/g, "");
}

export function formatarCpf(valor: string) {
  const d = limparCpf(valor);
  if (d.length !== 11) return valor.trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function cpfValido(valor: string) {
  const d = limparCpf(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const digito = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10]);
}

/** Mostra só os 3 últimos dígitos (ex.: ***.***.***-12) para quem não precisa ver o CPF inteiro. */
export function mascararCpf(valor: string | null | undefined) {
  if (!valor) return "—";
  const d = limparCpf(valor);
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : "***";
}
