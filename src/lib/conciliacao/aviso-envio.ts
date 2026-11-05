// Texto do aviso que chega no sino quando termina um envio ao Omie (puro, sem banco).
import type { Severidade } from "@/lib/data/pendencias";

export type ResumoEnvio = {
  total: number;
  lancadas: number;
  jaNaOmie: number;
  vencidas: number;
  qtdErros: number;
  erros: { nome: string; valor: number; erro: string }[];
  qtdBarradas: number;
  barradas: { nome: string; valor: number; motivo: string }[];
  /** Fila de uma empresa que parou no meio, com o motivo. */
  falhas: string[];
  /** A pessoa apertou Parar. */
  parado: boolean;
};

/** Quantas contas de cada lista vão escritas no aviso; o resto vira "e mais N". */
export const MAX_CONTAS_NO_AVISO = 30;

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const contas = (n: number) => (n === 1 ? "1 conta" : `${n.toLocaleString("pt-BR")} contas`);
const enviadas = (n: number) => (n === 0 ? "nenhuma enviada" : n === 1 ? "1 enviada" : `${n.toLocaleString("pt-BR")} enviadas`);
const conta = (nome: string, valor: number, motivo: string) => `${corta(nome, 80)}${valor ? `, ${moeda(valor)}` : ""}: ${corta(motivo, 200)}`;

export function avisoDoEnvio(r: ResumoEnvio): { severidade: Severidade; titulo: string; detalhe: string | null } {
  const parou = r.parado || r.falhas.length > 0;
  const comErro = r.qtdErros === 1 ? "1 com erro" : `${r.qtdErros.toLocaleString("pt-BR")} com erro`;
  const inicio = `Envio de ${contas(r.total)} ao Omie`;

  let titulo: string;
  if (parou) titulo = `${inicio} parou antes do fim: ${enviadas(r.lancadas)}${r.qtdErros ? `, ${comErro}` : ""}`;
  else if (r.qtdErros) titulo = `${inicio}: ${enviadas(r.lancadas)}, ${comErro}`;
  else if (r.lancadas === r.total) titulo = `${inicio}: enviado com sucesso, sem erros`;
  else titulo = `${inicio}: ${enviadas(r.lancadas)}, sem erros`;

  const linhas: string[] = [];
  for (const f of r.falhas) linhas.push(`Parou em ${corta(f, 300)}`);
  if (r.parado) linhas.push("O envio foi parado por quem estava enviando.");
  for (const e of r.erros) linhas.push(`Com erro: ${conta(e.nome, e.valor, e.erro)}`);
  if (r.qtdErros > r.erros.length) linhas.push(`E mais ${(r.qtdErros - r.erros.length).toLocaleString("pt-BR")} com erro.`);
  for (const b of r.barradas) linhas.push(`Barrada: ${conta(b.nome, b.valor, b.motivo)}`);
  if (r.qtdBarradas > r.barradas.length) linhas.push(`E mais ${(r.qtdBarradas - r.barradas.length).toLocaleString("pt-BR")} barradas.`);
  if (r.jaNaOmie) linhas.push(r.jaNaOmie === 1 ? "1 já estava na Omie e não subiu de novo." : `${r.jaNaOmie.toLocaleString("pt-BR")} já estavam na Omie e não subiram de novo.`);
  if (r.vencidas) linhas.push(`${contas(r.vencidas)} com vencimento passado, não enviada${r.vencidas === 1 ? "" : "s"}.`);
  const faltaram = r.total - r.lancadas - r.jaNaOmie - r.vencidas - r.qtdErros - r.qtdBarradas;
  if (parou && faltaram > 0) linhas.push(`${contas(faltaram)} sem enviar: marque de novo para continuar.`);

  return {
    severidade: r.qtdErros || r.falhas.length ? "alto" : r.qtdBarradas || r.parado ? "atencao" : "info",
    titulo: corta(titulo, 300),
    detalhe: linhas.length ? corta(linhas.join("\n"), 8000) : null,
  };
}
