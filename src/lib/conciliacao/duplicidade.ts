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
/** `valorBoleto`: valor cheio do boleto, quando a conta sobe com o desconto do vencimento (a trava compara com os dois). */
export type ContaConferir = { chave: string; codigo: string; barra: string | null; doc: string | null; venc: string | null; valor: number; valorBoleto?: number | null };
export type Bloqueio = { chave: string; tipo: "ja_na_omie" | "parecida" | "repetida"; motivo: string; codigoOmie: string | null };

/** Título sem código de barras pode estar sem a tarifa do boleto; com código de barras, só o mesmo valor. */
const DIFERENCA_SEM_BARRA = 2;
const DIFERENCA_COM_BARRA = 0.005;
const so = (s: string | null | undefined) => String(s ?? "").replace(/\D/g, "");

/**
 * Separa o que pode subir. `venc` em dd/mm/aaaa, como a Omie devolve. Boleto com código de barras diferente não é duplicata,
 * por decisão do financeiro, mesmo com fornecedor, vencimento e valor iguais. Fornecedor, vencimento e valor só barram quando
 * um dos dois lados não tem código de barras para comparar; quem barrou fica na lista para alguém conferir.
 */
export function conferirDuplicidade(contas: ContaConferir[], titulos: TituloOmie[]) {
  const porCodigo = new Map<string, string>();
  const porBarra = new Map<string, string>();
  const porFornecedor = new Map<string, { valor: number; omie: string; temBarra: boolean }[]>();
  for (const t of titulos) {
    if (t.codigo) porCodigo.set(t.codigo, t.omie);
    const b = normalizarBarra(t.barra);
    if (b) porBarra.set(b, t.omie);
    if (so(t.doc)) {
      const k = `${so(t.doc)}|${t.venc}`;
      porFornecedor.set(k, [...(porFornecedor.get(k) ?? []), { valor: t.valor, omie: t.omie, temBarra: !!b }]);
    }
  }
  const liberadas: string[] = [];
  const bloqueadas: Bloqueio[] = [];
  const barrasVistas = new Set<string>();
  /** Fornecedor, vencimento e valor já vistos na seleção, e se algum deles veio sem código de barras. */
  const iguaisVistas = new Map<string, boolean>();
  for (const c of contas) {
    const barra = normalizarBarra(c.barra);
    const noCodigo = porCodigo.get(c.codigo.slice(0, 20));
    const naBarra = barra ? porBarra.get(barra) : undefined;
    if (noCodigo || naBarra) {
      bloqueadas.push({ chave: c.chave, tipo: "ja_na_omie", motivo: "já está no Omie", codigoOmie: naBarra ?? noCodigo ?? null });
      continue;
    }
    if (barra && barrasVistas.has(barra)) {
      bloqueadas.push({ chave: c.chave, tipo: "repetida", motivo: "mesmo código de barras repetido na seleção", codigoOmie: null });
      continue;
    }
    const k = c.venc && so(c.doc) ? `${so(c.doc)}|${c.venc}` : null;
    // os dois com código de barras, e diferentes (o igual já foi barrado acima): não é duplicata
    // quem lançou à mão pode ter usado o valor cheio do boleto: compara com ele também
    const valores = c.valorBoleto != null && Math.abs(c.valorBoleto - c.valor) > 0.004 ? [c.valor, c.valorBoleto] : [c.valor];
    const igual = k ? (porFornecedor.get(k) ?? []).find((t) => !(barra && t.temBarra) && valores.some((v) => Math.abs(t.valor - v) <= (t.temBarra ? DIFERENCA_COM_BARRA : DIFERENCA_SEM_BARRA))) : undefined;
    if (igual) {
      bloqueadas.push({ chave: c.chave, tipo: "parecida", motivo: igual.temBarra ? "conta sem código de barras, e já existe título no Omie com mesmo fornecedor, vencimento e valor" : "já existe título sem código de barras no Omie com mesmo fornecedor e vencimento, e valor igual ou muito próximo", codigoOmie: igual.omie });
      continue;
    }
    const kIgual = k ? `${k}|${Math.round(c.valor * 100)}` : null;
    const vistaSemBarra = kIgual ? iguaisVistas.get(kIgual) : undefined;
    if (vistaSemBarra !== undefined && (vistaSemBarra || !barra)) {
      bloqueadas.push({ chave: c.chave, tipo: "parecida", motivo: "mesmo fornecedor, vencimento e valor repetido na seleção, sem código de barras para comparar", codigoOmie: null });
      continue;
    }
    if (barra) barrasVistas.add(barra);
    if (kIgual) iguaisVistas.set(kIgual, !!vistaSemBarra || !barra);
    liberadas.push(c.chave);
  }
  return { liberadas, bloqueadas };
}
