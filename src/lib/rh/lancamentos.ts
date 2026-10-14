// Lançamentos da folha para a contabilidade (planilha da Domínio). Módulo puro: usado no servidor e na tela.

export type UnidadeEvento = "horas" | "valor";

export type EventoFolha = {
  id: string;
  chave: string;
  codigo: number | null;
  nome: string;
  unidade: UnidadeEvento;
  ordem: number;
  naPlanilha: boolean;
  ativo: boolean;
};

const MESES_MAIUSCULO = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

/** "2026-09" → "2026-09-01" (como a competência fica no banco). */
export const competenciaParaData = (competencia: string) => `${competencia}-01`;

/** Só os dígitos do CNPJ. */
export const digitosCnpj = (cnpj: string | null | undefined) => (cnpj ?? "").replace(/\D/g, "");

/** Raiz do CNPJ (8 primeiros dígitos): identifica a empresa (Varela, Nazário…). */
export const raizCnpj = (cnpj: string | null | undefined) => digitosCnpj(cnpj).slice(0, 8);

/** Número da filial no CNPJ, sem zeros à esquerda: 30.598.529/0032-16 → "32". */
export function numeroFilialCnpj(cnpj: string | null | undefined) {
  const d = digitosCnpj(cnpj);
  return d.length === 14 ? String(Number(d.slice(8, 12))) : null;
}

/** Nome do arquivo que a contabilidade espera: "32 SETEMBRO.xls" (número da filial no CNPJ + mês). */
export function nomeArquivoDominio(cnpj: string | null | undefined, competencia: string, reserva: string) {
  const mes = MESES_MAIUSCULO[Number(competencia.slice(5, 7)) - 1] ?? competencia;
  return `${numeroFilialCnpj(cnpj) ?? reserva} ${mes}.xls`;
}

/** Nome curto da empresa a partir da razão social ("VARELA DA ROSA & …" → "VARELA"). */
export function nomeEmpresa(razaoSocial: string | null | undefined, reserva = "Sem CNPJ") {
  const r = (razaoSocial ?? "").trim();
  if (!r) return reserva;
  const palavras = r.split(/\s+/);
  return (palavras[0].length <= 3 && palavras[1] ? `${palavras[0]} ${palavras[1]}` : palavras[0]).toUpperCase();
}

/** Texto sem acento, maiúsculo, só letras e espaço simples (para comparar nomes). */
export function normalizarNome(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Função como a contabilidade escreve ("ATENDENTE DE FARMACIA - BALCONISTA" → "ATENDENTE"). */
export function funcaoCurta(cargo: string | null | undefined) {
  const c = normalizarNome(cargo ?? "");
  if (!c) return "";
  if (c.includes("FARMACEUTIC")) return "FARMACÊUTICO";
  if (c.includes("ATENDENTE") || c.includes("BALCONISTA")) return "ATENDENTE";
  return (cargo ?? "").trim().toUpperCase();
}

export const ehFarmaceutico = (cargo: string | null | undefined) => normalizarNome(cargo ?? "").includes("FARMACEUTIC");

/**
 * Valor digitado na grade: "9,58", "9.58", "1.234,56", "1.234" → número com 2 casas.
 * Vazio → null (apaga o lançamento). Texto que não é número → NaN.
 */
export function lerValorDigitado(texto: string): number | null {
  let s = texto.trim().replace(/\s/g, "").replace(/^R\$/i, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return Number.NaN;
  return Math.round(Number(s) * 100) / 100;
}

export const formatarValorGrade = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Último dia do mês da competência ("2026-09" → "2026-09-30"). */
export function fimDaCompetencia(competencia: string) {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

type Vinculo = { status: string; data_admissao: string | null; data_desligamento: string | null };

/** Funcionário entra na planilha do mês: admitido até o fim do mês e não desligado antes do início. */
export function ativoNaCompetencia(e: Vinculo, competencia: string) {
  const inicio = competenciaParaData(competencia);
  if (e.data_admissao && e.data_admissao > fimDaCompetencia(competencia)) return false;
  if (e.status === "desligado") return !!e.data_desligamento && e.data_desligamento >= inicio;
  return true;
}

/** Matrícula como número quando for só dígitos (a planilha usa o formato 00000). */
export function matriculaPlanilha(m: string | null | undefined): number | string {
  const t = (m ?? "").trim();
  return /^\d+$/.test(t) ? Number(t) : t;
}

export function ordenarPorMatricula<T extends { matricula: string | null; nome: string }>(lista: T[]) {
  return [...lista].sort((a, b) => {
    const ma = Number(a.matricula);
    const mb = Number(b.matricula);
    if (Number.isFinite(ma) && Number.isFinite(mb) && ma !== mb) return ma - mb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

/** Distância de edição entre dois textos (quantas letras trocar, incluir ou tirar). */
export function distanciaNomes(a: string, b: string) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 3) return 99;
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    anterior = atual;
  }
  return anterior[b.length];
}
