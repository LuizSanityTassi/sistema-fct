/**
 * Sugestão de qual funcionário é cada vendedor do Trier, pelo nome. O Trier corta o nome em 20 letras ("FERNANDA
 * DALTOE DE"), abrevia ("NEUSA AP DE CARVALHO") e às vezes escreve diferente do RH ("THAIS DE LUCA" × "THAIS DE LUCCA
 * MACHADO"). A sugestão nunca liga sozinha: o administrador confirma.
 */

const LIGACOES = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);

export function tokensNome(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/['´`]/g, "") // D'ALTOE → DALTOE, como o Trier escreve
    .split(/[^A-Z]+/)
    .filter((t) => t && !LIGACOES.has(t));
}

function distancia(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let ant = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}

/** "exato" = cada parte do nome do Trier está no nome do funcionário (inteira ou abreviada/cortada), na ordem;
 * "parecido" = precisou aceitar uma letra trocada (LUCA × LUCCA); null = não é a mesma pessoa. */
export function compararNomes(trier: string[], funcionario: string[]): "exato" | "parecido" | null {
  if (!trier.length || !funcionario.length) return null;
  let parecido = false;
  // primeiro nome: igual, ou uma letra de diferença em nome comprido (ADILSOM × ADILSON)
  if (trier[0] !== funcionario[0]) {
    if (trier[0].length < 5 || distancia(trier[0], funcionario[0]) > 1) return null;
    parecido = true;
  }
  let j = 1;
  for (let i = 1; i < trier.length; i++) {
    const t = trier[i];
    let achou = false;
    for (; j < funcionario.length; j++) {
      const f = funcionario[j];
      if (f === t || (t.length >= 2 && f.startsWith(t))) {
        achou = true;
        j++;
        break;
      }
      if (t.length >= 4 && distancia(t, f) <= 1) {
        achou = true;
        parecido = true;
        j++;
        break;
      }
    }
    if (!achou) return null;
  }
  return parecido ? "parecido" : "exato";
}

export type Funcionario = { id: string; nome: string; branchId: string | null };
export type Sugestao = {
  /** certa = um único funcionário com o nome batendo; provavel = um só, mas com letra trocada ou só o primeiro nome;
   * varias = mais de um possível (escolher); nenhuma = ninguém parecido entre os ativos. */
  tipo: "certa" | "provavel" | "varias" | "nenhuma";
  candidatos: Funcionario[];
};

/** Quem pode ser o vendedor: prefere quem trabalha na filial onde ele mais vendeu. */
export function sugerirFuncionario(nomeTrier: string, filialPrincipal: string | null, funcionarios: { f: Funcionario; tokens: string[] }[]): Sugestao {
  const t = tokensNome(nomeTrier);
  if (!t.length) return { tipo: "nenhuma", candidatos: [] };
  const achados = funcionarios.flatMap(({ f, tokens }) => {
    const r = compararNomes(t, tokens);
    return r ? [{ f, r, mesma: !!filialPrincipal && f.branchId === filialPrincipal }] : [];
  });
  if (!achados.length) return { tipo: "nenhuma", candidatos: [] };
  // na rede inteira há um só → ele; senão, um só na filial do vendedor → ele
  const unico = achados.length === 1 ? achados[0] : achados.filter((a) => a.mesma).length === 1 ? achados.find((a) => a.mesma)! : null;
  if (!unico) return { tipo: "varias", candidatos: achados.sort((a, b) => Number(b.mesma) - Number(a.mesma)).map((a) => a.f) };
  // só o primeiro nome ("ARTUR") ou letra trocada: confirma olhando
  const certa = unico.r === "exato" && t.length >= 2 && (achados.length === 1 || unico.mesma);
  return { tipo: certa ? "certa" : "provavel", candidatos: [unico.f] };
}
