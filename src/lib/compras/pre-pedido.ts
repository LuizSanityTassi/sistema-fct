// Leitura do pré-pedido do Trier (Excel "Con_0018": PRÉ-PEDIDO, um bloco por filial com o número do pré-pedido e os
// itens: código do produto, descrição, código de barras, laboratório e quantidade a pedir). Confere a quantidade de
// cada filial com o "Total Filial" e o total do arquivo com o "Total Geral".
import * as XLSX from "xlsx";

export type ItemPedido = { produtoCodigo: number; produto: string; barras: string; laboratorio: string; quantidade: number };
export type PedidoLido = { numero: number; filialCodigo: string; filialNome: string; laboratorio: string; itens: ItemPedido[]; totalArquivo: number | null };
export type ResultadoPrePedido = { pedidos: PedidoLido[]; avisos: string[] };

const limpo = (v: unknown) => (v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim());
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const inteiro = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(limpo(v).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function lerPrePedido(nome: string, buf: ArrayBuffer | Uint8Array): ResultadoPrePedido {
  const wb = XLSX.read(buf, { type: "array" });
  const pedidos: PedidoLido[] = [];
  const avisos: string[] = [];
  let ehPrePedido = false;
  let totalGeral: number | null = null;
  for (const aba of wb.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[aba], { header: 1, raw: true, defval: null });
    let filial: { codigo: string; nome: string } | null = null;
    let atual: PedidoLido | null = null;
    for (const [i, l] of linhas.entries()) {
      const a = semAcento(limpo(l[0]));
      if (!a && semAcento(limpo(l[4])).includes("PRE-PEDIDO")) ehPrePedido = true;
      if (a.startsWith("FILIAL:")) {
        // " F001 - FRETTA - 30.598.529/0001-10"
        const texto = limpo(l[4]);
        const m = /^([A-Z]{1,4}[-\w]*?\d+[A-Z]?)\s*-\s*(.*)$/.exec(texto);
        filial = { codigo: m ? m[1] : texto.split(" ")[0], nome: m ? m[2].replace(/\s*-?\s*[\d./-]{14,}$/, "").trim() : texto };
        atual = null;
      } else if (a.startsWith("NUMERO PRE-PEDIDO") || a.startsWith("NUMERO PRE PEDIDO")) {
        const n = inteiro(l[3] ?? l.find((v, k) => k > 0 && inteiro(v) !== null));
        if (!filial || !n) {
          avisos.push(`${nome}, linha ${i + 1}: número do pré-pedido sem filial antes.`);
          continue;
        }
        atual = { numero: n, filialCodigo: filial.codigo, filialNome: filial.nome, laboratorio: "", itens: [], totalArquivo: null };
        pedidos.push(atual);
      } else if (a.startsWith("TOTAL FILIAL")) {
        if (atual) atual.totalArquivo = inteiro(l[7]);
      } else if (a.startsWith("TOTAL GERAL")) {
        totalGeral = inteiro(l[7]);
      } else if (typeof l[0] === "number" || /^\d+$/.test(limpo(l[0]))) {
        const quantidade = inteiro(l[7]);
        if (!atual) {
          avisos.push(`${nome}, linha ${i + 1}: item sem o número do pré-pedido antes — ignorado.`);
          continue;
        }
        if (quantidade === null || quantidade <= 0) {
          avisos.push(`${nome}, linha ${i + 1}: item ${limpo(l[0])} sem quantidade — ignorado.`);
          continue;
        }
        const laboratorio = limpo(l[6]).slice(0, 120);
        atual.laboratorio ||= laboratorio;
        atual.itens.push({ produtoCodigo: Number(l[0]), produto: limpo(l[1]).slice(0, 200), barras: limpo(l[4]).slice(0, 20), laboratorio, quantidade });
      }
    }
  }
  if (!ehPrePedido && !pedidos.length) throw new Error(`${nome}: não parece o pré-pedido do Trier (Con_0018).`);
  // conferências do próprio arquivo
  for (const p of pedidos) {
    const soma = p.itens.reduce((s, i) => s + i.quantidade, 0);
    if (!p.itens.length) avisos.push(`${nome}: pré-pedido ${p.numero} (${p.filialCodigo}) sem itens.`);
    else if (p.totalArquivo !== null && soma !== p.totalArquivo) avisos.push(`${nome}: pré-pedido ${p.numero} (${p.filialCodigo}) soma ${soma} e o arquivo diz ${p.totalArquivo}.`);
  }
  const somaGeral = pedidos.reduce((s, p) => s + p.itens.reduce((t, i) => t + i.quantidade, 0), 0);
  if (totalGeral !== null && somaGeral !== totalGeral) avisos.push(`${nome}: os itens somam ${somaGeral} e o "Total Geral" diz ${totalGeral}.`);
  return { pedidos, avisos };
}
