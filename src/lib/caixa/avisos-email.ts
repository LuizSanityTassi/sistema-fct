// Conteúdo do e-mail diário das quebras de caixa (puro: sem banco nem envio, dá para testar e pré-visualizar).
// HTML em tabelas com estilo inline, que é o que os leitores de e-mail (Gmail, Outlook) respeitam.

export type QuebraAviso = {
  id: string;
  loja: string;
  lojaNome: string;
  dia: string; // aaaa-mm-dd
  caixa: number | null;
  operador: string;
  diferenca: number;
  valor: number;
  manual: boolean;
  diasAberta: number;
};

export type Destinatario = { profileId: string; nome: string; email: string; quebras: QuebraAviso[]; total: number };

const MAX_LINHAS = 15;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => iso.split("-").reverse().join("/");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
const qtdQuebras = (n: number) => `${n} ${n === 1 ? "quebra de caixa" : "quebras de caixa"}`;
const haDias = (n: number) => (n <= 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`);
const tipo = (q: QuebraAviso) => (q.diferenca < 0 ? "Sobra" : "Falta");

export function assuntoAviso(d: Destinatario) {
  return `${qtdQuebras(d.quebras.length)} esperando sua justificativa`;
}

/** Texto puro (para quem lê e-mail sem HTML e para o filtro de spam). */
export function textoAviso(d: Destinatario, site: string) {
  const linhas = d.quebras.slice(0, MAX_LINHAS).map((q) => `- ${q.loja} · ${data(q.dia)} · ${q.manual ? "lançada pelo financeiro" : `caixa ${q.caixa ?? "—"}`} · ${q.operador} · ${tipo(q)} ${moeda(q.valor)} (${haDias(q.diasAberta)})`);
  const resto = d.quebras.length > MAX_LINHAS ? [`… e mais ${d.quebras.length - MAX_LINHAS}.`] : [];
  return [
    `Olá, ${primeiroNome(d.nome)}!`,
    "",
    `Você tem ${qtdQuebras(d.quebras.length)} esperando justificativa, somando ${moeda(d.total)}.`,
    "Quem justifica é você, como gestor da loja. Depois o financeiro decide se mantém o desconto na folha ou abona.",
    "",
    ...linhas,
    ...resto,
    "",
    `Justificar agora: ${site}/caixa`,
    "",
    "Farmácias FCT · uso interno · e-mail automático, não precisa responder.",
  ].join("\n");
}

/** HTML do e-mail, na identidade do sistema (faixa vermelha, tinta, botão escuro). */
export function htmlAviso(d: Destinatario, site: string) {
  const linhas = d.quebras
    .slice(0, MAX_LINHAS)
    .map((q, i) => {
      const fundo = i % 2 ? "#ffffff" : "#faf8f6";
      const origem = q.manual ? "Lançada pelo financeiro" : `Caixa ${q.caixa ?? "—"}`;
      const atrasada = q.diasAberta >= 3;
      return `<tr style="background:${fundo}">
<td style="padding:9px 10px;font-size:13px;color:#161213;white-space:nowrap"><strong>${esc(q.loja)}</strong><br><span style="font-size:11px;color:#6e6265">${esc(data(q.dia))}</span></td>
<td style="padding:9px 10px;font-size:13px;color:#161213">${esc(q.operador)}<br><span style="font-size:11px;color:#6e6265">${esc(origem)}</span></td>
<td style="padding:9px 10px;font-size:13px;color:${q.diferenca < 0 ? "#0b5394" : "#a80410"};text-align:right;white-space:nowrap"><strong>${esc(moeda(q.valor))}</strong><br><span style="font-size:11px;color:${atrasada ? "#a80410" : "#6e6265"}">${tipo(q)} · ${esc(haDias(q.diasAberta))}</span></td>
</tr>`;
    })
    .join("");
  const resto =
    d.quebras.length > MAX_LINHAS
      ? `<tr><td colspan="3" style="padding:9px 10px;font-size:12px;color:#6e6265">… e mais ${d.quebras.length - MAX_LINHAS}. Veja todas no sistema.</td></tr>`
      : "";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assuntoAviso(d))}</title></head>
<body style="margin:0;padding:0;background:#f4f1ee">
<div style="display:none;max-height:0;overflow:hidden">${esc(`${qtdQuebras(d.quebras.length)}, ${moeda(d.total)}. Justifique pelo Sistema FCT.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:0 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #e4dbd6;overflow:hidden">
<tr><td style="background:#c10510;padding:18px 28px">
<span style="display:inline-block;background:#f5c518;color:#161213;font-weight:900;font-size:13px;padding:7px 9px;border-radius:7px">FCT</span>
<span style="color:#ffffff;font-size:16px;font-weight:bold;margin-left:10px;vertical-align:middle">Sistema FCT</span>
</td></tr>
<tr><td style="height:4px;background:#161213;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 8px">
<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:#161213">Olá, ${esc(primeiroNome(d.nome))}!</h1>
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3d3436">Você tem <strong>${esc(qtdQuebras(d.quebras.length))}</strong> esperando justificativa, somando <strong>${esc(moeda(d.total))}</strong>.</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:#6e6265">Quem justifica é você, como gestor da loja. Depois o financeiro decide se mantém o desconto na folha ou abona.</p>
</td></tr>
<tr><td style="padding:0 28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece5e1;border-radius:10px;border-collapse:separate;overflow:hidden">
<tr style="background:#f4f1ee"><td style="padding:8px 10px;font-size:11px;color:#6e6265">Loja e dia</td><td style="padding:8px 10px;font-size:11px;color:#6e6265">Operador</td><td style="padding:8px 10px;font-size:11px;color:#6e6265;text-align:right">Valor</td></tr>
${linhas}${resto}
</table>
</td></tr>
<tr><td style="padding:22px 28px 26px">
<a href="${esc(site)}/caixa" style="display:inline-block;background:#161213;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:9px">Justificar agora</a>
<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#6e6265">Você recebe este aviso porque é gestor de loja no Sistema FCT. Ele só chega nos dias em que há quebra esperando a sua justificativa. Pode anexar foto do cupom ou do comprovante na própria tela.</p>
</td></tr>
<tr><td style="padding:14px 28px;background:#f4f1ee;font-size:11px;color:#6e6265">Farmácias FCT · uso interno · e-mail automático, não precisa responder.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
