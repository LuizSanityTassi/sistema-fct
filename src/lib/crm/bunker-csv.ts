// Leitor do CSV "Exportar Vendedores" do relatório "Índice de Fidelização por Vendedor (Adm)" do Bunker (Marka):
// separado por ";", em ISO-8859-1, uma linha por unidade × vendedor do período filtrado no Bunker (o arquivo não diz o
// período: a data vem da tela). Aceita também uma coluna DATA (dd/mm/aaaa ou aaaa-mm-dd) para vários dias num arquivo.
// Colunas: COD_USUARIO;COD_UNIVEND;NOM_FANTASI;COD_VENDEDOR;NOM_USUARIO;COD_EXTERNO;QTD_VENDA_CLIENTE_FUNCIONARIO;
// VAL_VENDA_CLIENTE_FUNCIONARIO;QTD_VENDA_CLIENTE_INATIVO;VAL_VENDA_CLIENTE_INATIVO;VAL_VINCULADO;QTD_TOTAVULSA;
// QTD_TOTFIDELIZ;QTD_TOTVENDAS;PCT_FIDELIZADO;VAL_TOTFIDELIZ;VAL_TOTVENDA;VAL_RESGATE;VAL_CREDITOGERADO

export type LinhaCrm = {
  data: string;
  cod_univend: number;
  vendedor_bunker: number;
  filial_codigo: string;
  vendedor_codigo: string;
  vendedor_nome: string;
  qtd_vendas: number;
  qtd_avulsas: number;
  qtd_fidelizadas: number;
  valor_vendas: number;
  valor_fidelizado: number;
  qtd_funcionario: number;
  valor_funcionario: number;
  qtd_inativo: number;
  valor_inativo: number;
  valor_vinculado: number;
  valor_resgate: number;
  valor_credito_gerado: number;
};

export type ResultadoCrm = { linhas: LinhaCrm[]; dias: string[]; avisos: string[]; temColunaData: boolean };

const OBRIGATORIAS = ["COD_UNIVEND", "NOM_FANTASI", "COD_VENDEDOR", "QTD_TOTVENDAS", "QTD_TOTFIDELIZ", "VAL_TOTVENDA", "VAL_TOTFIDELIZ"] as const;

/** Bytes do arquivo → texto: UTF-8 se for válido, senão ISO-8859-1 (o Bunker exporta em ISO-8859-1). */
function texto(buf: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("latin1").decode(buf);
  }
}

/** Uma linha de CSV com ";" e aspas (aspas dobradas dentro do campo). */
function campos(linha: string) {
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") {
      out.push(atual);
      atual = "";
    } else atual += c;
  }
  out.push(atual);
  return out.map((v) => v.trim());
}

/** "3.091,26" → 3091.26; "94,34%" → 94.34; vazio → 0. */
function numero(v: string | undefined) {
  const t = (v ?? "").replace(/%$/, "").trim();
  if (!t) return 0;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
}

function dataIso(v: string) {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** "FCT F001" → "F001" (o código da filial no cadastro); senão o próprio nome. */
export function filialDoBunker(nome: string) {
  const m = /\bF\d{3}\b/i.exec(nome);
  return m ? m[0].toUpperCase() : nome.trim().toUpperCase().slice(0, 20);
}

/** Lê o CSV. `dia` vale para o arquivo sem coluna DATA (o normal: um dia filtrado no Bunker). */
export function lerCsvCrm(nome: string, buf: Uint8Array, dia: string | null): ResultadoCrm {
  const linhas = texto(buf).split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) throw new Error(`${nome}: arquivo vazio.`);
  const cab = campos(linhas[0]).map((c) => c.toUpperCase());
  const faltam = OBRIGATORIAS.filter((c) => !cab.includes(c));
  if (faltam.length) throw new Error(`${nome}: não parece o CSV "Exportar Vendedores" do Bunker (faltam as colunas ${faltam.join(", ")}).`);
  const col = (c: string) => cab.indexOf(c);
  const iData = col("DATA");
  if (iData < 0 && !dia) throw new Error("Informe o dia das vendas do arquivo.");
  const avisos: string[] = [];
  // soma por dia + unidade + vendedor (o Bunker não repete, mas se repetir não duplica)
  const porChave = new Map<string, LinhaCrm>();
  for (let i = 1; i < linhas.length; i++) {
    const c = campos(linhas[i]);
    const v = (k: string) => (col(k) >= 0 ? (c[col(k)] ?? "") : "");
    const data = iData >= 0 ? dataIso(c[iData] ?? "") : dia;
    if (!data) {
      avisos.push(`${nome}, linha ${i + 1}: data inválida — ignorada.`);
      continue;
    }
    const codUnivend = Number(v("COD_UNIVEND"));
    const vendedorBunker = Number(v("COD_VENDEDOR"));
    if (!Number.isInteger(codUnivend) || !Number.isInteger(vendedorBunker) || codUnivend <= 0) {
      avisos.push(`${nome}, linha ${i + 1}: sem unidade ou vendedor — ignorada.`);
      continue;
    }
    const n = {
      qtd_vendas: numero(v("QTD_TOTVENDAS")),
      qtd_avulsas: numero(v("QTD_TOTAVULSA")),
      qtd_fidelizadas: numero(v("QTD_TOTFIDELIZ")),
      valor_vendas: numero(v("VAL_TOTVENDA")),
      valor_fidelizado: numero(v("VAL_TOTFIDELIZ")),
      qtd_funcionario: numero(v("QTD_VENDA_CLIENTE_FUNCIONARIO")),
      valor_funcionario: numero(v("VAL_VENDA_CLIENTE_FUNCIONARIO")),
      qtd_inativo: numero(v("QTD_VENDA_CLIENTE_INATIVO")),
      valor_inativo: numero(v("VAL_VENDA_CLIENTE_INATIVO")),
      valor_vinculado: numero(v("VAL_VINCULADO")),
      valor_resgate: numero(v("VAL_RESGATE")),
      valor_credito_gerado: numero(v("VAL_CREDITOGERADO")),
    };
    const ruim = Object.entries(n).find(([, x]) => !Number.isFinite(x));
    if (ruim) {
      avisos.push(`${nome}, linha ${i + 1}: valor inválido em ${ruim[0]} — ignorada.`);
      continue;
    }
    const chave = `${data}|${codUnivend}|${vendedorBunker}`;
    const ja = porChave.get(chave);
    if (ja) {
      for (const k of Object.keys(n) as (keyof typeof n)[]) ja[k] = Math.round((ja[k] + n[k]) * 100) / 100;
      continue;
    }
    porChave.set(chave, {
      data,
      cod_univend: codUnivend,
      vendedor_bunker: vendedorBunker,
      filial_codigo: filialDoBunker(v("NOM_FANTASI")),
      vendedor_codigo: v("COD_EXTERNO").slice(0, 30),
      vendedor_nome: v("NOM_USUARIO").slice(0, 200),
      ...n,
    });
  }
  const out = [...porChave.values()];
  if (!out.length) throw new Error(`${nome}: nenhuma linha de vendedor no arquivo.`);
  const semFilial = [...new Set(out.filter((l) => !/^F\d{3}$/.test(l.filial_codigo)).map((l) => l.filial_codigo))];
  if (semFilial.length) avisos.push(`Unidades do Bunker sem código de filial (Fxxx) no nome: ${semFilial.join(", ")}.`);
  return { linhas: out, dias: [...new Set(out.map((l) => l.data))].sort(), avisos, temColunaData: iData >= 0 };
}
