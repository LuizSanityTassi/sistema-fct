// Sugestão de funcionário para um operador do Trier pelo nome (puro). O Trier guarda nomes curtos e às vezes com
// letra trocada ("ADILSOM BATISTA", "CLEOMAR"); o cadastro tem o nome completo. A sugestão só aparece quando há um
// candidato claramente melhor; a confirmação é sempre de uma pessoa.
import { distanciaNomes, normalizarNome } from "@/lib/rh/lancamentos";

export type Candidato = { id: string; nome: string };

const palavras = (s: string) => normalizarNome(s).split(" ").filter((p) => p.length > 1 && !["DA", "DE", "DO", "DAS", "DOS", "E"].includes(p));
const parecida = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && distanciaNomes(a, b) <= 1);

/** Nota de 0 a 100: todas as palavras do operador aparecem no nome do funcionário (com até 1 letra de diferença). */
export function notaNome(operador: string, funcionario: string) {
  const op = palavras(operador);
  const fu = palavras(funcionario);
  if (!op.length || !fu.length) return 0;
  const achadas = op.filter((p) => fu.some((q) => parecida(p, q))).length;
  if (achadas < op.length) return Math.round((achadas / op.length) * 50);
  // todas achadas: o primeiro nome igual vale mais (exato mais que com 1 letra trocada); operador de 1 palavra só
  // vale se for o primeiro nome
  const exato = op[0] === fu[0];
  const primeiro = exato || parecida(op[0], fu[0]);
  if (op.length === 1) return exato ? 75 : primeiro ? 70 : 40;
  return exato ? 100 : primeiro ? 95 : 80;
}

/** Melhor candidato, se houver um só com a maior nota e ela for boa (≥ 70). */
export function sugerirFuncionario(operador: string, candidatos: Candidato[]): Candidato | null {
  let melhor: Candidato | null = null;
  let nota = 0;
  let empate = false;
  for (const c of candidatos) {
    const n = notaNome(operador, c.nome);
    if (n > nota) {
      melhor = c;
      nota = n;
      empate = false;
    } else if (n === nota && n > 0) empate = true;
  }
  return melhor && nota >= 70 && !empate ? melhor : null;
}
