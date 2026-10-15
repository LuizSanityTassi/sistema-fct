// Preenche um modelo .xls (Excel 97-2003, BIFF8) como uma pessoa faria no Excel: todos os registros do modelo
// (fontes, estilos, cores, bordas, comentários, tema, impressão, larguras, alturas, mesclagens, fórmulas) ficam
// iguais e só o conteúdo das células muda. Cada célula mantém o estilo (XF) que tinha no modelo.
// Reescreve a tabela de células (ROW, células, DBCELL), o SST/EXTSST, o INDEX e o ponteiro do BOUNDSHEET.
// Só servidor. Usa o leitor/gravador de arquivo composto (CFB) da biblioteca xlsx.
import * as XLSX from "xlsx";

type Registro = { t: number; d: Buffer };

/** Conteúdo de uma célula: número, texto ou vazia (null = célula em branco, mantendo o estilo). */
export type ValorCelula = number | string | null;

type Celula = { xf: number; v: ValorCelula; formula?: Registro[] };

type Texto = { s: string; extra?: Buffer; cRun?: number; cbExt?: number };

const T = {
  BOF: 0x0809, EOF: 0x000a, SST: 0x00fc, EXTSST: 0x00ff, CONTINUE: 0x003c, BOUNDSHEET: 0x0085, INDEX: 0x020b,
  DBCELL: 0x00d7, ROW: 0x0208, DIMENSIONS: 0x0200, LABELSST: 0x00fd, NUMBER: 0x0203, RK: 0x027e, MULRK: 0x00bd,
  BLANK: 0x0201, MULBLANK: 0x00be, FORMULA: 0x0006, STRING: 0x0207, SHRFMLA: 0x04bc, ARRAY: 0x0221, BOOLERR: 0x0205,
  LABEL: 0x0204, RSTRING: 0x00d6, DEFCOLWIDTH: 0x0055,
};
const TABELA = new Set([T.ROW, T.LABELSST, T.NUMBER, T.RK, T.MULRK, T.BLANK, T.MULBLANK, T.FORMULA, T.STRING, T.SHRFMLA, T.ARRAY, T.BOOLERR, T.DBCELL, T.LABEL, T.RSTRING]);
const MAX_DADOS = 8224;

function lerRegistros(b: Buffer): Registro[] {
  const out: Registro[] = [];
  let i = 0;
  while (i + 4 <= b.length) {
    const t = b.readUInt16LE(i);
    const l = b.readUInt16LE(i + 2);
    out.push({ t, d: Buffer.from(b.subarray(i + 4, i + 4 + l)) });
    i += 4 + l;
  }
  return out;
}

const chaveCel = (r: number, c: number) => r * 1024 + c;

// ---------- RK ----------
function rkParaNumero(rk: number): number {
  const div100 = rk & 1;
  let v: number;
  if (rk & 2) v = rk >> 2;
  else {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(0, 0);
    buf.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    v = buf.readDoubleLE(0);
  }
  return div100 ? v / 100 : v;
}

// Mesma preferência do Excel: número compacto em ponto flutuante, depois x100, depois inteiro, depois inteiro x100.
function numeroParaRk(v: number): number | null {
  const flutuante = (x: number) => {
    const buf = Buffer.alloc(8);
    buf.writeDoubleLE(x, 0);
    return buf.readUInt32LE(0) === 0 && (buf.readUInt32LE(4) & 3) === 0 ? buf.readUInt32LE(4) : null;
  };
  const intOk = (n: number) => Number.isInteger(n) && n >= -(2 ** 29) && n < 2 ** 29;
  const f = flutuante(v);
  if (f !== null) return f;
  const v100 = Math.round(v * 100);
  const exato100 = v100 / 100 === v;
  if (exato100) {
    const f100 = flutuante(v100);
    if (f100 !== null) return (f100 | 1) >>> 0;
  }
  if (intOk(v)) return ((v << 2) | 2) >>> 0;
  if (exato100 && intOk(v100)) return ((v100 << 2) | 3) >>> 0;
  return null;
}

// ---------- SST ----------
function lerSst(registros: Registro[], inicio: number): Texto[] {
  // junta SST + CONTINUE guardando onde cada CONTINUE começa (strings partidas repetem o byte de flags)
  const partes = [registros[inicio].d];
  for (let k = inicio + 1; k < registros.length && registros[k].t === T.CONTINUE; k++) partes.push(registros[k].d);
  const limites: number[] = [];
  let acc = 0;
  for (const p of partes) {
    acc += p.length;
    limites.push(acc);
  }
  const d = Buffer.concat(partes);
  const unicos = d.readUInt32LE(4);
  let pos = 8;
  const proxLimite = (p: number) => limites.find((l) => l > p) ?? d.length;
  const out: Texto[] = [];
  for (let n = 0; n < unicos; n++) {
    const cch = d.readUInt16LE(pos);
    let flags = d[pos + 2];
    pos += 3;
    let cRun = 0;
    let cbExt = 0;
    if (flags & 0x08) {
      cRun = d.readUInt16LE(pos);
      pos += 2;
    }
    if (flags & 0x04) {
      cbExt = d.readUInt32LE(pos);
      pos += 4;
    }
    let s = "";
    let faltam = cch;
    while (faltam > 0) {
      const lim = proxLimite(pos);
      const largura = flags & 1 ? 2 : 1;
      const cabem = Math.min(faltam, Math.floor((lim - pos) / largura));
      s += largura === 2 ? d.subarray(pos, pos + cabem * 2).toString("utf16le") : d.subarray(pos, pos + cabem).toString("latin1");
      pos += cabem * largura;
      faltam -= cabem;
      if (faltam > 0) {
        flags = (flags & ~1) | (d[pos] & 1);
        pos += 1;
      }
    }
    const extraLen = cRun * 4 + cbExt;
    const extra = extraLen ? Buffer.from(d.subarray(pos, pos + extraLen)) : undefined;
    pos += extraLen;
    out.push({ s, extra, cRun, cbExt });
  }
  return out;
}

function bytesTexto(t: Texto): Buffer {
  const alto = [...t.s].some((ch) => ch.charCodeAt(0) > 0xff);
  const corpo = alto ? Buffer.from(t.s, "utf16le") : Buffer.from(t.s, "latin1");
  const flags = (alto ? 1 : 0) | (t.cRun ? 0x08 : 0) | (t.cbExt ? 0x04 : 0);
  const cab = [Buffer.from([t.s.length & 0xff, t.s.length >> 8, flags])];
  if (t.cRun) {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(t.cRun, 0);
    cab.push(b);
  }
  if (t.cbExt) {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(t.cbExt, 0);
    cab.push(b);
  }
  return Buffer.concat([...cab, corpo, t.extra ?? Buffer.alloc(0)]);
}

// ---------- modelo ----------
export type ModeloXls = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a biblioteca não tipa o contêiner CFB
  cfb: any;
  globais: Registro[];
  planilhaAntes: Registro[];
  planilhaDepois: Registro[];
  linhas: Map<number, Buffer>;
  celulas: Map<number, Celula>;
  sst: Texto[];
};

export function lerModelo(arquivo: Buffer): ModeloXls {
  const cfb = XLSX.CFB.read(arquivo, { type: "buffer" });
  const entrada = XLSX.CFB.find(cfb, "Workbook");
  if (!entrada) throw new Error("modelo sem o fluxo Workbook");
  const regs = lerRegistros(Buffer.from(entrada.content as Uint8Array));
  const fimGlobais = regs.findIndex((r) => r.t === T.EOF);
  const globais = regs.slice(0, fimGlobais + 1);
  const planilha = regs.slice(fimGlobais + 1);
  if (planilha.filter((r) => r.t === T.BOF).length !== 1) throw new Error("o modelo precisa ter uma aba só");
  const iSst = globais.findIndex((r) => r.t === T.SST);
  const sst = iSst >= 0 ? lerSst(globais, iSst) : [];

  const iIni = planilha.findIndex((r) => TABELA.has(r.t));
  let iFim = iIni;
  while (iFim < planilha.length && TABELA.has(planilha[iFim].t)) iFim++;
  const planilhaAntes = planilha.slice(0, iIni);
  const planilhaDepois = planilha.slice(iFim);
  const linhas = new Map<number, Buffer>();
  const celulas = new Map<number, Celula>();
  let ultimaFormula: Celula | null = null;
  for (const r of planilha.slice(iIni, iFim)) {
    const d = r.d;
    if (r.t === T.ROW) linhas.set(d.readUInt16LE(0), d);
    else if (r.t === T.LABELSST) celulas.set(chaveCel(d.readUInt16LE(0), d.readUInt16LE(2)), { xf: d.readUInt16LE(4), v: sst[d.readUInt32LE(6)]?.s ?? "" });
    else if (r.t === T.NUMBER) celulas.set(chaveCel(d.readUInt16LE(0), d.readUInt16LE(2)), { xf: d.readUInt16LE(4), v: d.readDoubleLE(6) });
    else if (r.t === T.RK) celulas.set(chaveCel(d.readUInt16LE(0), d.readUInt16LE(2)), { xf: d.readUInt16LE(4), v: rkParaNumero(d.readUInt32LE(6)) });
    else if (r.t === T.BLANK) celulas.set(chaveCel(d.readUInt16LE(0), d.readUInt16LE(2)), { xf: d.readUInt16LE(4), v: null });
    else if (r.t === T.MULRK) {
      const rw = d.readUInt16LE(0);
      const c0 = d.readUInt16LE(2);
      for (let j = 0; j < (d.length - 6) / 6; j++) celulas.set(chaveCel(rw, c0 + j), { xf: d.readUInt16LE(4 + 6 * j), v: rkParaNumero(d.readUInt32LE(6 + 6 * j)) });
    } else if (r.t === T.MULBLANK) {
      const rw = d.readUInt16LE(0);
      const c0 = d.readUInt16LE(2);
      for (let j = 0; j < (d.length - 6) / 2; j++) celulas.set(chaveCel(rw, c0 + j), { xf: d.readUInt16LE(4 + 2 * j), v: null });
    } else if (r.t === T.FORMULA) {
      ultimaFormula = { xf: d.readUInt16LE(4), v: null, formula: [r] };
      celulas.set(chaveCel(d.readUInt16LE(0), d.readUInt16LE(2)), ultimaFormula);
    } else if ((r.t === T.STRING || r.t === T.SHRFMLA || r.t === T.ARRAY) && ultimaFormula) ultimaFormula.formula!.push(r);
    else if (r.t !== T.DBCELL) throw new Error(`registro de célula não suportado no modelo: 0x${r.t.toString(16)}`);
  }
  return { cfb, globais, planilhaAntes, planilhaDepois, linhas, celulas, sst };
}

/** Valor da célula no modelo (null se vazia ou fórmula). */
export function valorNoModelo(m: ModeloXls, linha: number, coluna: number): ValorCelula {
  return m.celulas.get(chaveCel(linha, coluna))?.v ?? null;
}

/** Troca o conteúdo de uma célula existente no modelo, mantendo o estilo. */
export function definirValor(m: ModeloXls, linha: number, coluna: number, v: ValorCelula, xfSeNova = 15) {
  const k = chaveCel(linha, coluna);
  const atual = m.celulas.get(k);
  if (atual?.formula) throw new Error(`a célula ${linha + 1}:${coluna + 1} tem fórmula no modelo`);
  m.celulas.set(k, { xf: atual?.xf ?? xfSeNova, v });
}

/** Atualiza o resultado guardado de uma fórmula numérica do modelo (o que o Excel mostra antes de recalcular). */
export function definirResultadoFormula(m: ModeloXls, linha: number, coluna: number, v: number) {
  const c = m.celulas.get(chaveCel(linha, coluna));
  const f = c?.formula?.[0];
  if (!f) throw new Error(`sem fórmula em ${linha + 1}:${coluna + 1}`);
  if (f.d.readUInt16LE(12) === 0xffff) throw new Error("a fórmula do modelo não tem resultado numérico");
  f.d.writeDoubleLE(v, 6);
}

// ---------- gravação ----------
function registro(t: number, d: Buffer): Buffer {
  const h = Buffer.alloc(4);
  h.writeUInt16LE(t, 0);
  h.writeUInt16LE(d.length, 2);
  return Buffer.concat([h, d]);
}

const u16 = (...v: number[]) => {
  const b = Buffer.alloc(v.length * 2);
  v.forEach((x, i) => b.writeUInt16LE(x, i * 2));
  return b;
};

/** Registros de células de uma linha, agrupando como o Excel (MULRK e MULBLANK para vizinhas). */
function registrosDaLinha(rw: number, cols: [number, Celula][], indiceSst: (s: string) => number): Buffer[] {
  const out: Buffer[] = [];
  let i = 0;
  while (i < cols.length) {
    const [c, cel] = cols[i];
    if (cel.formula) {
      for (const r of cel.formula) out.push(registro(r.t, r.d));
      i++;
      continue;
    }
    if (typeof cel.v === "string") {
      const d = Buffer.alloc(10);
      d.writeUInt16LE(rw, 0);
      d.writeUInt16LE(c, 2);
      d.writeUInt16LE(cel.xf, 4);
      d.writeUInt32LE(indiceSst(cel.v), 6);
      out.push(registro(T.LABELSST, d));
      i++;
      continue;
    }
    // sequência de vizinhas do mesmo tipo (RK ou vazia)
    const tipo = (x: Celula) => (x.formula || typeof x.v === "string" ? "x" : x.v === null ? "b" : numeroParaRk(x.v) !== null ? "k" : "n");
    const t0 = tipo(cel);
    if (t0 === "n") {
      const d = Buffer.alloc(14);
      d.writeUInt16LE(rw, 0);
      d.writeUInt16LE(c, 2);
      d.writeUInt16LE(cel.xf, 4);
      d.writeDoubleLE(cel.v as number, 6);
      out.push(registro(T.NUMBER, d));
      i++;
      continue;
    }
    let j = i + 1;
    while (j < cols.length && cols[j][0] === cols[j - 1][0] + 1 && tipo(cols[j][1]) === t0) j++;
    const grupo = cols.slice(i, j);
    if (t0 === "b") {
      if (grupo.length === 1) out.push(registro(T.BLANK, u16(rw, c, cel.xf)));
      else out.push(registro(T.MULBLANK, Buffer.concat([u16(rw, c), u16(...grupo.map(([, x]) => x.xf)), u16(grupo[grupo.length - 1][0])])));
    } else if (grupo.length === 1) {
      const d = Buffer.alloc(10);
      d.writeUInt16LE(rw, 0);
      d.writeUInt16LE(c, 2);
      d.writeUInt16LE(cel.xf, 4);
      d.writeUInt32LE(numeroParaRk(cel.v as number)!, 6);
      out.push(registro(T.RK, d));
    } else {
      const corpo = Buffer.alloc(grupo.length * 6);
      grupo.forEach(([, x], k) => {
        corpo.writeUInt16LE(x.xf, k * 6);
        corpo.writeUInt32LE(numeroParaRk(x.v as number)!, k * 6 + 2);
      });
      out.push(registro(T.MULRK, Buffer.concat([u16(rw, c), corpo, u16(grupo[grupo.length - 1][0])])));
    }
    i = j;
  }
  return out;
}

export type OpcoesGravacao = { /** ordem das strings do SST (só para testes de ida e volta) */ ordemSst?: string[] };

export function gravarModelo(m: ModeloXls, opcoes: OpcoesGravacao = {}): Buffer {
  // 1. SST: textos usados, na ordem em que aparecem (ou na ordem pedida), mantendo a formatação rica do modelo
  const usados: string[] = [];
  const porLinha = new Map<number, [number, Celula][]>();
  for (const [k, cel] of [...m.celulas.entries()].sort((a, b) => a[0] - b[0])) {
    const rw = Math.floor(k / 1024);
    if (!porLinha.has(rw)) porLinha.set(rw, []);
    porLinha.get(rw)!.push([k % 1024, cel]);
  }
  let totalRefs = 0;
  for (const [, cols] of porLinha) for (const [, cel] of cols) if (!cel.formula && typeof cel.v === "string") {
    usados.push(cel.v);
    totalRefs++;
  }
  // textos que continuam em uso ficam na ordem do modelo; os novos entram no fim, na ordem em que aparecem
  const emUso = new Set(usados);
  const ordem = opcoes.ordemSst ? [...opcoes.ordemSst.filter((s) => emUso.has(s)), ...usados] : usados;
  const unicos = [...new Set(ordem)];
  const doModelo = new Map(m.sst.map((t) => [t.s, t]));
  const textos: Texto[] = unicos.map((s) => doModelo.get(s) ?? { s });
  const idx = new Map(unicos.map((s, i) => [s, i]));

  // 2. globais: troca SST/CONTINUE/EXTSST, guarda onde fica o BOUNDSHEET
  const partesGlobais: Buffer[] = [];
  let pos = 0;
  let posBoundsheet = -1;
  const extsst: { ib: number; cb: number }[] = [];
  const dsst = Math.max(8, Math.floor(unicos.length / 128) + 1);
  let iReg = 0;
  while (iReg < m.globais.length) {
    const r = m.globais[iReg];
    if (r.t === T.SST) {
      // pula o SST antigo e seus CONTINUE
      iReg++;
      while (iReg < m.globais.length && m.globais[iReg].t === T.CONTINUE) iReg++;
      const cab = Buffer.alloc(8);
      cab.writeUInt32LE(totalRefs, 0);
      cab.writeUInt32LE(unicos.length, 4);
      let atual: Buffer[] = [cab];
      let tamAtual = 8;
      let tipoAtual = T.SST;
      const fechar = () => {
        const b = registro(tipoAtual, Buffer.concat(atual));
        partesGlobais.push(b);
        pos += b.length;
      };
      textos.forEach((t, n) => {
        const b = bytesTexto(t);
        if (tamAtual + b.length > MAX_DADOS) {
          fechar();
          atual = [];
          tamAtual = 0;
          tipoAtual = T.CONTINUE;
        }
        if (n % dsst === 0) extsst.push({ ib: pos + 4 + tamAtual, cb: 4 + tamAtual });
        atual.push(b);
        tamAtual += b.length;
      });
      fechar();
      continue;
    }
    if (r.t === T.EXTSST) {
      const d = Buffer.alloc(2 + extsst.length * 8);
      d.writeUInt16LE(dsst, 0);
      extsst.forEach((e, k) => {
        d.writeUInt32LE(e.ib, 2 + k * 8);
        d.writeUInt16LE(e.cb, 6 + k * 8);
      });
      const b = registro(T.EXTSST, d);
      partesGlobais.push(b);
      pos += b.length;
      iReg++;
      continue;
    }
    if (r.t === T.BOUNDSHEET) posBoundsheet = pos;
    const b = registro(r.t, Buffer.from(r.d));
    partesGlobais.push(b);
    pos += b.length;
    iReg++;
  }
  const globais = Buffer.concat(partesGlobais);
  const inicioPlanilha = globais.length;
  globais.writeUInt32LE(inicioPlanilha, posBoundsheet + 4);

  // 3. planilha: registros antes da tabela (INDEX refeito depois), tabela de células em blocos de 32 linhas, resto
  const linhasUsadas = [...new Set([...m.linhas.keys(), ...porLinha.keys()])].sort((a, b) => a - b);
  const partes: Buffer[] = [];
  let p = inicioPlanilha;
  let posIndex = -1;
  let posDefCol = 0;
  const empurrar = (b: Buffer) => {
    partes.push(b);
    p += b.length;
  };
  for (const r of m.planilhaAntes) {
    if (r.t === T.INDEX) {
      posIndex = p;
      empurrar(registro(T.INDEX, Buffer.alloc(16 + 4 * blocosComLinhas(linhasUsadas).length)));
      continue;
    }
    if (r.t === T.DEFCOLWIDTH) posDefCol = p;
    if (r.t === T.DIMENSIONS) {
      const d = Buffer.from(r.d);
      const ultimaLinha = linhasUsadas.at(-1) ?? 0;
      let ultimaCol = 0;
      for (const cols of porLinha.values()) for (const [c] of cols) ultimaCol = Math.max(ultimaCol, c);
      d.writeUInt32LE(linhasUsadas[0] ?? 0, 0);
      d.writeUInt32LE(ultimaLinha + 1, 4);
      d.writeUInt16LE(0, 8);
      d.writeUInt16LE(ultimaCol + 1, 10);
      empurrar(registro(T.DIMENSIONS, d));
      continue;
    }
    empurrar(registro(r.t, Buffer.from(r.d)));
  }
  const posDbcells: number[] = [];
  for (const bloco of blocosComLinhas(linhasUsadas)) {
    const inicioBloco = p;
    const posLinhas: number[] = [];
    for (const rw of bloco) {
      posLinhas.push(p);
      let d = m.linhas.get(rw);
      if (!d) {
        d = Buffer.alloc(16);
        d.writeUInt16LE(rw, 0);
        d.writeUInt16LE(0x00ff, 6);
        d.writeUInt16LE(0x0100, 12);
        d.writeUInt16LE(0x0f, 14);
      }
      // a ROW do modelo fica como está (altura, estilo e faixa de colunas); só aumenta a faixa se houver coluna nova
      const dd = Buffer.from(d);
      const cols = porLinha.get(rw) ?? [];
      if (cols.length) {
        if (cols[0][0] < dd.readUInt16LE(2)) dd.writeUInt16LE(cols[0][0], 2);
        if (cols[cols.length - 1][0] + 1 > dd.readUInt16LE(4)) dd.writeUInt16LE(cols[cols.length - 1][0] + 1, 4);
      }
      empurrar(registro(T.ROW, dd));
    }
    const primeirasCelulas: number[] = [];
    for (const rw of bloco) {
      const regs = registrosDaLinha(rw, porLinha.get(rw) ?? [], (s) => idx.get(s)!);
      primeirasCelulas.push(regs.length ? p : -1);
      for (const b of regs) empurrar(b);
    }
    // DBCELL: distância até a 1ª ROW do bloco e, por linha, até a 1ª célula (a partir da 2ª ROW / da célula anterior)
    const posDb = p;
    const offs: number[] = [];
    let ref = posLinhas.length > 1 ? posLinhas[1] : inicioBloco + 20;
    for (const pc of primeirasCelulas) {
      if (pc < 0) {
        offs.push(0);
        continue;
      }
      offs.push(pc - ref);
      ref = pc;
    }
    const d = Buffer.alloc(4 + offs.length * 2);
    d.writeUInt32LE(posDb - inicioBloco, 0);
    offs.forEach((o, k) => d.writeUInt16LE(o, 4 + k * 2));
    posDbcells.push(posDb);
    empurrar(registro(T.DBCELL, d));
  }
  for (const r of m.planilhaDepois) empurrar(registro(r.t, Buffer.from(r.d)));
  const planilha = Buffer.concat(partes);
  if (posIndex >= 0) {
    const o = posIndex - inicioPlanilha + 4;
    planilha.writeUInt32LE(0, o);
    planilha.writeUInt32LE(linhasUsadas[0] ?? 0, o + 4);
    planilha.writeUInt32LE((linhasUsadas.at(-1) ?? 0) + 1, o + 8);
    planilha.writeUInt32LE(posDefCol, o + 12);
    posDbcells.forEach((x, k) => planilha.writeUInt32LE(x, o + 16 + k * 4));
  }
  const fluxo = Buffer.concat([globais, planilha]);

  // grava o contêiner com as mesmas partes do modelo (Workbook + propriedades), sem nada a mais
  const arquivos: { nome: string; dados: Buffer }[] = [];
  for (let k = 0; k < m.cfb.FullPaths.length; k++) {
    const ent = m.cfb.FileIndex[k];
    if (ent.type !== 2 || ent.name === "\u0001Sh33tJ5") continue;
    arquivos.push({ nome: ent.name, dados: ent.name === "Workbook" ? fluxo : Buffer.from(ent.content as Uint8Array) });
  }
  const raiz = m.cfb.FileIndex[0];
  return escreverCfb(arquivos, raiz.clsid ? Buffer.from(raiz.clsid as unknown as Uint8Array) : Buffer.alloc(16));
}

// ---------- contêiner (Compound File v3, setores de 512 bytes) ----------
// Só fluxos de 4096 bytes ou mais (o Excel grava as propriedades com 4096), então não há mini-fluxo.
const FIM_CADEIA = 0xfffffffe;
const LIVRE = 0xffffffff;
const SETOR_FAT = 0xfffffffd;

function compararNomes(a: string, b: string) {
  if (a.length !== b.length) return a.length - b.length;
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A < B ? -1 : A > B ? 1 : 0;
}

function escreverCfb(fluxos: { nome: string; dados: Buffer }[], clsidRaiz: Buffer): Buffer {
  for (const f of fluxos) if (f.dados.length < 4096) throw new Error(`fluxo ${JSON.stringify(f.nome)} menor que 4096 bytes`);
  const setores = (n: number) => Math.ceil(n / 512);
  const ordenados = [...fluxos].sort((a, b) => compararNomes(a.nome, b.nome));
  // setores: fluxos em sequência, depois o diretório, depois a FAT
  let proximo = 0;
  const inicio = ordenados.map((f) => {
    const s = proximo;
    proximo += setores(f.dados.length);
    return s;
  });
  const nEntradas = ordenados.length + 1;
  const setoresDir = setores(nEntradas * 128);
  const inicioDir = proximo;
  proximo += setoresDir;
  let nFat = 1;
  while ((proximo + nFat) > nFat * 128) nFat++;
  const inicioFat = proximo;
  const total = proximo + nFat;
  const fat = new Array<number>(nFat * 128).fill(LIVRE);
  ordenados.forEach((f, i) => {
    const n = setores(f.dados.length);
    for (let k = 0; k < n; k++) fat[inicio[i] + k] = k === n - 1 ? FIM_CADEIA : inicio[i] + k + 1;
  });
  for (let k = 0; k < setoresDir; k++) fat[inicioDir + k] = k === setoresDir - 1 ? FIM_CADEIA : inicioDir + k + 1;
  for (let k = 0; k < nFat; k++) fat[inicioFat + k] = SETOR_FAT;
  if (nFat > 109) throw new Error("arquivo grande demais para o contêiner simples");

  // diretório: raiz + fluxos numa árvore balanceada (todos pretos), ordenada pelo nome
  const dir = Buffer.alloc(setoresDir * 512);
  const entrada = (i: number, nome: string, tipo: number, esq: number, dir_: number, filho: number, inicioSetor: number, tamanho: number, clsid?: Buffer) => {
    const o = i * 128;
    dir.write(nome, o, "utf16le");
    dir.writeUInt16LE((nome.length + 1) * 2, o + 64);
    dir[o + 66] = tipo;
    dir[o + 67] = 1;
    dir.writeUInt32LE(esq, o + 68);
    dir.writeUInt32LE(dir_, o + 72);
    dir.writeUInt32LE(filho, o + 76);
    if (clsid) clsid.copy(dir, o + 80, 0, 16);
    dir.writeUInt32LE(inicioSetor, o + 116);
    dir.writeUInt32LE(tamanho, o + 120);
  };
  const arvore = (lo: number, hi: number): number => {
    if (lo > hi) return LIVRE;
    const meio = (lo + hi) >> 1;
    const esq = arvore(lo, meio - 1);
    const dir_ = arvore(meio + 1, hi);
    entrada(meio + 1, ordenados[meio].nome, 2, esq, dir_, LIVRE, inicio[meio], ordenados[meio].dados.length);
    return meio + 1;
  };
  const raizFilho = arvore(0, ordenados.length - 1);
  entrada(0, "Root Entry", 5, LIVRE, LIVRE, raizFilho, FIM_CADEIA, 0, clsidRaiz);
  for (let i = nEntradas; i < setoresDir * 4; i++) {
    dir.writeUInt32LE(LIVRE, i * 128 + 68);
    dir.writeUInt32LE(LIVRE, i * 128 + 72);
    dir.writeUInt32LE(LIVRE, i * 128 + 76);
  }

  const cab = Buffer.alloc(512);
  Buffer.from("d0cf11e0a1b11ae1", "hex").copy(cab, 0);
  cab.writeUInt16LE(0x3e, 24);
  cab.writeUInt16LE(3, 26);
  cab.writeUInt16LE(0xfffe, 28);
  cab.writeUInt16LE(9, 30);
  cab.writeUInt16LE(6, 32);
  cab.writeUInt32LE(nFat, 44);
  cab.writeUInt32LE(inicioDir, 48);
  cab.writeUInt32LE(4096, 56);
  cab.writeUInt32LE(FIM_CADEIA, 60);
  cab.writeUInt32LE(0, 64);
  cab.writeUInt32LE(FIM_CADEIA, 68);
  cab.writeUInt32LE(0, 72);
  for (let k = 0; k < 109; k++) cab.writeUInt32LE(k < nFat ? inicioFat + k : LIVRE, 76 + k * 4);

  const corpo = Buffer.alloc(total * 512);
  ordenados.forEach((f, i) => f.dados.copy(corpo, inicio[i] * 512));
  dir.copy(corpo, inicioDir * 512);
  fat.forEach((v, k) => corpo.writeUInt32LE(v, inicioFat * 512 + k * 4));
  return Buffer.concat([cab, corpo]);
}


function blocosComLinhas(linhas: number[]): number[][] {
  const blocos = new Map<number, number[]>();
  for (const rw of linhas) {
    const b = Math.floor(rw / 32);
    if (!blocos.has(b)) blocos.set(b, []);
    blocos.get(b)!.push(rw);
  }
  return [...blocos.keys()].sort((a, b) => a - b).map((b) => blocos.get(b)!);
}

/** Fluxo Workbook de um arquivo .xls (para testes de ida e volta). */
export function fluxoWorkbook(arquivo: Buffer): Buffer {
  const cfb = XLSX.CFB.read(arquivo, { type: "buffer" });
  return Buffer.from(XLSX.CFB.find(cfb, "Workbook")!.content as Uint8Array);
}

export const _teste = { numeroParaRk, rkParaNumero, lerSst, lerRegistros };
