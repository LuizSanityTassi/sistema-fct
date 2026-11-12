/* Motor de conciliação DDA Itaú (CNAB 240) × Contas a Pagar Trier. */
// Portado de conciliacao-dda/motor.js (mesma lógica da ferramenta em produção). Módulo ES; roda no servidor (Node).

// ---------- utilitários ----------
const DIA = 86400000;
const dnum = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DIA);
// data só vale se existir de verdade (31/02 não vira 03/03)
const dataOk = (y, m, d) => { if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null; const n = dnum(y, m, d), x = new Date(n * DIA); return x.getUTCDate() === d && x.getUTCMonth() === m - 1 ? n : null; };
const dtxt = n => { if (n == null) return ''; const d = new Date(n * DIA); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
const ddmmyyyy = s => (/^\d{8}$/.test(s) && s !== '00000000') ? dataOk(+s.slice(4, 8), +s.slice(2, 4), +s.slice(0, 2)) : null;
const ddmmyy = s => { const m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s); return m ? dataOk(2000 + +m[3], +m[2], +m[1]) : null; };
const cent = v => Math.round(v * 100);
// mínimo/máximo sem estourar a pilha com listas enormes (Math.min(...lista) quebra acima de ~100 mil itens)
const minDe = l => { let m = Infinity; for (const v of l) if (v < m) m = v; return m; };
const maxDe = l => { let m = -Infinity; for (const v of l) if (v > m) m = v; return m; };
const brl = s => parseFloat(s.replace(/\./g, '').replace(',', '.'));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const cnpjFmt = s => { s = String(s || '').replace(/\D/g, '').slice(-14).padStart(14, '0'); return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5'); };

// ---------- DDA (.RET CNAB 240 Itaú, segmentos G/H) ----------
function parseRET(texto, arquivo) {
  const linhas = texto.split(/\r?\n/);
  const h = linhas[0] || '';
  if (h.slice(0, 3) !== '341' || h[7] !== '0') throw new Error(arquivo + ': não parece um arquivo de retorno do Itaú (CNAB 240).');
  const out = {
    arquivo, empresaCnpj: h.slice(18, 32), empresaNome: h.slice(72, 102).trim(),
    // data, hora e NSA (sequência) da geração: desempatam a ordem entre arquivos do mesmo dia
    geracao: ddmmyyyy(h.slice(143, 151)), hora: h.slice(151, 157), nsa: parseInt(h.slice(157, 163), 10) || 0, titulos: [], lotes: []
  };
  for (const l of linhas) {
    if (l.length < 14) continue;
    if (l[7] === '1') out.lotes.push({ cnpj: l.slice(18, 33).slice(-14), nome: l.slice(73, 103).trim() });
    if (l[7] === '3' && l[13] === 'G') {
      if (l.length < 189 || !/^\d{15}$/.test(l.slice(115, 130))) { out.ignoradas = (out.ignoradas || 0) + 1; continue; } // linha cortada/danificada
      const tipo = l[61];
      const venc = ddmmyyyy(l.slice(107, 115)), valor = parseInt(l.slice(115, 130), 10) / 100;
      const dCod = l[204], dAte = ddmmyyyy(l.slice(205, 213)), dCampo = parseInt(l.slice(213, 228), 10) / 100 || 0;
      let desconto = null;
      if ((dCod === '1' || dCod === '2') && dCampo > 0) {
        const rs = dCod === '2' ? Math.round(valor * dCampo) / 100 : dCampo;
        desconto = { valor: rs, ate: dAte, percentual: dCod === '2' ? dCampo : null, noVencimento: dAte != null && venc != null && dAte >= venc };
      }
      out.titulos.push({
        arquivo, geracao: out.geracao, mov: l.slice(15, 17), barra: l.slice(17, 61),
        doc: l.slice(62, 77), raiz: l.slice(62, 77).slice(-14, -6), tipo,
        nome: l.slice(77, 107).trim(), venc, valor, numdoc: l.slice(147, 162).trim(), desconto,
        emis: ddmmyyyy(l.slice(181, 189)),
        pagador: out.lotes.length ? out.lotes[out.lotes.length - 1].cnpj : out.empresaCnpj
      });
    }
  }
  if (!out.titulos.length && !out.lotes.length) throw new Error(arquivo + ': nenhum título encontrado.');
  return out;
}

// ---------- DDA pela planilha do portal Itaú ("Boletos Recebidos", .xlsx) ----------
// linhas = matriz (array de arrays) da 1ª aba.
function parseItauPlanilha(linhas, arquivo) {
  const iH = linhas.findIndex(r => r && r.some(c => /benefici/i.test(String(c || ''))) && r.some(c => /digo de barras/i.test(String(c || ''))));
  if (iH < 0) throw new Error(arquivo + ': não encontrei as colunas "Beneficiário" e "Código de barras".');
  const H = linhas[iH].map(c => norm(c));
  const col = re => H.findIndex(h => re.test(h));
  const c = { pag: col(/^PAGADOR/), ben: col(/^BENEFICIARIO/), doc: col(/CPF|CNPJ/), venc: col(/^VENC/), num: col(/DOC/), ate: col(/ATE VENC/), pagar: col(/A PAGAR/), tipo: col(/TIPO/), barra: col(/CODIGO DE BARRAS/) };
  let cnpjEmp = '', nomeEmp = '';
  for (const r of linhas.slice(0, iH)) { const t = String((r || [])[0] || ''); let m = /CPF\/CNPJ:\s*([\d./-]+)/i.exec(t); if (m) cnpjEmp = m[1].replace(/\D/g, ''); m = /Nome da empresa:\s*(.*)/i.exec(t); if (m) nomeEmp = m[1].trim(); }
  const num = v => typeof v === 'number' ? v : brl(String(v || '0'));
  const data = v => { if (v instanceof Date) return dnum(v.getFullYear(), v.getMonth() + 1, v.getDate()); if (typeof v === 'number') return Math.round(v - 25569); const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim()); return m ? dnum(+m[3], +m[2], +m[1]) : null; };
  const titulos = [];
  for (const r of linhas.slice(iH + 1)) {
    if (!r || !r[c.ben] || !r[c.barra]) continue;
    const cnpj = String(r[c.doc] || '').replace(/\D/g, '');
    titulos.push({ arquivo, geracao: null, mov: '01', barra: String(r[c.barra]).replace(/\D/g, ''), doc: cnpj.padStart(15, '0'), raiz: cnpj.padStart(14, '0').slice(0, 8), tipo: cnpj.length > 11 ? '2' : '1',
      nome: String(r[c.ben]).trim(), venc: data(r[c.venc]), valor: num(r[c.ate >= 0 ? c.ate : c.pagar]), numdoc: String(r[c.num] ?? '').trim(), emis: null,
      tipoBoleto: c.tipo >= 0 ? String(r[c.tipo] || '') : '', pagador: c.pag >= 0 ? String(r[c.pag] || '') : '' });
    const ult = titulos[titulos.length - 1];
    if (c.ate >= 0 && c.pagar >= 0) { const df = Math.round((num(r[c.ate]) - num(r[c.pagar])) * 100) / 100; if (df > 0.004) ult.desconto = { valor: df, ate: null, percentual: null, noVencimento: null }; }
  }
  titulos.forEach(t => { t.pagadorCnpj = cnpjEmp; });
  if (!titulos.length) throw new Error(arquivo + ': nenhum boleto na planilha.');
  return { arquivo, empresaCnpj: cnpjEmp, empresaNome: nomeEmp || 'Planilha do Itaú', geracao: null, titulos, lotes: [], planilha: true };
}

// ---------- Trier (relatório "Contas a Pagar ou Pagas", detalhado) ----------
// Recebe as linhas de texto já montadas (uma por linha visual do PDF).
// documento "NF/parcela-dígito" (21527/02-0) ou só "número-dígito" (32504943-1 Genesio, 8804479405-0 Santa Cruz, E13709-1)
const RX_TIT = /^(\S+?\/\d{2}-\d|[A-Z]?\d+-\d)\s*(\d{1,3})\s*(.*?)\s*(\d{2}\/\d{2}\/\d{2})\s+(\d{2}\/\d{2}\/\d{2})\s+(.*)$/;
const RX_NUM = /^-?[\d.]+,\d{1,2}$/;
function parseTrier(linhas) {
  const titulos = []; let forn = null, totalGeral = null, ignoradas = [];
  for (const raw of linhas) {
    const l = raw.replace(/\s+/g, ' ').trim();
    let m = /^Fornecedor:\s*(\d+)\s+(.*)$/.exec(l);
    if (m) { forn = { cod: m[1], nome: m[2].trim() }; continue; }
    m = /^Total Geral:\s*([\d.]+,\d{2})/.exec(l);
    if (m) { totalGeral = brl(m[1]); continue; }
    m = RX_TIT.exec(l);
    if (!m || !forn) continue;
    const nums = m[6].split(' ').filter(t => RX_NUM.test(t));
    if (nums.length < 4) { ignoradas.push(l); continue; }
    titulos.push({
      doc: m[1], fil: parseInt(m[2], 10), fcod: forn.cod, forn: forn.nome, curto: m[3].trim(),
      emis: ddmmyy(m[4]), venc: ddmmyy(m[5]), valor: brl(nums[0]), pagar: brl(nums[3])
    });
  }
  return { titulos, totalGeral, ignoradas };
}

// Relatório "Contas a Pagar ou Pagas" do Trier salvo em XLS/XLSX (Saída = XLS): vira as mesmas linhas de texto do PDF
function linhasDeTrierPlanilha(rows) {
  const d2 = v => { if (typeof v === 'number' && v > 20000 && v < 80000) { const t = dtxt(Math.round(v) - 25569); return t.slice(0, 6) + t.slice(8); }
    const s = String(v || '').trim(); const m = /^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/.exec(s); return m ? m[1] + '/' + m[2] + '/' + m[3].slice(-2) : s; };
  const n2 = v => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : String(v).trim();
  const out = [];
  for (const r of rows) {
    const c = (r || []).map(v => typeof v === 'string' ? v.trim() : v).filter(v => v !== '' && v != null);
    if (!c.length) continue;
    const a = String(c[0]);
    if (/^Fornecedor:$/i.test(a) && c.length > 1) { out.push('Fornecedor: ' + String(c[1]).trim()); continue; }
    if (/^Fornecedor:/i.test(a)) { out.push(a); continue; }
    if (/^Total Geral:$/i.test(a) && typeof c[1] === 'number') { out.push('Total Geral: ' + c[1].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })); continue; }
    if (/^(\S+?\/\d{2}|[A-Z]?\d+)-\d$/.test(a) && c.length >= 6) {
      // Documento, Filial, Fornec.(curto), Emissão, Vencto., valores…  (o nome curto pode faltar)
      let k = 1; const fil = c[k++]; let curto = '';
      if (typeof c[k] === 'string' && !/^\d{2}\/\d{2}\/\d{2,4}$/.test(c[k])) curto = c[k++];
      const emis = d2(c[k++]), venc = d2(c[k++]);
      const nums = c.slice(k).filter(v => typeof v === 'number' || /^-?[\d.]+,\d{1,2}$/.test(String(v))).map(n2);
      out.push([a, fil, curto, emis, venc, ...nums].join(' '));
    }
  }
  return out;
}
// Monta linhas a partir dos itens de texto do pdf.js já convertidos para a tela
// ({str, x, y} com y crescendo para baixo; o relatório da Trier vem em página girada).
function linhasDeItens(itens) {
  const rows = [];
  for (const it of itens) {
    if (!it.str || !it.str.trim()) continue;
    let r = rows.find(r => Math.abs(r.y - it.y) <= 2);
    if (!r) { r = { y: it.y, its: [] }; rows.push(r); }
    r.its.push({ x: it.x, s: it.str });
  }
  rows.sort((a, b) => a.y - b.y);
  return rows.map(r => r.its.sort((a, b) => a.x - b.x).map(i => i.s).join(' '));
}
// Converte os itens de uma página do pdf.js (usa a matriz da viewport, que já trata a rotação).
function itensDaPagina(pdfjsLib, page, textContent) {
  const vp = page.getViewport({ scale: 1 });
  return textContent.items.map(it => { const t = pdfjsLib.Util.transform(vp.transform, it.transform); return { str: it.str, x: t[4], y: t[5] }; });
}

// ---------- Conciliação ----------
const ROTULO = {
  EXATO: 'Bateu exato', TAXA: 'Bateu (+ tarifa do boleto)', AGRUPADO: 'Bateu (várias notas num boleto)', COMBINACAO: 'Bateu (notas somadas num boleto)', VALOR_DATA: 'Bateu por valor e vencimento (beneficiário diferente)',
  DESCONTO: 'Bateu (Trier já com o desconto do boleto)', LIQUIDO: 'Bateu pelo valor líquido do Trier (com devolução/desconto)', DOCUMENTO: 'Bateu pelo nº do documento (conferir valor)', FILIAL: 'Bateu, mas o boleto é de outra filial (conferir)', DATA: 'Vencimento diferente', VALOR: 'Valor diferente',
  SO_TRIER: 'Só no Trier', SEM_ARQUIVO: 'Só no Trier (fora do período coberto pelos arquivos do banco)'
};

function conciliar(trierTit, ddaArquivos, opt) {
  opt = Object.assign({ filMin: 301, filMax: 504, dePara: [], taxaMax: 5, diasData: 4, toleranciaValor: 0.03, maxCombinacao: 16 }, opt || {});
  const T = trierTit.filter(t => t.fil >= opt.filMin && t.fil <= opt.filMax && t.venc != null)
    .map((t, j) => Object.assign({}, t, { j, m: null }));
  if (!T.length) throw new Error('Nenhum título do Trier nas filiais ' + opt.filMin + ' a ' + opt.filMax + '.');
  const vmin = minDe(T.map(t => t.venc)), vmax = maxDe(T.map(t => t.venc));

  // DDA: último estado de cada boleto, sem os baixados (mov 31). O boleto é identificado pelo código de barras + filial pagadora
  // quando ela é "forte" (planilha do portal de UMA filial, ou lote do .RET com CNPJ de filial que não é a matriz /0001); sem
  // filial forte (lote da matriz, CNPJ fora do cadastro, planilha sem filial no nome) ele entra "sem filial" e é juntado ao mesmo
  // boleto com filial forte. Em todo caso fica o ESTADO MAIS NOVO: ordem = data de geração do .RET ou dia em que a planilha entrou
  // no sistema; empate = .RET depois da planilha, depois NSA e hora do cabeçalho. Assim o mesmo boleto que chega pela planilha
  // do portal e pelo .RET do agente conta uma vez só, e boleto igual em filiais diferentes continua contando em cada uma.
  const ordemArq = a => (a.geracao != null ? a.geracao : (a.exportadoEm || 0));
  const arqs = ddaArquivos.slice().sort((a, b) => ordemArq(a) - ordemArq(b) || (a.geracao != null) - (b.geracao != null) || (a.nsa || 0) - (b.nsa || 0) || String(a.hora || '').localeCompare(String(b.hora || '')));
  const cnpjPagador = d => String(d.pagadorCnpj || d.pagador || '').replace(/\D/g, '').slice(-14);
  const filialDe = d => d.filialArquivo || (opt.filialDeCnpj ? opt.filialDeCnpj(cnpjPagador(d)) : null) || null;
  // a planilha traz sempre o CNPJ da matriz no cabeçalho: nela só vale a filial do arquivo; no .RET vale o lote fora da matriz
  const filialForte = d => d.filialArquivo || (d.geracao != null && cnpjPagador(d).slice(8, 12) !== '0001' ? filialDe(d) : null) || null;
  const U = new Map();
  let ordem = 0;
  for (const a of arqs) for (const d of a.titulos) U.set(d.barra + '|' + (filialForte(d) || ''), Object.assign({}, d, { _ordem: ++ordem }));
  // o mesmo boleto visto sem filial forte e também com filial é um só: ficam a filial e o pagador do registro forte, com o estado mais novo
  const fortesDa = new Map();
  for (const k of U.keys()) if (!k.endsWith('|')) { const b = k.slice(0, k.indexOf('|')); let l = fortesDa.get(b); if (!l) fortesDa.set(b, l = []); l.push(k); }
  for (const k of [...U.keys()]) {
    if (!k.endsWith('|')) continue;
    const fortes = fortesDa.get(k.slice(0, -1)); if (!fortes) continue;
    const fraco = U.get(k); U.delete(k);
    for (const kf of fortes) {
      const forte = U.get(kf);
      if (fraco._ordem > forte._ordem) U.set(kf, Object.assign({}, fraco, { filialArquivo: forte.filialArquivo, pagador: forte.pagador, pagadorCnpj: forte.pagadorCnpj }));
    }
  }
  const Dd = [...U.values()].filter(d => d.mov !== '31' && d.venc != null && d.venc >= vmin && d.venc <= vmax)
    .map((d, i) => Object.assign({}, d, { i }));
  Dd.forEach(d => {
    const cnpjPag = cnpjPagador(d);
    d.fil = filialDe(d);
    // boleto de arquivo de UMA filial só pode bater com título da mesma filial; o da matriz (/0001) costuma trazer as filiais juntas
    d.filForte = d.fil != null && (!!d.filialArquivo || (cnpjPag.length === 14 && cnpjPag.slice(8, 12) !== '0001'));
  });
  const filOk = (i, fil) => !Dd[i].filForte || fil == null || Dd[i].fil === fil;
  // a planilha do portal é uma foto de TODOS os boletos em aberto: com ela, não existe "fora do período" por data de emissão
  const temPlanilha = arqs.some(a => a.geracao == null);
  // os vencimentos que o banco listou: o estado atual dos boletos mais tudo o que cada planilha trouxe (a baixa que chega depois
  // pelo .RET não encolhe o período que a foto do portal cobriu)
  const titulosPlanilha = temPlanilha ? arqs.filter(a => a.geracao == null).flatMap(a => a.titulos) : [];
  const vencsBanco = [...U.values()].filter(d => d.mov !== '31' && d.venc != null).map(d => d.venc).concat(titulosPlanilha.filter(d => d.venc != null).map(d => d.venc));
  // primeiro vencimento que o banco listou (ex.: relatório do portal só traz a partir de hoje)
  const bancoVencIni = vencsBanco.length ? minDe(vencsBanco) : null;
  const geracoes = arqs.map(a => a.geracao).filter(x => x != null);
  // ...mas a foto é do período de vencimento pedido no portal: título que vence depois do último boleto dela está fora
  const bancoVencFim = temPlanilha && vencsBanco.length ? maxDe(vencsBanco) : null;
  const cobIni = geracoes.length && !temPlanilha ? minDe(geracoes) - 1 : null;
  const cobFim = geracoes.length ? maxDe(geracoes) - 8 : null;
  // cada planilha é a foto de UMA filial, com o período que foi pedido para ela: o que está coberto vale filial a filial
  const cobFilial = new Map();
  // algum boleto do banco sem filial conhecida (CNPJ fora do cadastro)? aí não dá para dizer que uma filial "não tem arquivo"
  let boletoSemFilial = temPlanilha && arqs.some(a => a.titulos.some(d => d.mov !== '31' && d.venc != null && !filialDe(d)));
  if (temPlanilha) for (const d of [...U.values(), ...titulosPlanilha]) {
    if (d.mov === '31' || d.venc == null) continue;
    const f = filialDe(d);
    if (!f) continue;
    const c = cobFilial.get(f);
    if (!c) cobFilial.set(f, { ini: d.venc, fim: d.venc });
    else { if (d.venc < c.ini) c.ini = d.venc; if (d.venc > c.fim) c.fim = d.venc; }
  }

  const used = new Set();
  const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); a.push(v); return a; };
  const byv = new Map(); Dd.forEach(d => push(byv, d.venc, d.i));

  // 1) Aprende fornecedor Trier -> raiz do CNPJ no DDA (+ tarifa típica), por pares valor/vencimento
  const tv = new Map(); T.forEach(t => push(tv, t.fcod + '|' + t.venc, t.j));
  const votos = new Map();
  for (const [k, js] of tv) {
    const v = +k.split('|')[1], f = k.split('|')[0];
    let vf = votos.get(f); if (!vf) votos.set(f, vf = new Map());
    for (const j of js) for (const i of (byv.get(v) || [])) {
      const df = cent(Dd[i].valor) - cent(T[j].valor);
      if (df >= 0 && df <= opt.taxaMax * 100) { const kk = Dd[i].raiz + '|' + df; vf.set(kk, (vf.get(kk) || 0) + 1); }
    }
  }
  const MAP = new Map(); // fcod -> Map(raiz -> [taxas em centavos])
  const taxasDe = new Map();
  for (const [f, vf] of votos) {
    const tot = new Map();
    for (const [kk, n] of vf) { const r = kk.split('|')[0]; tot.set(r, (tot.get(r) || 0) + n); }
    const mf = new Map();
    [...tot].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([r, n]) => {
      if (n < 3) return;
      const dfs = [...vf].filter(([kk]) => kk.split('|')[0] === r).map(([kk, c]) => [+kk.split('|')[1], c]).sort((a, b) => b[1] - a[1]);
      const top = dfs.slice(0, 2).filter(([, c]) => c >= Math.max(3, 0.15 * n)).map(([df]) => df);
      if (top.length) mf.set(r, [...new Set([0, ...top])].sort((a, b) => a - b));
    });
    if (mf.size) MAP.set(f, mf);
    taxasDe.set(f, [...new Set([].concat(...[...mf.values()]))]);
  }
  // 1b) De-para do financeiro (boleto em nome de fundo/securitizadora -> fornecedor real)
  const fornNomes = new Map(); T.forEach(t => fornNomes.set(t.fcod, norm(t.forn)));
  const ddaNomes = new Map(); Dd.forEach(d => { const n = norm(d.nome); if (!ddaNomes.has(n)) ddaNomes.set(n, new Set()); ddaNomes.get(n).add(d.raiz); });
  for (const e of (opt.dePara || [])) {
    const alvoDda = norm(e.dda); if (!alvoDda || !(e.fornecedor || []).length) continue;
    const raizes = new Set(); for (const [n, rs] of ddaNomes) if (n.startsWith(alvoDda)) rs.forEach(r => raizes.add(r));
    for (const fn of e.fornecedor) {
      const a = norm(fn); if (!a) continue;
      for (const [f, n] of fornNomes) if (n.includes(a)) {
        let mf = MAP.get(f); if (!mf) MAP.set(f, mf = new Map());
        for (const r of raizes) if (!mf.has(r)) mf.set(r, [...new Set([0, ...(taxasDe.get(f) || [])])]);
      }
    }
  }

  // 1c) Mesmo nome (1ª palavra significativa) no Trier e no DDA -> mesma empresa
  const PARAR = new Set(['LTDA', 'S', 'SA', 'DE', 'DA', 'DO', 'DOS', 'E', 'CIA', 'ME', 'EPP', 'EIRELI', 'EIRELLI', 'DIST', 'DISTR', 'DISTRIB', 'DISTRIBUIDORA', 'DISTRIBUICAO', 'COM', 'COMERCIO', 'IND', 'INDUSTRIA', 'PROD', 'PRODUTOS', 'GRUPO', 'BANCO']);
  const chaveNome = n => (norm(n).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 3 && !PARAR.has(w))[0]) || '';
  const raizPorNome = new Map(); Dd.forEach(d => { const k = chaveNome(d.nome); if (k.length >= 4) { if (!raizPorNome.has(k)) raizPorNome.set(k, new Set()); raizPorNome.get(k).add(d.raiz); } });
  for (const [f, n] of fornNomes) {
    const rs = raizPorNome.get(chaveNome(n)); if (!rs) continue;
    let mf = MAP.get(f); if (!mf) MAP.set(f, mf = new Map());
    for (const r of rs) mf.set(r, [...new Set([...(mf.get(r) || []), 0, 139, 150, 199, 399, ...(taxasDe.get(f) || [])])].sort((x, y) => x - y));
  }

  // 1d) Correspondências aprendidas em conciliações anteriores (e as bloqueadas pelo financeiro)
  for (const ap of (opt.aprendido || [])) {
    const nf = norm(ap.forn); if (!nf || !ap.raiz) continue;
    for (const [f, n] of fornNomes) if (n === nf) {
      let mf = MAP.get(f);
      if (ap.bloqueado) { if (mf) mf.delete(ap.raiz); continue; }
      if (!mf) MAP.set(f, mf = new Map());
      mf.set(ap.raiz, [...new Set([...(mf.get(ap.raiz) || []), 0, ...(ap.taxas || [])])].sort((x, y) => x - y));
    }
  }

  const chave = new Map(); Dd.forEach(d => push(chave, d.raiz + '|' + cent(d.valor) + '|' + d.venc, d.i));
  // outraFilial = true só no último passe ("filial diferente, conferir")
  function achar(f, valc, v, fil, outraFilial) {
    const mf = MAP.get(f); if (!mf) return null;
    let reserva = null;
    for (const [r, taxas] of mf) for (const tx of taxas)
      for (const i of (chave.get(r + '|' + (valc + tx) + '|' + v) || [])) if (!used.has(i)) {
        if (fil == null || Dd[i].fil == null || Dd[i].fil === fil) return [i, tx];
        if (!reserva && (outraFilial || !Dd[i].filForte)) reserva = [i, tx];
      }
    return reserva;
  }
  const marcar = (t, tipo, i, tx) => { t.m = { tipo, i, taxa: tx }; };
  function agrupa(kf) {
    const g = new Map(); T.forEach(t => { if (!t.m) push(g, kf(t), t); });
    for (const ts of g.values()) {
      if (ts.length < 2) continue;
      const r = achar(ts[0].fcod, ts.reduce((s, t) => s + cent(t.valor), 0), ts[0].venc, ts[0].fil);
      if (r) { used.add(r[0]); ts.forEach(t => marcar(t, 'AGRUPADO', r[0], r[1])); }
    }
  }
  // 2) Grupo inteiro por filial + emissão (ex.: Genesio, 1 boleto por loja por dia)
  agrupa(t => t.fcod + '|' + t.fil + '|' + t.emis + '|' + t.venc);
  // 3) Título a título (exato ou com tarifa)
  for (const t of T) if (!t.m) { const r = achar(t.fcod, cent(t.valor), t.venc, t.fil); if (r) { used.add(r[0]); marcar(t, r[1] ? 'TAXA' : 'EXATO', r[0], r[1]); } }
  // 3b) Valor líquido do Trier (duplicata menos devolução/desconto lançados no Trier)
  for (const t of T) if (!t.m && t.pagar != null && cent(t.pagar) !== cent(t.valor) && t.pagar > 0) { const r = achar(t.fcod, cent(t.pagar), t.venc, t.fil); if (r) { used.add(r[0]); marcar(t, 'LIQUIDO', r[0], r[1]); } }
  // 4) Vencimento deslocado alguns dias (fim de semana/feriado)
  for (const t of T) if (!t.m) {
    for (let k = 1; k <= opt.diasData && !t.m; k++) for (const dd of [k, -k]) {
      const r = achar(t.fcod, cent(t.valor), t.venc + dd, t.fil); if (r) { used.add(r[0]); marcar(t, 'DATA', r[0], r[1]); break; }
    }
  }
  // 4b) Valor e vencimento idênticos e únicos dos dois lados (boleto em nome de fundo/banco, por exemplo)
  {
    const livresD = new Map(); Dd.forEach(d => { if (!used.has(d.i)) push(livresD, cent(d.valor) + '|' + d.venc, d.i); });
    const livresT = new Map(); T.forEach(t => { if (!t.m) push(livresT, cent(t.valor) + '|' + t.venc, t); });
    for (const [k, ts] of livresT) { const is = livresD.get(k); if (ts.length === 1 && is && is.length === 1 && filOk(is[0], ts[0].fil)) { used.add(is[0]); marcar(ts[0], 'VALOR_DATA', is[0], 0); } }
  }
  // 5) Agrupamentos mais largos
  agrupa(t => t.fcod + '|' + t.venc + '|' + t.fil);
  agrupa(t => t.fcod + '|' + t.venc);
  // 5b) Mesmo fornecedor com mais de um código no Trier (ex.: duas "Profarma"): agrupa pelo nome
  agrupa(t => chaveNome(t.forn) + '|' + t.fil + '|' + t.emis + '|' + t.venc);
  agrupa(t => chaveNome(t.forn) + '|' + t.fil + '|' + t.venc);
  // 6) Combinação de notas dentro da mesma filial/vencimento
  {
    const g = new Map(); T.forEach(t => { if (!t.m) push(g, t.fcod + '|' + t.fil + '|' + t.venc, t); });
    for (const ts0 of g.values()) {
      if (ts0.length < 2 || ts0.length > opt.maxCombinacao) continue;
      const mf = MAP.get(ts0[0].fcod); if (!mf) continue;
      const alvos = new Map();
      for (const i of (byv.get(ts0[0].venc) || [])) if (!used.has(i) && mf.has(Dd[i].raiz) && filOk(i, ts0[0].fil)) for (const tx of mf.get(Dd[i].raiz)) { const k = cent(Dd[i].valor) - tx; if (!alvos.has(k)) alvos.set(k, [i, tx]); }
      if (!alvos.size) continue;
      let livres = ts0.slice();
      let achou = true;
      while (achou && livres.length >= 2) {
        achou = false;
        const n = livres.length, vals = livres.map(t => cent(t.valor));
        for (let mask = 3; mask < (1 << n) && !achou; mask++) {
          if ((mask & (mask - 1)) === 0) continue;
          let s = 0; for (let b = 0; b < n; b++) if (mask & (1 << b)) s += vals[b];
          const a = alvos.get(s);
          if (a && !used.has(a[0])) {
            used.add(a[0]); alvos.delete(s);
            const sel = livres.filter((_, b) => mask & (1 << b));
            sel.forEach(t => marcar(t, 'COMBINACAO', a[0], a[1]));
            livres = livres.filter((_, b) => !(mask & (1 << b))); achou = true;
          }
        }
      }
    }
  }
  // 6b) Número do documento: a nota do Trier aparece no nº do documento do boleto (vencimento até 10 dias e valor até 15%)
  {
    const grupos = s => (String(s || '').match(/\d+/g) || []).map(x => x.replace(/^0+/, '')).filter(x => x.length >= 4);
    const docsD = Dd.map(d => grupos(d.numdoc));
    for (const t of T) if (!t.m) {
      const nota = ((/^(\d+)/.exec(t.doc) || [])[1] || '').replace(/^0+/, '');
      if (nota.length < 4) continue;
      const mf = MAP.get(t.fcod);
      let best = null;
      for (let dd = -10; dd <= 10; dd++) for (const i of (byv.get(t.venc + dd) || [])) {
        if (used.has(i) || !filOk(i, t.fil)) continue;
        if (!docsD[i].some(g => g === nota || (nota.length >= 5 && g.includes(nota)))) continue;
        const df = Math.abs(Dd[i].valor - t.valor);
        if (df > Math.max(0.15 * t.valor, 5)) continue;
        const nota2 = (mf && mf.has(Dd[i].raiz) ? 0 : 1) * 1e6 + (Dd[i].fil != null && Dd[i].fil !== t.fil ? 1 : 0) * 1e5 + Math.abs(dd) * 100 + df;
        if (!best || nota2 < best[0]) best = [nota2, i];
      }
      if (best) { used.add(best[1]); marcar(t, 'DOCUMENTO', best[1], null); }
    }
  }
  // 6c) Mesmo valor e fornecedor, vencimento até 10 dias de diferença
  for (const t of T) if (!t.m) {
    for (let k = opt.diasData + 1; k <= 10 && !t.m; k++) for (const dd of [k, -k]) {
      const r = achar(t.fcod, cent(t.valor), t.venc + dd, t.fil); if (r) { used.add(r[0]); marcar(t, 'DATA', r[0], r[1]); break; }
    }
  }
  // 7) Mesmo fornecedor e vencimento, valor parecido
  for (const t of T) if (!t.m) {
    const mf = MAP.get(t.fcod); if (!mf) continue;
    let best = null;
    for (const i of (byv.get(t.venc) || [])) {
      if (used.has(i) || !mf.has(Dd[i].raiz) || !filOk(i, t.fil)) continue;
      const df = Math.abs(Dd[i].valor - t.valor);
      if (df <= Math.max(opt.toleranciaValor * t.valor, 0.10) && (!best || df < best[0])) best = [df, i];
    }
    if (best) { used.add(best[1]); marcar(t, 'VALOR', best[1], null); }
  }

  // 8) Mesmo fornecedor, valor e vencimento, mas o boleto é de OUTRA filial (lançado na filial errada no Trier?)
  for (const t of T) if (!t.m) {
    for (const dd of [0, 1, -1, 2, -2, 3, -3]) { const r = achar(t.fcod, cent(t.valor), t.venc + dd, t.fil, true); if (r) { used.add(r[0]); marcar(t, 'FILIAL', r[0], r[1]); break; } }
  }

  // Classificação final
  for (const t of T) {
    const cf = cobFilial.get(t.fil);
    const foraBanco = cf
      ? t.venc < cf.ini || t.venc > cf.fim
      : (temPlanilha && !boletoSemFilial) || (bancoVencIni != null && t.venc < bancoVencIni) || (bancoVencFim != null && t.venc > bancoVencFim); // filial sem arquivo do banco
    t.resultado = t.m ? t.m.tipo : (!foraBanco && (cobIni == null || (t.emis >= cobIni && t.emis <= cobFim)) ? 'SO_TRIER' : 'SEM_ARQUIVO');
    if (t.m) {
      const d = Dd[t.m.i]; t.dda = d; t.diferenca = (t.m.tipo === 'AGRUPADO' || t.m.tipo === 'COMBINACAO') ? null : Math.round((d.valor - t.valor) * 100) / 100;
      if (t.m.tipo === 'VALOR' && d.desconto && d.desconto.noVencimento !== false && Math.abs(d.valor - d.desconto.valor - t.valor) < 0.011) { t.m.tipo = 'DESCONTO'; t.resultado = 'DESCONTO'; }
    }
  }
  const alertaDe = d => { const n = norm(d.nome); for (const e of (opt.dePara || [])) if (e.dda && n.startsWith(norm(e.dda))) return e; return null; };
  const soDDA = Dd.filter(d => !used.has(d.i)).map(d => { const e = alertaDe(d); return Object.assign({}, d, { deParaFornecedor: e ? (e.fornecedor || []).join(', ') : '', alerta: e && e.alerta ? e.alerta : '' }); });

  const descVenc = Dd.filter(d => d.desconto && d.desconto.noVencimento === true);
  const descAntec = Dd.filter(d => d.desconto && d.desconto.noVencimento === false);
  const descSemData = Dd.filter(d => d.desconto && d.desconto.noVencimento == null);
  const descontos = { noVencimento: { qtd: descVenc.length, valor: descVenc.reduce((s, d) => s + d.desconto.valor, 0) },
    soAntecipado: { qtd: descAntec.length, valor: descAntec.reduce((s, d) => s + d.desconto.valor, 0) },
    semData: { qtd: descSemData.length, valor: descSemData.reduce((s, d) => s + d.desconto.valor, 0) } };
  const resumo = {};
  for (const k of Object.keys(ROTULO)) resumo[k] = { qtd: 0, valor: 0 };
  T.forEach(t => { resumo[t.resultado].qtd++; resumo[t.resultado].valor += t.valor; });
  const totalT = T.reduce((s, t) => s + t.valor, 0);
  const bateu = ['EXATO', 'TAXA', 'LIQUIDO', 'AGRUPADO', 'COMBINACAO', 'VALOR_DATA', 'DESCONTO', 'DOCUMENTO', 'DATA'];
  return {
    T, D: Dd, soDDA, resumo, descontos, totalTrier: totalT, qtdTrier: T.length,
    totalDDA: Dd.reduce((s, d) => s + d.valor, 0), qtdDDA: Dd.length,
    totalSoDDA: soDDA.reduce((s, d) => s + d.valor, 0),
    pctBateu: T.filter(t => bateu.includes(t.resultado)).length / T.length,
    pctValorBateu: T.filter(t => bateu.includes(t.resultado)).reduce((s, t) => s + t.valor, 0) / totalT,
    // pares fornecedor do Trier ↔ CNPJ do boleto que bateram com segurança (o servidor guarda para as próximas)
    paresAprendidos: (() => { const m = new Map();
      T.filter(t => t.m && ['EXATO', 'TAXA', 'AGRUPADO', 'LIQUIDO'].includes(t.m.tipo)).forEach(t => { const d = Dd[t.m.i], k = norm(t.forn) + '|' + d.raiz; let x = m.get(k); if (!x) m.set(k, x = { forn: t.forn, raiz: d.raiz, benef: d.nome, taxas: new Set(), n: 0 }); x.n++; if (t.m.taxa) x.taxas.add(t.m.taxa); });
      return [...m.values()].filter(x => x.n >= 2).map(x => Object.assign(x, { taxas: [...x.taxas] })); })(),
    vencIni: vmin, vencFim: vmax, cobIni, cobFim, bancoVencIni, bancoVencFim,
    taxas: [...taxasDe].map(([f, tx]) => ({ fornecedor: (T.find(t => t.fcod === f) || {}).forn, taxas: tx.filter(x => x > 0).map(x => x / 100) })).filter(x => x.fornecedor && x.taxas.length)
  };
}

const BATEU = ['EXATO', 'TAXA', 'LIQUIDO', 'AGRUPADO', 'COMBINACAO', 'VALOR_DATA', 'DESCONTO', 'DOCUMENTO', 'DATA'];
const API = { minDe, maxDe, BATEU, parseRET, parseItauPlanilha, parseTrier, linhasDeTrierPlanilha, linhasDeItens, itensDaPagina, conciliar, ROTULO, dtxt, cnpjFmt, norm };
export const Motor = API;
export default API;
