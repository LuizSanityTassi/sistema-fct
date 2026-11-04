// Trava contra duplicidade no Omie (puro, roda no servidor e na tela). Nada sobe sem passar por aqui: o UpsertContaPagar
// só reconhece o código de integração, e título antigo pode ter outro código com o mesmo boleto.

/**
 * Código de barras em 44 dígitos. O Omie guarda ora o código de barras, ora a linha digitável (47 dígitos em boleto,
 * 48 em arrecadação), com ou sem pontos: comparar o texto deixa passar o mesmo boleto.
 */
export function normalizarBarra(valor: string | null | undefined): string {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length === 47) return d.slice(0, 4) + d[32] + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31);
  if (d.length === 48) return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47);
  return d;
}

export type TituloOmie = { codigo: string; barra: string; omie: string; doc: string; venc: string; valor: number };
export type ContaConferir = { chave: string; codigo: string; barra: string | null; doc: string | null; venc: string | null; valor: number };
export type Bloqueio = { chave: string; tipo: "ja_na_omie" | "parecida" | "repetida"; motivo: string; codigoOmie: string | null };

const DIFERENCA_PARECIDA = 2;
const so = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");
const chaveParecida = (doc: string, venc: string) => `${doc}|${venc}`;

/** Separa o que pode subir. `venc` em dd/mm/aaaa, como a Omie devolve. */
export function conferirDuplicidade(contas: ContaConferir[], titulos: TituloOmie[]) {
  const porCodigo = new Map<string, string>();
  const porBarra = new Map<string, string>();
  const semBarra = new Map<string, { valor: number; omie: string }[]>();
  for (const t of titulos) {
    if (t.codigo) porCodigo.set(t.codigo, t.omie);
    const b = normalizarBarra(t.barra);
    if (b) porBarra.set(b, t.omie);
    else if (so(t.doc)) {
      const k = chaveParecida(so(t.doc), t.venc);
      semBarra.set(k, [...(semBarra.get(k) ?? []), { valor: t.valor, omie: t.omie }]);
    }
  }
  const liberadas: string[] = [];
  const bloqueadas: Bloqueio[] = [];
  const vistas = new Set<string>();
  for (const c of contas) {
    const barra = normalizarBarra(c.barra);
    const noCodigo = porCodigo.get(c.codigo.slice(0, 20));
    const naBarra = barra ? porBarra.get(barra) : undefined;
    if (noCodigo || naBarra) {
      bloqueadas.push({ chave: c.chave, tipo: "ja_na_omie", motivo: "já está no Omie", codigoOmie: naBarra ?? noCodigo ?? null });
      continue;
    }
    if (barra && vistas.has(barra)) {
      bloqueadas.push({ chave: c.chave, tipo: "repetida", motivo: "mesmo código de barras repetido na seleção", codigoOmie: null });
      continue;
    }
    const igual = c.venc ? (semBarra.get(chaveParecida(so(c.doc), c.venc)) ?? []).find((t) => Math.abs(t.valor - c.valor) <= DIFERENCA_PARECIDA) : undefined;
    if (igual) {
      bloqueadas.push({ chave: c.chave, tipo: "parecida", motivo: "título sem código de barras no Omie com mesmo fornecedor, vencimento e valor", codigoOmie: igual.omie });
      continue;
    }
    if (barra) vistas.add(barra);
    liberadas.push(c.chave);
  }
  return { liberadas, bloqueadas };
}
