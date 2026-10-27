// Leitura do relatório do Omie "Contas por Período" (Finanças → Relatórios, exportado em Excel como tabela dinâmica):
// cabeçalho com "Minha Empresa", "Data de Previsão", "Departamento", "Grupo"… e uma coluna por tipo ("2. Contas a
// Pagar"). Na tabela dinâmica a célula só vem preenchida quando o valor muda — as de baixo herdam a de cima. Empresa
// "fechada" na tabela dinâmica vem numa linha só, com o total e sem os dias: não dá para usar (avisa).
// Roda no navegador (o arquivo passa de 10 MB; só a soma por dia × grupo × categoria vai para o servidor).

export type EmpresaFluxo = "VARELA" | "NAZÁRIO";
export const EMPRESAS_FLUXO: readonly EmpresaFluxo[] = ["VARELA", "NAZÁRIO"];
export const ehEmpresaFluxo = (v: unknown): v is EmpresaFluxo => v === "VARELA" || v === "NAZÁRIO";

export type LinhaPagar = { data: string; grupo: string; categoria: string; valor: number };
export type EmpresaLida = { empresa: EmpresaFluxo; linhas: LinhaPagar[]; contas: number; total: number; de: string; ate: string };
export type RelatorioPagar = {
  titulo: string;
  empresas: EmpresaLida[];
  /** empresas que vieram fechadas na tabela dinâmica (só o total, sem os dias) */
  fechadas: { empresa: string; total: number }[];
  avisos: string[];
  /** "Total geral" do relatório × soma lida (confere quando não há empresa fechada) */
  totalGeral: number | null;
};

const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();
const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const r2 = (v: number) => Math.round(v * 100) / 100;

export function empresaDoNome(nome: unknown): EmpresaFluxo | null {
  const n = norm(nome);
  if (n.includes("NAZARIO")) return "NAZÁRIO";
  if (n.includes("VARELA")) return "VARELA";
  return null;
}

/** dd/mm/aaaa, Date ou número de série do Excel → aaaa-mm-dd */
export function dataIso(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86_400_000)).toISOString().slice(0, 10);
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

const numero = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v ?? "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** `matriz` = linhas da primeira aba (sheet_to_json com header: 1). */
export function lerRelatorioPagar(matriz: unknown[][]): RelatorioPagar {
  const titulo = String(matriz[0]?.find((c) => !vazio(c)) ?? "").trim();
  const iCab = matriz.findIndex((l) => l?.some((c) => norm(c).startsWith("DATA DE PREVIS")));
  if (iCab < 0) throw new Error('Não achei o cabeçalho do relatório (coluna "Data de Previsão"). Exporte do Omie: Finanças → Relatórios → Contas por Período, em Excel.');
  const cab = matriz[iCab].map(norm);
  const col = (f: (c: string) => boolean) => cab.findIndex(f);
  const cEmp = col((c) => c.startsWith("MINHA EMPRESA"));
  const cData = col((c) => c.startsWith("DATA DE PREVIS"));
  const cDep = col((c) => c.startsWith("DEPARTAMENTO"));
  const cGrupo = col((c) => c === "GRUPO");
  const cCat = col((c) => c === "CATEGORIA");
  const cPagar = col((c) => c.includes("CONTAS A PAGAR"));
  if (cEmp < 0 || cPagar < 0) throw new Error('O relatório precisa ter as colunas "Minha Empresa" e "Contas a Pagar" (tipo).');
  // colunas de agrupamento = as que vêm antes das colunas de tipo/valor
  const nivel = Math.min(...cab.map((c, i) => (c.includes("CONTAS A") || c.startsWith("VALOR") ? i : Infinity)));

  const atual: unknown[] = [];
  const somas = new Map<string, { empresa: EmpresaFluxo; linha: LinhaPagar }>();
  const contas = new Map<EmpresaFluxo, number>();
  const fechadas: RelatorioPagar["fechadas"] = [];
  const avisos: string[] = [];
  const desconhecidas = new Set<string>();
  let totalGeral: number | null = null;

  for (let i = iCab + 1; i < matriz.length; i++) {
    const l = matriz[i] ?? [];
    if (l.every(vazio)) continue;
    if (norm(l[0]).startsWith("TOTAL GERAL")) {
      totalGeral = numero(l[cPagar]);
      continue;
    }
    // empresa numa linha só, sem data nem departamento: veio fechada (ou é subtotal) — guarda o total para avisar
    if (!vazio(l[cEmp]) && vazio(l[cData]) && (cDep < 0 || vazio(l[cDep]))) {
      fechadas.push({ empresa: String(l[cEmp]).trim(), total: Math.abs(numero(l[cPagar]) ?? 0) });
      continue;
    }
    for (let c = 0; c < nivel; c++) if (!vazio(l[c])) atual[c] = l[c];
    const v = numero(l[cPagar]);
    if (!v) continue;
    const empresa = empresaDoNome(atual[cEmp]);
    if (!empresa) {
      desconhecidas.add(String(atual[cEmp] ?? "").trim() || "(sem empresa)");
      continue;
    }
    const data = dataIso(atual[cData]);
    if (!data) {
      avisos.push(`Linha ${i + 1}: data de previsão inválida (${String(atual[cData] ?? "")}).`);
      continue;
    }
    const grupo = String(cGrupo >= 0 ? (atual[cGrupo] ?? "") : "").trim().slice(0, 120);
    const categoria = String(cCat >= 0 ? (atual[cCat] ?? "") : "").trim().slice(0, 120);
    const chave = `${empresa}|${data}|${grupo}|${categoria}`;
    const s = somas.get(chave) ?? { empresa, linha: { data, grupo, categoria, valor: 0 } };
    s.linha.valor -= v; // a pagar vem negativo no relatório
    somas.set(chave, s);
    contas.set(empresa, (contas.get(empresa) ?? 0) + 1);
  }

  // empresa que também veio aberta não é "fechada" (era só o subtotal dela)
  const empresas: EmpresaLida[] = [];
  for (const empresa of ["VARELA", "NAZÁRIO"] as const) {
    const linhas = [...somas.values()].filter((s) => s.empresa === empresa).map((s) => ({ ...s.linha, valor: r2(s.linha.valor) })).filter((x) => x.valor !== 0);
    if (!linhas.length) continue;
    linhas.sort((a, b) => a.data.localeCompare(b.data));
    empresas.push({ empresa, linhas, contas: contas.get(empresa) ?? 0, total: r2(linhas.reduce((t, x) => t + x.valor, 0)), de: linhas[0].data, ate: linhas[linhas.length - 1].data });
  }
  const abertas = new Set(empresas.map((e) => e.empresa));
  const soFechadas = fechadas.filter((f) => {
    const e = empresaDoNome(f.empresa);
    return !e || !abertas.has(e);
  });
  for (const f of soFechadas)
    avisos.push(`${empresaDoNome(f.empresa) ?? f.empresa} veio FECHADA no relatório (só o total, ${f.total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}, sem os dias). No Omie, abra o "+" dessa empresa na tabela dinâmica e exporte de novo.`);
  if (desconhecidas.size) avisos.push(`Empresa(s) que não são Varela nem Nazário ficaram de fora: ${[...desconhecidas].join(", ")}.`);
  if (totalGeral != null) {
    const lido = empresas.reduce((t, e) => t + e.total, 0) + soFechadas.reduce((t, f) => t + f.total, 0);
    if (Math.abs(lido - Math.abs(totalGeral)) > 1) avisos.push(`A soma lida (${r2(lido).toLocaleString("pt-BR")}) não bate com o "Total geral" do relatório (${Math.abs(totalGeral).toLocaleString("pt-BR")}).`);
  }
  return { titulo, empresas, fechadas: soFechadas, avisos, totalGeral: totalGeral == null ? null : Math.abs(totalGeral) };
}
