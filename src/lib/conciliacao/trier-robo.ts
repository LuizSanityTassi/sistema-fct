// Robô do Trier (só servidor): entra no Trier web (Podium), gera o relatório "Contas a Pagar ou Pagas" (Rel_0010)
// de todas as filiais em Excel e devolve o arquivo — porta fiel das funções trier_* do api.php da ferramenta anterior.
// As credenciais vêm de `credenciaisTrier()` (tela Administração → Integrações, guardadas no Vault; ou TRIER_* do ambiente)
// e nunca aparecem no navegador, no código ou no Git.
import http from "node:http";
import https from "node:https";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";

export type ConfigTrier = { diasAntes: number; diasDepois: number };
export const CONFIG_TRIER_PADRAO: ConfigTrier = { diasAntes: 5, diasDepois: 60 };

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 SistemaFCT";

type Cookies = Record<string, string>;
type Resposta = { cod: number; corpo: Buffer; local: string };

export class TrierErro extends Error {}

/** O que a tela pode mostrar: configurado ou não, de onde veio, endereço e começo do usuário (nunca a senha). */
export function statusTrier(c: CredenciaisTrier) {
  return { configurado: Boolean(c.usuario && c.senha), origem: c.origem, url: c.url, usuario: c.usuario ? `${c.usuario.slice(0, 2)}•••` : "" };
}

// pedido HTTP com cookies; aceita resposta cortada (o Trier fecha a conexão sem terminar, mas o conteúdo já veio)
function httpPedido(metodo: string, url: string, corpo: string | null, cookies: Cookies, timeoutMs = 60_000, extra: Record<string, string> = {}): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const headers: Record<string, string> = { "User-Agent": UA, Accept: "*/*", ...extra };
    const ck = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    if (ck) headers.Cookie = ck;
    if (corpo !== null) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      headers["Content-Length"] = String(Buffer.byteLength(corpo));
    }
    const mod = u.protocol === "https:" ? https : http;
    const req = mod.request(u, { method: metodo, headers, timeout: timeoutMs }, (res) => {
      const partes: Buffer[] = [];
      let pronto = false;
      const fim = () => {
        if (pronto) return;
        pronto = true;
        for (const l of res.headers["set-cookie"] ?? []) {
          const m = /^([^=;\s]+)=([^;]*)/.exec(l);
          if (m) cookies[m[1]] = m[2];
        }
        resolve({ cod: res.statusCode ?? 0, corpo: Buffer.concat(partes), local: res.headers.location ?? "" });
      };
      res.on("data", (d: Buffer) => partes.push(d));
      res.on("end", fim);
      res.on("aborted", fim);
      res.on("error", fim);
    });
    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", (e) => reject(new TrierErro(`sem conexão com o Trier (${e.message})`)));
    if (corpo !== null) req.write(corpo);
    req.end();
  });
}

const texto = (b: Buffer) => (/charset=["']?iso-8859-1/i.test(b.subarray(0, 2000).toString("latin1")) ? b.toString("latin1") : b.toString("utf8"));
// mesma codificação do http_build_query(PHP_QUERY_RFC3986)
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const query = (campos: Record<string, string>) =>
  Object.entries(campos)
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join("&");

// atributos que a tela manda no httpStart (tipo/id de cada campo)
function trierAtributos(html: string) {
  const att: string[] = [];
  const vistos = new Set<string>();
  for (const tag of html.match(/<(input|select|textarea)\b[^>]*>/gi) ?? []) {
    const n = /\bname="([^"]+)"/i.exec(tag);
    if (!n || vistos.has(n[1])) continue;
    vistos.add(n[1]);
    const tipo = /^<select/i.test(tag) ? "select-one" : /^<textarea/i.test(tag) ? "textarea" : (/\btype="([^"]+)"/i.exec(tag)?.[1].toLowerCase() ?? "text");
    const id = /\bid="([^"]+)"/i.exec(tag)?.[1] ?? n[1];
    att.push(`${n[1]}=ty-${tipo}!id-${id}!ds-${/\bdisabled\b/i.test(tag) ? "1" : "0"}!ro-${/\breadonly\b/i.test(tag) ? "1" : "0"}!fi-0!`);
  }
  return att.join("&");
}

let sequencia = 0;
// o Trier só aceita a ação se vier "da própria tela" (cabeçalhos Origin e Referer)
async function trierAcao(base: string, serial: string, acao: string, campos: Record<string, string>, ck: Cookies, timeoutMs = 60_000, pagina = "Login.pod") {
  const aid = `${Date.now()}_${++sequencia}`;
  const corpo = query({ actionId: aid, controller: serial, action: acao, ...campos });
  const u = new URL(base);
  const r = await httpPedido("POST", `${base}PodiumAction?actionId=${aid}`, corpo, ck, timeoutMs, { Origin: `${u.protocol}//${u.host}`, Referer: base + pagina, "X-Requested-With": "XMLHttpRequest" });
  if (r.cod >= 400) throw new TrierErro(`o Trier respondeu erro ${r.cod} na ação ${acao}`);
  return texto(r.corpo);
}

async function trierPagina(base: string, pagina: string, ck: Cookies) {
  const r = await httpPedido("GET", base + pagina, null, ck);
  if (r.cod >= 300 && r.cod < 400) return { redir: r.local, html: "", serial: "" };
  const html = texto(r.corpo);
  const m = /controllerSerial\s*=\s*'([0-9a-f]+)'/i.exec(html);
  return { redir: "", html, serial: m ? m[1] : "" };
}

const semTags = (s: string) => s.replace(/<[^>]*>/g, "");
const desescapar = (s: string) => s.replace(/\\(n|r|t|.)/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));
// mensagem de erro que o Trier manda de volta (alert/showMessage)
function trierMsg(js: string) {
  const re = /(?:alertMessage|showMessage|showError|sNotify\.[a-z]+|alert)\s*\(\s*'((?:[^'\\]|\\.)+)'/gi;
  for (const m of js.matchAll(re)) {
    const t = semTags(desescapar(m[1])).trim();
    if (t) return t.slice(0, 200);
  }
  return "";
}

async function trierEntrar(cfg: CredenciaisTrier, ck: Cookies) {
  if (!cfg.usuario || !cfg.senha) throw new TrierErro("usuário e senha do Trier não configurados (Administração → Integrações).");
  const base = cfg.url;
  const p = await trierPagina(base, "Login.pod", ck);
  if (!p.serial) throw new TrierErro("não consegui abrir a tela de login do Trier (endereço certo? servidor ligado?).");
  const ini = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck);
  const valor = (campo: string, padrao: string) => new RegExp(`\\$el\\('${campo}'\\)\\.value = '([^']*)'`).exec(ini)?.[1] ?? padrao;
  const r = await trierAcao(base, p.serial, "save", { id_cod_rede: valor("id_cod_rede", "1"), id_cod_filial: valor("id_cod_filial", ""), nom_filial: valor("nom_filial", ""), id_cod_usuario: cfg.usuario, nom_senha: cfg.senha }, ck);
  const menu = await trierPagina(base, "Menu.pod", ck);
  if (!menu.serial || menu.redir || /id="nom_senha"/.test(menu.html)) {
    const msg = trierMsg(r);
    const det = semTags(r).replace(/\s+/g, " ").trim().slice(0, 160);
    throw new TrierErro(`o Trier recusou o login${msg ? `: ${msg}` : " (usuário ou senha errados?)"}.${det && !msg ? ` [detalhe técnico: ${det} · menu ${menu.redir ? "redirecionou" : menu.serial ? "abriu" : "sem controle"}]` : ""}`);
  }
  return base;
}

async function trierSair(base: string, ck: Cookies) {
  try {
    await httpPedido("GET", `${base}Logout.pod`, null, ck, 15_000);
  } catch {
    /* saída é cortesia */
  }
}

const dataBr = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** Só testa usuário e senha (entra e sai). */
export async function testarLoginTrier(cred: CredenciaisTrier) {
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  await trierSair(base, ck);
}

/** Gera o relatório de contas a pagar (todas as filiais, por vencimento, detalhado, Excel) e devolve o .xlsx. */
export async function buscarRelatorioTrier(cred: CredenciaisTrier, cfg: ConfigTrier = CONFIG_TRIER_PADRAO) {
  const hoje = new Date();
  const ini = dataBr(new Date(hoje.getTime() - cfg.diasAntes * 86_400_000));
  const fim = dataBr(new Date(hoje.getTime() + cfg.diasDepois * 86_400_000));
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  try {
    const p = await trierPagina(base, "Rel_0010.pod", ck);
    if (!p.serial) throw new TrierErro('o usuário do Trier não tem acesso ao relatório "Contas a Pagar ou Pagas".');
    await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 60_000, "Rel_0010.pod");
    const campos: Record<string, string> = {
      id_cod_rede: "1",
      cod_grfilialEntrada: "",
      cod_grfilial: "",
      cadgrfil_grfilial_nom_grfilial: "TODOS",
      cod_filialEntrada: "",
      cod_filial: "",
      cadfilia_filial_nom_filial: "TODAS",
      consid_fornec: "C",
      cod_fornecEntrada: "",
      cod_fornec: "",
      cadforne_fornec_nom_fornec: "TODOS",
      sel_fornes: "",
      consid_desp: "C",
      cod_despesaEntrada: "",
      cod_despesa: "",
      cadtdesp_despesa_nom_despesa: "TODOS",
      sel_tdespes: "",
      consid_ccusto: "C",
      cod_ccustEntrada: "",
      cod_ccust: "",
      cadccust_ccust_nom_ccust: "TODOS",
      sel_ccustos: "",
      dat_inicio: ini,
      dat_fim: fim,
      selecao1: "1",
      selecao2: "3",
      selecao3: "1",
      selecao4: "1",
      sel_filtroper: "1",
      agrup_fil: "1",
      quebra: "1",
      ordenacao: "1",
      saida: "4",
    };
    const r = await trierAcao(base, p.serial, "runReport", campos, ck, 170_000, "Rel_0010.pod");
    const m = /openReport\('([^']+\.xlsx?)'/i.exec(r);
    if (!m) {
      const msg = trierMsg(r);
      throw new TrierErro(`o Trier não gerou o relatório${msg ? `: ${msg}` : "."}`);
    }
    const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, 120_000);
    if (arq.cod !== 200 || arq.corpo.length < 200 || arq.corpo.subarray(0, 2).toString("latin1") !== "PK") throw new TrierErro("não consegui baixar o Excel gerado pelo Trier.");
    return { conteudo: arq.corpo, nome: `Trier contas a pagar ${ini.replaceAll("/", "-")} a ${fim.replaceAll("/", "-")}.xlsx`, periodo: `${ini} a ${fim}` };
  } finally {
    await trierSair(base, ck);
  }
}

// ---------- diagnóstico: descobrir no menu as telas dos relatórios de caixa e os campos de cada uma ----------

export type LinkMenuTrier = { pagina: string; rotulo: string; contexto: string };
export type CampoTrier = { nome: string; tipo: string; valor: string; marcado?: boolean; valorMarcado?: string; valorDesmarcado?: string; opcoes?: { valor: string; texto: string; selecionada: boolean }[] };
export type TentativaTrier = { acao: string; campos: Record<string, string>; arquivo?: string; tamanho?: number; base64?: string; mensagem?: string; resposta?: string };
export type RelatorioDiagnosticado = { pagina: string; rotulo: string; acessivel: boolean; campos: CampoTrier[]; padroes: Record<string, string>; html: string; inicio: string; tentativas: TentativaTrier[] };
export type DiagnosticoTrier = { menuHtml: string; menuInicio: string; links: LinkMenuTrier[]; scripts: Record<string, string>; relatorios: RelatorioDiagnosticado[] };

// entidades HTML que o Trier usa nos nomes do menu (&#32; &#234; &amp; …)
const entidades = (s: string) =>
  s
    .replace(/&#(\d+);?/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);?/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
const limpo = (s: string) =>
  entidades(semTags(s))
    .replace(/\\['"]/g, "")
    .replace(/[{}()[\]'";,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const atributo = (tag: string, nome: string) => new RegExp(`\\b${nome}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(2).find((v) => v !== undefined) ?? "";

/**
 * Nome do item do menu que abre a tela: o texto passado junto na chamada (openPage('X.pod','Nome')), senão o
 * primeiro texto depois do link, senão o último antes (menus em JSON costumam pôr o nome antes do endereço).
 */
function rotuloDoLink(f: string, i: number, fim: number) {
  const depois = f.slice(fim, fim + 400);
  const arg = /^\s*['"]?\s*,\s*['"]([^'"]{3,80})['"]/.exec(depois)?.[1];
  if (arg) return limpo(arg);
  // item em objeto JS/JSON: {text:'Nome', url:'X.pod'} — a propriedade de nome no mesmo { }
  const abre = f.lastIndexOf("{", i);
  const fecha0 = f.indexOf("}", fim);
  if (abre >= 0 && i - abre < 400 && f.lastIndexOf("}", i) < abre && fecha0 >= 0 && fecha0 - fim < 400) {
    const prop = /\b(?:text|label|titulo|title|nome|descricao|caption)\s*:\s*['"]([^'"]{3,80})['"]/i.exec(f.slice(abre, fecha0));
    if (prop) return limpo(prop[1]);
  }
  let resto = depois;
  const fecha = resto.search(/[<>]/);
  if (fecha >= 0 && resto[fecha] === ">") resto = resto.slice(fecha + 1);
  const texto = resto
    .split(/<[^>]*>/)
    .map(limpo)
    .find((t) => t.length >= 3);
  if (texto && !/^\S+\.pod$/i.test(texto)) return texto.slice(0, 80);
  let antes = f.slice(Math.max(0, i - 400), i);
  if (antes.lastIndexOf("<") > antes.lastIndexOf(">")) antes = antes.slice(0, antes.lastIndexOf("<"));
  return (
    antes
      .split(/<[^>]*>/)
      .map(limpo)
      .reverse()
      .find((t) => t.length >= 3)
      ?.slice(-80) ?? ""
  );
}

/** Toda menção a uma tela .pod no menu, com o nome do item e o texto em volta. */
function linksDoMenu(...fontes: string[]) {
  const vistos = new Map<string, LinkMenuTrier>();
  for (const f of fontes) {
    for (const m of f.matchAll(/printSideMenu\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([A-Za-z][A-Za-z0-9_]*\.pod)/g)) {
      vistos.set(m[3], { pagina: m[3], rotulo: limpo(m[1]), contexto: limpo(m[2]) });
    }
  }
  for (const f of fontes) {
    for (const m of f.matchAll(/([A-Za-z][A-Za-z0-9_]*\.pod)\b/g)) {
      const i = m.index ?? 0;
      const fim = i + m[1].length;
      const link = { pagina: m[1], rotulo: rotuloDoLink(f, i, fim), contexto: limpo(f.slice(Math.max(0, i - 200), fim + 200)).slice(0, 300) };
      const ja = vistos.get(m[1]);
      if (!ja) vistos.set(m[1], link);
    }
  }
  return [...vistos.values()];
}

/** Campos do formulário da tela: input/select/textarea com valor, marcação e opções. */
function camposDaTela(html: string): CampoTrier[] {
  const campos: CampoTrier[] = [];
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const nome = atributo(m[0], "name");
    if (!nome) continue;
    const c: CampoTrier = { nome, tipo: (atributo(m[0], "type") || "text").toLowerCase(), valor: atributo(m[0], "value"), marcado: /\bchecked\b/i.test(m[0]) };
    // caixas de marcar do Trier: data-valueChecked="S" data-valueUnchecked="N"
    if (/data-valueChecked\s*=/i.test(m[0])) c.valorMarcado = atributo(m[0], "data-valueChecked");
    if (/data-valueUnchecked\s*=/i.test(m[0])) c.valorDesmarcado = atributo(m[0], "data-valueUnchecked");
    campos.push(c);
  }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const nome = atributo(`<select ${m[1]}>`, "name");
    if (!nome) continue;
    const opcoes = [...m[2].matchAll(/<option\b([^>]*)>([\s\S]*?)(?=<option\b|$)/gi)].map((o) => ({ valor: atributo(`<o ${o[1]}>`, "value"), texto: limpo(o[2]).slice(0, 80), selecionada: /\bselected\b/i.test(o[1]) }));
    campos.push({ nome, tipo: "select", valor: (opcoes.find((o) => o.selecionada) ?? opcoes[0])?.valor ?? "", opcoes });
  }
  for (const m of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const nome = atributo(`<t ${m[1]}>`, "name");
    if (nome) campos.push({ nome, tipo: "textarea", valor: m[2] });
  }
  return campos;
}

/** Valores que a tela preenche sozinha ao abrir (resposta do httpStart). */
function padroesDoInicio(js: string) {
  const out: Record<string, string> = {};
  for (const m of js.matchAll(/\$el\('([^']+)'\)\.value\s*=\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] = desescapar(m[2]);
  for (const m of js.matchAll(/\$el\('([^']+)'\)\.checked\s*=\s*(true|false)/g)) out[`${m[1]}#checked`] = m[2];
  return out;
}

/** O formulário como a tela mandaria ao abrir: valores padrão, rádios marcados e caixas de marcar com S/N. */
function camposTentativa(campos: CampoTrier[], padroes: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const c of campos) {
    if (c.tipo === "button" || c.tipo === "submit" || c.tipo === "reset" || c.tipo === "image") continue;
    if (c.tipo === "radio") {
      const marcado = padroes[`${c.nome}#checked`] === "true" || c.marcado;
      if (marcado || !(c.nome in out)) out[c.nome] = c.valor;
      continue;
    }
    if (c.tipo === "checkbox") {
      const marcado = padroes[`${c.nome}#checked`] ? padroes[`${c.nome}#checked`] === "true" : c.marcado;
      out[c.nome] = marcado ? (c.valorMarcado ?? (c.valor || "S")) : (c.valorDesmarcado ?? "");
      continue;
    }
    out[c.nome] = padroes[c.nome] ?? c.valor;
  }
  return out;
}

const corta = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…[cortado ${s.length - n}]` : s);

/** Uma ação do Trier numa tela: o nome (botão), os campos que mudam em relação ao padrão e se devolve arquivo. */
type PassoTrier = { acao: string; ajustes: Record<string, string>; arquivo: boolean };
type TelaTrier = { pagina: string; rotulo: string; passos: PassoTrier[] };

const filialCampos = (filial: string): Record<string, string> => (filial ? { id_cod_filialEntrada: filial, id_cod_filial: filial } : {});

/**
 * Telas do Trier achadas no menu em 15/10/2026 (Relatórios > Financeiros) e o que pedir em cada uma,
 * na ordem de prioridade do diagnóstico. Opções conferidas no HTML de cada tela:
 * Rel_0122 filtro 0=Caixa 1=Período · Rel_0275 sel_periodo 0=Nº do caixa 1=data de movimento, fil_filtros 0=Todos ·
 * Rel_0031 sel_periodo 0=Nº de caixa 1=Data de emissão · saída 1=PDF 2=RTF 3=HTML 4=XLS 5=Matricial.
 */
export function telasCaixaTrier(dia: string, filial: string): TelaTrier[] {
  // no modo Período a tela desliga "exibir justificativa" (habilitaComponentes): vai N, como o navegador mandaria
  const diferencas = { filtro: "1", ...filialCampos(filial), dt_abertura: dia, dt_fechamento: dia, chk_detalhar_forma_pagamento: "S", chk_exibir_justificativa: "N", saida: "4" };
  return [
    {
      pagina: "Rel_0122.pod",
      rotulo: "Relatório de Diferenças de Caixa",
      passos: [
        { acao: "habilitaComponentes", ajustes: { filtro: "1" }, arquivo: false },
        { acao: "runReport", ajustes: diferencas, arquivo: true },
      ],
    },
  ];
}

/** Scripts das telas de caixa (só código da página, sem dados): mostram como pedir a lista de caixas (lupa) e cada botão. */
const SCRIPTS_TRIER = ["js/Rel_0122.js", "js/Rel_0031.js", "js/Rel_0275.js", "js/sgfpod1.js", "pfw/js/ajax.js", "pfw/js/pfw.js", "pfw/js/pfwListSearch.js"];

/**
 * Entra no Trier, lê o menu (lista de telas) e, em cada tela de caixa, anota os campos e executa os passos
 * (consultar / gerar XLS) enquanto houver tempo, guardando a resposta e o arquivo. Só leitura: não altera nada no Trier.
 */
export async function diagnosticarTrier(cred: CredenciaisTrier, dia: string, filial = ""): Promise<DiagnosticoTrier> {
  const comeco = Date.now();
  const resta = () => 285_000 - (Date.now() - comeco); // a função tem 300 s na Vercel
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  try {
    const menu = await trierPagina(base, "Menu.pod", ck);
    let menuInicio = "";
    try {
      if (menu.serial) menuInicio = await trierAcao(base, menu.serial, "httpStart", { attributes: trierAtributos(menu.html) }, ck, 60_000, "Menu.pod");
    } catch (e) {
      menuInicio = `[erro no httpStart do menu: ${e instanceof Error ? e.message : String(e)}]`;
    }
    const links = linksDoMenu(menu.html, menuInicio);
    const scripts: Record<string, string> = {};
    for (const js of SCRIPTS_TRIER) {
      try {
        const r = await httpPedido("GET", base + js, null, ck, 20_000);
        scripts[js] = r.cod === 200 ? corta(r.corpo.toString("latin1"), 400_000) : `[HTTP ${r.cod}]`;
      } catch (e) {
        scripts[js] = `[erro: ${e instanceof Error ? e.message : String(e)}]`;
      }
    }
    const relatorios: RelatorioDiagnosticado[] = [];
    for (const { pagina, rotulo, passos } of telasCaixaTrier(dia, filial)) {
      if (resta() < 20_000) break;
      const p = await trierPagina(base, pagina, ck);
      if (!p.serial) {
        relatorios.push({ pagina, rotulo, acessivel: false, campos: [], padroes: {}, html: corta(p.html || p.redir, 4000), inicio: "", tentativas: [] });
        continue;
      }
      let inicio = "";
      try {
        inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, pagina);
      } catch (e) {
        inicio = `[erro: ${e instanceof Error ? e.message : String(e)}]`;
      }
      const campos = camposDaTela(p.html);
      const padroes = padroesDoInicio(inicio);
      const rel: RelatorioDiagnosticado = { pagina, rotulo, acessivel: true, campos, padroes, html: corta(p.html, 300_000), inicio: corta(inicio, 100_000), tentativas: [] };
      const formulario = camposTentativa(campos, padroes);
      for (const passo of passos) {
        if (resta() < 25_000) break;
        const pedido = { ...formulario, ...passo.ajustes };
        const t: TentativaTrier = { acao: passo.acao, campos: pedido };
        try {
          const r = await trierAcao(base, p.serial, passo.acao, pedido, ck, Math.min(200_000, resta() - 20_000), pagina);
          t.resposta = corta(r, passo.arquivo ? 20_000 : 400_000);
          if (passo.arquivo) {
            const m = /openReport\('([^']+)'/i.exec(r);
            if (m) {
              const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, Math.max(10_000, Math.min(60_000, resta() - 10_000)));
              t.arquivo = m[1];
              t.tamanho = arq.corpo.length;
              if (arq.cod === 200 && arq.corpo.length <= 6_000_000) t.base64 = arq.corpo.toString("base64");
            } else t.mensagem = trierMsg(r) || "o Trier não devolveu arquivo";
          } else t.mensagem = trierMsg(r);
        } catch (e) {
          t.mensagem = e instanceof Error ? e.message : String(e);
        }
        rel.tentativas.push(t);
      }
      relatorios.push(rel);
    }
    // o menu inteiro já foi guardado no 1º diagnóstico; agora basta a lista de telas
    return { menuHtml: links.length ? "" : corta(menu.html, 1_500_000), menuInicio: links.length ? "" : corta(menuInicio, 1_500_000), links, scripts, relatorios };
  } finally {
    await trierSair(base, ck);
  }
}

export const _testeDiagnostico = { linksDoMenu, camposDaTela, padroesDoInicio, camposTentativa, telasCaixaTrier };

// ---------- diferença de caixa: "Relatório de Diferenças de Caixa" (Rel_0122) de cada filial, em Excel ----------

export type PedidoCaixaTrier = { dia: string; filial: number }; // dia em aaaa-mm-dd; filial = número no Trier (F002 → 2)
export type RespostaCaixaTrier = PedidoCaixaTrier & { xlsx?: Buffer; semMovimento?: boolean; erro?: string; ms: number };

const isoParaBr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Gera no Trier o Relatório de Diferenças de Caixa de cada filial × dia pedido (modo "Período", XLS), um por vez,
 * enquanto couber no prazo. Cada resposta vai para `aoReceber` assim que chega (quem chama grava na hora: se a função
 * for interrompida, o que já veio fica salvo). Devolve os pedidos que ficaram para a próxima rodada. Só leitura.
 * Uma filial por vez porque "todas as filiais" num pedido só passa de 2 minutos no Trier.
 */
export async function buscarDiferencasCaixaTrier(
  cred: CredenciaisTrier,
  pedidos: PedidoCaixaTrier[],
  aoReceber: (r: RespostaCaixaTrier) => Promise<void>,
  prazoMs = 270_000,
) {
  const comeco = Date.now();
  const resta = () => prazoMs - (Date.now() - comeco);
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  const restantes = [...pedidos];
  try {
    const pagina = "Rel_0122.pod";
    const p = await trierPagina(base, pagina, ck);
    if (!p.serial) throw new TrierErro('o usuário do robô no Trier não tem acesso ao "Relatório de Diferenças de Caixa" (Relatórios > Financeiros).');
    await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, pagina);
    const formulario = camposTentativa(camposDaTela(p.html), {});
    // como clicar em "Período" na tela: libera as datas
    await trierAcao(base, p.serial, "habilitaComponentes", { ...formulario, filtro: "1" }, ck, 30_000, pagina);
    while (restantes.length && resta() > 45_000) {
      const pedido = restantes[0];
      const t0 = Date.now();
      const dia = isoParaBr(pedido.dia);
      const campos = {
        ...formulario,
        filtro: "1",
        id_cod_filialEntrada: String(pedido.filial),
        id_cod_filial: String(pedido.filial),
        dt_abertura: dia,
        dt_fechamento: dia,
        chk_detalhar_forma_pagamento: "S",
        chk_exibir_justificativa: "N", // a tela desliga essa opção no modo Período
        saida: "4", // XLS
      };
      let resposta: RespostaCaixaTrier;
      try {
        const r = await trierAcao(base, p.serial, "runReport", campos, ck, Math.min(150_000, resta() - 15_000), pagina);
        const m = /openReport\('([^']+\.xlsx?)'/i.exec(r);
        if (m) {
          const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, Math.max(10_000, Math.min(60_000, resta() - 10_000)));
          if (arq.cod !== 200 || arq.corpo.subarray(0, 2).toString("latin1") !== "PK") throw new TrierErro("não consegui baixar o Excel gerado pelo Trier.");
          resposta = { ...pedido, xlsx: arq.corpo, ms: Date.now() - t0 };
        } else {
          const msg = trierMsg(r);
          resposta = /nenhum|n[aã]o (h[aá]|foram|existe)|sem (registro|movimento)/i.test(msg) ? { ...pedido, semMovimento: true, ms: Date.now() - t0 } : { ...pedido, erro: msg || "o Trier não gerou o relatório", ms: Date.now() - t0 };
        }
      } catch (e) {
        resposta = { ...pedido, erro: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
      }
      restantes.shift();
      await aoReceber(resposta);
      // sem conexão / tempo esgotado: o Trier está lento ou fora; não adianta seguir martelando nesta rodada
      if (resposta.erro && /sem conex[aã]o|tempo esgotado/i.test(resposta.erro)) break;
    }
  } finally {
    await trierSair(base, ck);
  }
  return { restantes, ms: Date.now() - comeco };
}
