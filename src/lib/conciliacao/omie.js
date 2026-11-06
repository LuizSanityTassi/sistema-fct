/* Exportação para o modelo de importação de Contas a Pagar do Omie (v1.1.5).
 Preenche o próprio modelo (mantém formatação, proteção e validações): troca só as linhas de dados. */
// Portado de conciliacao-dda/omie.js: departamentos do Omie, chave única da conta e linhas da planilha de importação.

// Departamentos do Omie (lista do financeiro, 05/10/2026). O nome precisa ser igual ao cadastrado no Omie.
const DEPARTAMENTOS = [
  { nome: 'F301 - CHAPECÓ 10.768.389/0001-73', fil: 301, cnpj: '10768389000173' },
  { nome: 'F302 CHAPECÓ 10.768.389/0002-54', fil: 302, cnpj: '10768389000254' },
  { nome: 'F303 CHAPECÓ 10.768.389/0003-35', fil: 303, cnpj: '10768389000335' },
  { nome: 'F304 CHAPECÓ 10.768.389/0004-16', fil: 304, cnpj: '10768389000416' },
  { nome: 'F305 CHAPECÓ 10.768.389/0005-05', fil: 305, cnpj: '10768389000505' },
  { nome: 'F306 CHAPECÓ 10.768.389/0011-45', fil: 306, cnpj: '10768389001145' },
  { nome: 'F307 CHAPECÓ 10.768.389/0018-11', fil: 307, cnpj: '10768389001811' },
  { nome: 'F308 CHAPECÓ 10.768.389/0021-17', fil: 308, cnpj: '10768389002117' },
  { nome: 'F309 CHAPECÓ 10.768.389/0017-30', fil: 309, cnpj: '10768389001730' },
  { nome: 'F331 MARAVILHA 10.768.389/0006-88', fil: 331, cnpj: '10768389000688' },
  { nome: 'F401 CONCÓRDIA 10.768.389/0007-69', fil: 401, cnpj: '10768389000769' },
  { nome: 'F402 CONCÓRDIA 10.768.389/0010-64', fil: 402, cnpj: '10768389001064' },
  { nome: 'F403 CONCÓRDIA 10.768.389/0013-07', fil: 403, cnpj: '10768389001307' },
  { nome: 'F404 CONCÓRDIA 10.768.389/0009-20', fil: 404, cnpj: '10768389000920' },
  { nome: 'F411 JOAÇABA 10.768.389/0019-00', fil: 411, cnpj: '10768389001900' },
  { nome: 'F421 SEARA 10.768.389/0014-98', fil: 421, cnpj: '10768389001498' },
  { nome: 'F422 SEARA INDUSTRIAL 10.768.389/0022-06', fil: 422, cnpj: '10768389002206' },
  { nome: 'F501 BLUMENAU 10.768.389/0008-40', fil: 501, cnpj: '10768389000840' },
  { nome: 'F502 BLUMENAU 10.768.389/0012-26', fil: 502, cnpj: '10768389001226' },
  { nome: 'F503 BLUMENAU 10.768.389/0015-79', fil: 503, cnpj: '10768389001579' },
  { nome: 'F504 BLUMENAU 10.768.389/0016-50', fil: 504, cnpj: '10768389001650' },
  { nome: '423 - ADMINISTRATIVO 20-82', fil: 423, cnpj: '10768389002082' },
  { nome: 'TRIO - 63.400.777/0001-63', fil: null, cnpj: '63400777000163' }
];
const so14 = s => String(s || '').replace(/\D/g, '').slice(-14);
function departamento(fil, cnpj) {
  const c = so14(cnpj);
  return (fil != null && DEPARTAMENTOS.find(d => d.fil === fil)) || (c && DEPARTAMENTOS.find(d => d.cnpj === c)) || null;
}

// filial de uma conta: boleto de arquivo de uma filial manda; senão a do título do Trier
function filialDe(item) { const d = item.d, t = item.ts && item.ts[0]; return d && d.filForte ? d.fil : (t ? t.fil : (d ? d.fil ?? null : null)); }

// empresa da Omie: filial 300 em diante (e TRIO/CNPJs da lista) = Nazário; abaixo de 300 (Varela, Itajaí) = Varela
function empresaDe(item, dep) {
  const f = filialDe(item); if (f != null && !isNaN(+f)) return +f >= 300 ? 'nazario' : 'varela';
  const d = item.d; if (dep || (d && departamento(null, d.pagadorCnpj || d.pagador))) return 'nazario';
  return null;
}
// Grupos da tela "Enviar para o Omie"
const EXATOS = ['EXATO', 'TAXA', 'DESCONTO', 'LIQUIDO', 'AGRUPADO', 'COMBINACAO']; // várias notas que somam o boleto = exato
const APROX = ['VALOR_DATA', 'DOCUMENTO', 'DATA', 'VALOR', 'FILIAL'];
function grupos(res) {
  const porBoleto = new Map();
  for (const t of res.T) if (t.dda) { let g = porBoleto.get(t.dda.i); if (!g) porBoleto.set(t.dda.i, g = { d: t.dda, ts: [] }); g.ts.push(t); }
  const out = { exatos: [], aproximados: [], soTrier: [], soDDA: [] };
  for (const [i, g] of porBoleto) {
    const pior = g.ts.some(t => APROX.includes(t.resultado)) ? g.ts.find(t => APROX.includes(t.resultado)).resultado : g.ts[0].resultado;
    const item = { id: 'b' + i, tipo: 'boleto', d: g.d, ts: g.ts, resultado: pior };
    (EXATOS.includes(pior) ? out.exatos : out.aproximados).push(item);
  }
  for (const t of res.T) if (!t.dda) out.soTrier.push({ id: 't' + t.j, tipo: 'trier', d: null, ts: [t], resultado: t.resultado });
  for (const d of res.soDDA) out.soDDA.push({ id: 'b' + d.i, tipo: 'boleto', d, ts: [], resultado: 'SO_DDA' });
  const ord = (a, b) => (a.d ? a.d.venc : a.ts[0].venc) - (b.d ? b.d.venc : b.ts[0].venc) || String(a.d ? a.d.nome : a.ts[0].forn).localeCompare(b.d ? b.d.nome : b.ts[0].forn);
  Object.values(out).forEach(l => l.sort(ord));
  return out;
}

// ---------- montagem das linhas ----------
const serial = n => n == null ? null : n + 25569; // dias desde 01/01/1970 -> serial do Excel
const cnpjFmt = s => { s = so14(s); return s.length === 14 ? s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : s; };
const dtxt = n => { const d = new Date(n * 86400000); return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear(); };
const brl = v => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function hash36(s) { let h1 = 0x811c9dc5, h2 = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; } return (h1.toString(36) + h2.toString(36)).toUpperCase().slice(0, 14); }
const notaDe = doc => (/^(\d+)/.exec(doc || '') || [])[1] || '';

/** Desconto do boleto que vale pagando no dia do vencimento (0 se não houver ou se não der para confirmar a data). */
function descontoNoVencimento(d) {
  if (!d || !d.desconto || d.desconto.noVencimento !== true) return 0;
  const v = Math.round(Number(d.desconto.valor) * 100) / 100;
  return v > 0 && v < d.valor ? v : 0;
}

function linha(item, cfg, rotulo) {
  const d = item.d, ts = item.ts, t0 = ts[0];
  const dep = departamento(filialDe(item), d ? (d.pagadorCnpj || d.pagador) : null);
  const obs = ['Conciliação DDA×Trier: ' + (rotulo[item.resultado] || (item.resultado === 'SO_DDA' ? 'Tem no DDA, não tem no Trier' : item.resultado))];
  if (ts.length) obs.push('Trier F' + t0.fil + ': ' + ts.map(t => t.doc + ' R$ ' + brl(t.valor)).join(', '));
  // desconto que vale pagando no dia do vencimento: a conta vai com o valor já descontado (decisão do Luiz, 06/11/2026);
  // desconto só antecipado ou sem data (planilha do portal) não entra no valor
  const desc = descontoNoVencimento(d);
  if (desc) obs.push('Valor já com desconto de R$ ' + brl(desc) + ' (boleto R$ ' + brl(d.valor) + '), válido pagando até ' + dtxt(d.desconto.ate));
  if (d && d.deParaFornecedor) obs.push('Fornecedor real: ' + d.deParaFornecedor);
  if (d && d.alerta) obs.push('ALERTA: ' + d.alerta);
  if (d) obs.push('DDA ' + d.nome + ' doc ' + d.numdoc);
  const venc = d ? d.venc : t0.venc;
  return {
    B: d ? 'DDA' + hash36(d.barra) : ('TR' + t0.fil + '-' + t0.doc).slice(0, 20),
    C: d ? cnpjFmt(d.doc) : String(t0.forn).slice(0, 60),
    D: cfg.categoria, E: cfg.conta,
    F: Math.round((d ? d.valor - desc : t0.valor) * 100) / 100,
    // regra do financeiro: emissão, registro, vencimento e previsão = vencimento do boleto (DDA); sem boleto, o do Trier
    I: serial(venc), J: serial(venc), K: serial(venc), L: serial(venc),
    S: obs.join(' | '),
    T: d ? 'Boleto' : '',
    U: String(d ? d.numdoc : t0.doc).slice(0, 30),
    Y: ts.length === 1 ? notaDe(t0.doc).slice(0, 20) : '',
    AA: d ? 'Pagamento de Boleto' : '',
    AB: d ? d.barra : '',
    AX: dep ? dep.nome : '',
    _semDepartamento: !dep
  };
}
function montarLinhas(itens, cfg, rotulo) { return itens.map(it => linha(it, cfg, rotulo || {})); }

// ---------- gravação dentro do modelo ----------
const COLS = ['B', 'C', 'D', 'E', 'F', 'I', 'J', 'K', 'L', 'S', 'T', 'U', 'Y', 'AA', 'AB', 'AX'];
const NUM = new Set(['F', 'I', 'J', 'K', 'L']);
const ordemCol = c => c.split('').reduce((s, ch) => s * 26 + ch.charCodeAt(0) - 64, 0);
const xesc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
async function gerar(JSZip, modeloB64, linhas) {
  const zip = await JSZip.loadAsync(modeloB64, { base64: true });
  const caminho = 'xl/worksheets/sheet1.xml';
  let x = await zip.file(caminho).async('string');
  const m6 = /<row r="6"([^>]*)>([\s\S]*?)<\/row>/.exec(x);
  if (!m6) throw new Error('Modelo do Omie inesperado (linha 6 não encontrada).');
  const attrs = m6[1], estilo = {}, todas = [];
  m6[2].replace(/<c r="([A-Z]+)6" s="(\d+)"\/>/g, (_, c, s) => { estilo[c] = s; todas.push(c); return ''; });
  const rows = linhas.map((l, k) => {
    const r = 6 + k;
    const cells = todas.map(c => {
      const v = l[c], s = estilo[c] ? ` s="${estilo[c]}"` : '';
      if (v == null || v === '' || !COLS.includes(c)) return `<c r="${c}${r}"${s}/>`;
      if (NUM.has(c)) return `<c r="${c}${r}"${s}><v>${v}</v></c>`;
      return `<c r="${c}${r}"${s} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`;
    }).sort((a, b) => ordemCol(/r="([A-Z]+)/.exec(a)[1]) - ordemCol(/r="([A-Z]+)/.exec(b)[1]));
    return `<row r="${r}"${attrs}>${cells.join('')}</row>`;
  }).join('');
  x = x.replace(/<row r="6"[\s\S]*<\/sheetData>/, rows + '</sheetData>');
  const ult = Math.max(8, 5 + linhas.length);
  x = x.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:BK${ult}"/>`);
  zip.file(caminho, x);
  return zip.generateAsync({ type: typeof Blob !== 'undefined' && typeof window !== 'undefined' ? 'blob' : 'nodebuffer', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

// chave única de uma conta (para saber se já foi enviada ao Omie): boleto + filial pagadora, ou título do Trier
function chave(item) { const d = item.d, t0 = item.ts && item.ts[0]; return (d ? 'DDA' + hash36(d.barra) : 'TR' + t0.fil + '-' + t0.doc) + '|' + (filialDe(item) ?? ''); }
const API = { DEPARTAMENTOS, departamento, filialDe, empresaDe, chave, grupos, montarLinhas, gerar };
export const Omie = API;
export default API;
