// Leitura do "Espelho Nota Fiscal Entrada" do Trier (Rel_0005, PDF): uma nota por página (as grandes continuam na
// página seguinte). Os itens são lidos pela posição das colunas do cabeçalho; cada nota é conferida somando os itens
// contra o "Total Mercadorias" do próprio relatório.

export type ItemEspelho = {
  produtoCodigo: number;
  produto: string;
  laboratorio: string;
  barrasFinal: string;
  quantidade: number;
  valorUnitario: number | null;
  descontoPct: number | null;
  valorLiquido: number | null;
  valorTotal: number | null;
};

export type NotaEspelho = {
  filialCodigo: string;
  fornecedorCodigo: string;
  fornecedorNome: string;
  transferencia: boolean;
  numero: string;
  serie: string;
  dataEntrada: string | null;
  dataEmissao: string | null;
  estoqueAtualizado: boolean | null;
  totalMercadorias: number | null;
  totalDescontos: number | null;
  totalNota: number | null;
  itens: ItemEspelho[];
};

export type ResultadoEspelho = { notas: NotaEspelho[]; paginas: number; periodo: string | null; avisos: string[] };

type Texto = { str: string; x: number; y: number; w: number };

// colunas (início em x) quando o cabeçalho da página não é achado
const COLUNAS_PADRAO = { cod: 0, fornec: 41, produto: 105, lab: 235, barras: 294, cfop: 343, cst: 372, estoque: 397, custo: 437, venda: 477, markup: 507, fator: 540, quant: 565, unit: 597, desc: 632, icms: 658, liquido: 693, total: 735 };
type Coluna = keyof typeof COLUNAS_PADRAO;
// rótulo do cabeçalho (2ª linha) que marca o início de cada coluna
const ROTULOS: [Coluna, RegExp][] = [
  ["fornec", /^Prod\.?$/],
  ["produto", /^Produto$/],
  ["lab", /^Laborat/],
  ["barras", /^C.d\.Barras$/],
  ["cfop", /^CFOP$/],
  ["estoque", /^Estoque$/],
  ["custo", /^Cont.b\.?$/],
  ["venda", /^Venda$/],
  ["markup", /^Markup$/],
  ["fator", /^Fator$/],
  ["quant", /^Quant\.?$/],
  ["unit", /^Unit\.?$/],
  ["desc", /^\(%\)\.?$/],
  ["icms", /^% ?ICMS$/],
  ["liquido", /^L.quido$/],
  ["total", /^Vlr\.Total$/],
];

const numero = (s: string | undefined) => {
  if (!s) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const dataIso = (s: string | undefined) => {
  const m = s ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim()) : null;
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Linhas da página: junta os textos com até 4 pt de diferença na altura (os números do item vêm 2 pt abaixo do nome). */
function linhas(textos: Texto[]) {
  const ordenados = textos.filter((t) => t.str.trim()).sort((a, b) => a.y - b.y);
  const out: { y: number; ts: Texto[] }[] = [];
  for (const t of ordenados) {
    const ultima = out[out.length - 1];
    if (ultima && t.y - ultima.y <= 4) ultima.ts.push(t);
    else out.push({ y: t.y, ts: [t] });
  }
  for (const l of out) l.ts.sort((a, b) => a.x - b.x);
  return out;
}

/** Notas da página (normalmente uma; a primeira pode continuar a última da página anterior). */
function lerPagina(textos: Texto[]) {
  const ls = linhas(textos);
  const txt = ls.map((l) => l.ts.map((t) => t.str.trim()).join(" "));
  const achar = (re: RegExp) => {
    for (const t of txt) {
      const m = re.exec(t);
      if (m) return m;
    }
    return null;
  };
  const filial = achar(/Filial:\s*(\d+)\s+([A-Z]{1,4}[-\w]*?\d+[A-Z]?)\b/);
  const fornecedor = achar(/Fornecedor:\s*(\d+)\s+(.+)$/);
  const nota = achar(/Nota Fiscal:\s*(\S+)(?:\s+(\S+))?/);
  const entrada = achar(/Data Entrada:\s*(\d{2}\/\d{2}\/\d{4})/);
  const emissao = achar(/Data Emiss.o:\s*(\d{2}\/\d{2}\/\d{4})/);
  const estoque = achar(/Estoque Atualizado:\s*(\S+)/);
  const mercadorias = achar(/Total Mercadorias:\s*([\d.,]+)/);
  const descontos = achar(/Total Descontos:\s*([\d.,]+)/);
  const totalNota = achar(/Total da Nota:\s*([\d.,]+)/);
  const periodo = achar(/Per.odo:\s*(\d{2}\/\d{2}\/\d{4}\s*\S\s*\d{2}\/\d{2}\/\d{4})/);

  // colunas pelos rótulos do cabeçalho desta página
  const col: Record<Coluna, number> = { ...COLUNAS_PADRAO };
  const cab = ls.find((l) => l.ts.some((t) => /^Quant\.?$/.test(t.str.trim())) && l.ts.some((t) => /^Produto$/.test(t.str.trim())));
  if (cab) for (const t of cab.ts) for (const [c, re] of ROTULOS) if (re.test(t.str.trim())) col[c] = t.x;
  const ordem = (Object.keys(col) as Coluna[]).sort((a, b) => col[a] - col[b]);
  const colunaDe = (t: Texto) => {
    const centro = t.x + (t.w || 0) / 2;
    let achada: Coluna = ordem[0];
    for (const c of ordem) if (col[c] - 3 <= centro) achada = c;
    return achada;
  };

  const itens: ItemEspelho[] = [];
  for (const l of ls) {
    if (cab && l.y <= cab.y) continue;
    const primeiro = l.ts[0];
    if (!primeiro || !/^\d+$/.test(primeiro.str.trim()) || primeiro.x > col.fornec - 2) continue;
    const campos: Partial<Record<Coluna, string[]>> = {};
    for (const t of l.ts) {
      const c = colunaDe(t);
      (campos[c] ??= []).push(t.str.trim());
    }
    const quant = numero(campos.quant?.at(-1));
    if (quant === null) continue;
    itens.push({
      produtoCodigo: Number(primeiro.str.trim()),
      produto: (campos.produto ?? []).join(" ").slice(0, 200),
      laboratorio: (campos.lab ?? []).join(" ").slice(0, 120),
      barrasFinal: (campos.barras ?? []).join("").slice(0, 20),
      quantidade: quant,
      valorUnitario: numero(campos.unit?.at(-1)),
      descontoPct: numero(campos.desc?.at(-1)),
      valorLiquido: numero(campos.liquido?.at(-1)),
      valorTotal: numero(campos.total?.at(-1)),
    });
  }

  const nomeFornecedor = fornecedor?.[2].trim() ?? "";
  return {
    periodo: periodo?.[1] ?? null,
    cabecalho:
      filial && fornecedor && nota
        ? {
            filialCodigo: filial[2].replace(/-$/, ""),
            fornecedorCodigo: fornecedor[1],
            fornecedorNome: nomeFornecedor.slice(0, 200),
            // fornecedor que é outra loja do grupo ("F304 - GETULIO VARGAS", "F099 - DEPOSITO")
            transferencia: /^F\d{3}\b/.test(nomeFornecedor) || /\b(30\.598\.529|10\.768\.389)\//.test(nomeFornecedor),
            numero: nota[1],
            serie: nota[2] && !/^Data/.test(nota[2]) ? nota[2] : "",
            dataEntrada: dataIso(entrada?.[1]),
            dataEmissao: dataIso(emissao?.[1]),
            estoqueAtualizado: estoque ? /^SIM/i.test(estoque[1]) : null,
          }
        : null,
    totais: totalNota ? { totalMercadorias: numero(mercadorias?.[1]), totalDescontos: numero(descontos?.[1]), totalNota: numero(totalNota[1]) } : null,
    itens,
  };
}

/** Lê o PDF inteiro. `aoAvancar` recebe (página, total) para mostrar o progresso. */
export async function lerEspelhoTrier(buf: Uint8Array, aoAvancar?: (pagina: number, total: number) => void): Promise<ResultadoEspelho> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // o "worker" do pdf.js roda na mesma thread (o mesmo jeito da conciliação, que já roda na Vercel)
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const tarefa = pdfjs.getDocument({ data: buf, useSystemFonts: true, disableFontFace: true });
  const doc = await tarefa.promise;
  const notas: NotaEspelho[] = [];
  const avisos: string[] = [];
  let periodo: string | null = null;
  let atual: NotaEspelho | null = null;
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const pagina = await doc.getPage(p);
      const vp = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      const textos: Texto[] = [];
      for (const it of conteudo.items) {
        if (!("str" in it) || !it.str) continue;
        const t = pdfjs.Util.transform(vp.transform, it.transform);
        // página deitada: a largura do texto anda no eixo que virou x
        textos.push({ str: it.str, x: t[4], y: t[5], w: Math.abs(it.width * (vp.transform[0] || vp.transform[1] || 1)) });
      }
      pagina.cleanup();
      const lida = lerPagina(textos);
      periodo ??= lida.periodo;
      if (lida.cabecalho) {
        const mesma =
          atual &&
          atual.filialCodigo === lida.cabecalho.filialCodigo &&
          atual.fornecedorCodigo === lida.cabecalho.fornecedorCodigo &&
          atual.numero === lida.cabecalho.numero &&
          atual.serie === lida.cabecalho.serie;
        if (!mesma) {
          atual = { ...lida.cabecalho, totalMercadorias: null, totalDescontos: null, totalNota: null, itens: [] };
          notas.push(atual);
        }
      } else if (!atual) {
        avisos.push(`Página ${p}: sem filial, fornecedor ou número da nota — ignorada.`);
        continue;
      }
      atual!.itens.push(...lida.itens);
      if (lida.totais) Object.assign(atual!, lida.totais);
      aoAvancar?.(p, doc.numPages);
    }
    // conferência: soma dos itens = total de mercadorias do relatório
    for (const n of notas) {
      const soma = Math.round(n.itens.reduce((s, i) => s + (i.valorTotal ?? 0), 0) * 100) / 100;
      if (!n.itens.length) avisos.push(`NF ${n.numero} (${n.filialCodigo}, ${n.fornecedorNome}): nenhum item lido.`);
      else if (n.totalMercadorias !== null && Math.abs(soma - n.totalMercadorias) > 0.05)
        avisos.push(`NF ${n.numero} (${n.filialCodigo}, ${n.fornecedorNome}): itens somam ${soma.toFixed(2)} e o relatório diz ${n.totalMercadorias.toFixed(2)}.`);
    }
    return { notas, paginas: doc.numPages, periodo, avisos };
  } finally {
    await tarefa.destroy();
  }
}
