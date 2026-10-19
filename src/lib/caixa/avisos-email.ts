// Conteúdo do e-mail diário das quebras de caixa (puro: sem banco nem envio, dá para testar e pré-visualizar).
// Duas partes, na mesma mensagem quando a pessoa é as duas coisas:
//   - gestor: quebras que ELE justifica no sistema;
//   - colaborador: as quebras no nome dele, para explicar ao gestor (quem registra a justificativa é o gestor).
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
  /** Para o colaborador: quem justifica (nome do gestor ou dos gerentes da loja). */
  quemJustifica?: string | null;
};

export type Destinatario = {
  /** e-mail em minúsculas: uma mensagem por e-mail por dia */
  chave: string;
  profileId: string | null;
  nome: string;
  email: string;
  /** tem usuário ativo no sistema (mostra o botão para entrar) */
  temAcesso: boolean;
  /** quebras que esta pessoa justifica (gestor) */
  quebras: QuebraAviso[];
  total: number;
  /** quebras no nome desta pessoa (colaborador) */
  minhas: QuebraAviso[];
  totalMinhas: number;
};

const MAX_LINHAS = 15;
const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string) => iso.split("-").reverse().join("/");
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome;
const qtd = (n: number) => `${n} ${n === 1 ? "quebra de caixa" : "quebras de caixa"}`;
const haDias = (n: number) => (n <= 0 ? "hoje" : n === 1 ? "há 1 dia" : `há ${n} dias`);
const tipo = (q: QuebraAviso) => (q.diferenca < 0 ? "Sobra" : "Falta");
const origem = (q: QuebraAviso) => (q.manual ? "Lançada pelo financeiro" : `Caixa ${q.caixa ?? "—"}`);

export function assuntoAviso(d: Destinatario) {
  const g = d.quebras.length;
  const m = d.minhas.length;
  if (g && m) return `${qtd(g)} para justificar e ${m === 1 ? "1 sua em aberto" : `${m} suas em aberto`}`;
  if (g) return `${qtd(g)} esperando sua justificativa`;
  return `Você tem ${qtd(m)} em aberto`;
}

/** Texto puro (para quem lê e-mail sem HTML e para o filtro de spam). */
export function textoAviso(d: Destinatario, site: string) {
  const partes: string[] = [`Olá, ${primeiroNome(d.nome)}!`, ""];
  if (d.quebras.length) {
    partes.push(
      `PARA VOCÊ JUSTIFICAR: ${qtd(d.quebras.length)}, somando ${moeda(d.total)}.`,
      "Quem justifica é você, como gestor da loja. Depois o financeiro decide se mantém o desconto na folha ou abona.",
      "",
      ...d.quebras.slice(0, MAX_LINHAS).map((q) => `- ${q.loja} · ${data(q.dia)} · ${origem(q).toLowerCase()} · ${q.operador} · ${tipo(q)} ${moeda(q.valor)} (${haDias(q.diasAberta)})`),
      ...(d.quebras.length > MAX_LINHAS ? [`… e mais ${d.quebras.length - MAX_LINHAS}.`] : []),
      "",
      `Justificar agora: ${site}/caixa`,
      "",
    );
  }
  if (d.minhas.length) {
    partes.push(
      `SUAS QUEBRAS DE CAIXA: ${qtd(d.minhas.length)} em aberto, somando ${moeda(d.totalMinhas)}.`,
      "Se o valor tem explicação, explique para o seu gestor: é ele quem registra a justificativa no sistema. Sem justificativa, o valor pode ser descontado na folha.",
      "",
      ...d.minhas.slice(0, MAX_LINHAS).map((q) => `- ${q.loja} · ${data(q.dia)} · ${origem(q).toLowerCase()} · ${tipo(q)} ${moeda(q.valor)}${q.quemJustifica ? ` · fale com: ${q.quemJustifica}` : ""}`),
      ...(d.minhas.length > MAX_LINHAS ? [`… e mais ${d.minhas.length - MAX_LINHAS}.`] : []),
      "",
      ...(d.temAcesso ? [`Ver no sistema: ${site}/caixa`, ""] : []),
    );
  }
  partes.push("Farmácias FCT · uso interno · e-mail automático, não precisa responder.");
  return partes.join("\n");
}

const th = (t: string, direita = false) => `<td style="padding:8px 10px;font-size:11px;color:#6e6265${direita ? ";text-align:right" : ""}">${t}</td>`;
const valorCelula = (q: QuebraAviso, detalhe: string, alerta: boolean) =>
  `<td style="padding:9px 10px;font-size:13px;color:${q.diferenca < 0 ? "#0b5394" : "#a80410"};text-align:right;white-space:nowrap"><strong>${esc(moeda(q.valor))}</strong><br><span style="font-size:11px;color:${alerta ? "#a80410" : "#6e6265"}">${esc(detalhe)}</span></td>`;
const lojaCelula = (q: QuebraAviso) =>
  `<td style="padding:9px 10px;font-size:13px;color:#161213;white-space:nowrap"><strong>${esc(q.loja)}</strong><br><span style="font-size:11px;color:#6e6265">${esc(data(q.dia))}</span></td>`;

function tabela(cabecalho: string, linhas: string[], total: number) {
  const resto = total > MAX_LINHAS ? `<tr><td colspan="3" style="padding:9px 10px;font-size:12px;color:#6e6265">… e mais ${total - MAX_LINHAS}.</td></tr>` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #ece5e1;border-radius:10px;border-collapse:separate;overflow:hidden">
<tr style="background:#f4f1ee">${cabecalho}</tr>
${linhas.map((l, i) => l.replace("<tr>", `<tr style="background:${i % 2 ? "#ffffff" : "#faf8f6"}">`)).join("")}${resto}
</table>`;
}

const botao = (href: string, texto: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#161213;color:#ffffff;font-weight:bold;font-size:14px;text-decoration:none;padding:12px 22px;border-radius:9px">${esc(texto)}</a>`;

/** HTML do e-mail, na identidade do sistema (faixa vermelha, tinta, botão escuro). */
export function htmlAviso(d: Destinatario, site: string) {
  const blocos: string[] = [];

  if (d.quebras.length) {
    const linhas = d.quebras.slice(0, MAX_LINHAS).map(
      (q) => `<tr>${lojaCelula(q)}<td style="padding:9px 10px;font-size:13px;color:#161213">${esc(q.operador)}<br><span style="font-size:11px;color:#6e6265">${esc(origem(q))}</span></td>${valorCelula(q, `${tipo(q)} · ${haDias(q.diasAberta)}`, q.diasAberta >= 3)}</tr>`,
    );
    blocos.push(`<tr><td style="padding:4px 28px 0">
${d.minhas.length ? `<p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#a80410">Para você justificar</p>` : ""}
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3d3436">Você tem <strong>${esc(qtd(d.quebras.length))}</strong> esperando justificativa, somando <strong>${esc(moeda(d.total))}</strong>.</p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#6e6265">Quem justifica é você, como gestor da loja. Depois o financeiro decide se mantém o desconto na folha ou abona. Dá para anexar foto do cupom ou do comprovante.</p>
${tabela(`${th("Loja e dia")}${th("Operador")}${th("Valor", true)}`, linhas, d.quebras.length)}
<p style="margin:18px 0 6px">${botao(`${site}/caixa`, "Justificar agora")}</p>
</td></tr>`);
  }

  if (d.minhas.length) {
    const linhas = d.minhas.slice(0, MAX_LINHAS).map(
      (q) => `<tr>${lojaCelula(q)}<td style="padding:9px 10px;font-size:13px;color:#161213">${esc(origem(q))}<br><span style="font-size:11px;color:#6e6265">${q.quemJustifica ? `fale com ${esc(q.quemJustifica)}` : "fale com o gestor da loja"}</span></td>${valorCelula(q, tipo(q), false)}</tr>`,
    );
    blocos.push(`<tr><td style="padding:${d.quebras.length ? "22px" : "4px"} 28px 0">
${d.quebras.length ? `<p style="margin:0 0 6px;font-size:11px;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#a80410">Suas quebras de caixa</p>` : ""}
<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#3d3436">Você tem <strong>${esc(qtd(d.minhas.length))}</strong> em aberto no seu nome, somando <strong>${esc(moeda(d.totalMinhas))}</strong>.</p>
<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#6e6265">Se o valor tem explicação (troco, venda registrada na forma errada, sangria não lançada…), <strong style="color:#3d3436">explique para o seu gestor</strong>: é ele quem registra a justificativa no sistema. Sem justificativa, o valor pode ser descontado na folha.</p>
${tabela(`${th("Loja e dia")}${th("Caixa e quem justifica")}${th("Valor", true)}`, linhas, d.minhas.length)}
${d.temAcesso && !d.quebras.length ? `<p style="margin:18px 0 6px">${botao(`${site}/caixa`, "Ver minhas quebras")}</p>` : ""}
</td></tr>`);
  }

  const motivo =
    d.quebras.length && d.minhas.length
      ? "Você recebe este aviso porque é gestor de loja e porque há quebra de caixa no seu nome."
      : d.quebras.length
        ? "Você recebe este aviso porque é gestor de loja no Sistema FCT."
        : "Você recebe este aviso porque há quebra de caixa no seu nome.";

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assuntoAviso(d))}</title></head>
<body style="margin:0;padding:0;background:#f4f1ee">
<div style="display:none;max-height:0;overflow:hidden">${esc(assuntoAviso(d))}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ee;padding:24px 0;font-family:Arial,Helvetica,sans-serif">
<tr><td align="center" style="padding:0 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;border:1px solid #e4dbd6;overflow:hidden">
<tr><td style="background:#c10510;padding:18px 28px">
<span style="display:inline-block;background:#f5c518;color:#161213;font-weight:900;font-size:13px;padding:7px 9px;border-radius:7px">FCT</span>
<span style="color:#ffffff;font-size:16px;font-weight:bold;margin-left:10px;vertical-align:middle">Sistema FCT</span>
</td></tr>
<tr><td style="height:4px;background:#161213;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 28px 6px"><h1 style="margin:0;font-size:20px;line-height:1.3;color:#161213">Olá, ${esc(primeiroNome(d.nome))}!</h1></td></tr>
${blocos.join("\n")}
<tr><td style="padding:16px 28px 24px"><p style="margin:0;font-size:12px;line-height:1.6;color:#6e6265">${motivo} Ele só chega nos dias em que há quebra em aberto.</p></td></tr>
<tr><td style="padding:14px 28px;background:#f4f1ee;font-size:11px;color:#6e6265">Farmácias FCT · uso interno · e-mail automático, não precisa responder.</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
