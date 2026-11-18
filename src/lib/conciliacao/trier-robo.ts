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

/** Etapas de uma busca no Trier (sem usuário nem senha), para entender por que um relatório não veio. */
export type PassoTrier0010 = { etapa: string; ms: number; info?: string };

export class TrierErro extends Error {
  rastro?: PassoTrier0010[];
}

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

/**
 * Gera o relatório de contas a pagar (todas as filiais, por vencimento, detalhado, Excel) e devolve o .xlsx.
 * Manda o formulário inteiro da tela (como o navegador mandaria, igual ao robô do caixa) com as nossas escolhas por cima.
 * `rastro` anota cada etapa; num erro, vai junto no TrierErro.
 */
export async function buscarRelatorioTrier(cred: CredenciaisTrier, cfg: ConfigTrier = CONFIG_TRIER_PADRAO, prazoMs = 260_000) {
  const comeco = Date.now();
  const resta = () => prazoMs - (Date.now() - comeco);
  const rastro: PassoTrier0010[] = [];
  const anota = (etapa: string, info?: string) => rastro.push({ etapa, ms: Date.now() - comeco, ...(info ? { info: corta(info, 3000) } : {}) });
  const hoje = new Date();
  const ini = dataBr(new Date(hoje.getTime() - cfg.diasAntes * 86_400_000));
  const fim = dataBr(new Date(hoje.getTime() + cfg.diasDepois * 86_400_000));
  const ck: Cookies = {};
  let base = "";
  try {
    base = await trierEntrar(cred, ck);
    anota("login");
    const pagina = "Rel_0010.pod";
    const p = await trierPagina(base, pagina, ck);
    if (!p.serial) {
      anota("tela sem acesso", p.redir || semTags(p.html).replace(/\s+/g, " ").trim());
      throw new TrierErro('o usuário do robô no Trier não tem acesso ao relatório "Contas a Pagar ou Pagas" (Rel_0010).');
    }
    const telaCampos = camposDaTela(p.html);
    anota("tela aberta", telaCampos.map((c) => `${c.nome}=${c.valor}`).join(" "));
    const inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, pagina);
    anota("httpStart", trierMsg(inicio) || undefined);
    const campos: Record<string, string> = {
      ...camposTentativa(telaCampos, padroesDoInicio(inicio)),
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
      selecao1: "1", // a pagar
      selecao2: "3",
      selecao3: "1", // detalhado
      selecao4: "1",
      sel_filtroper: "1", // por vencimento
      agrup_fil: "1",
      quebra: "1",
      ordenacao: "1",
      saida: "4", // XLS
    };
    // todas as filiais × 2 meses pode levar minutos no Trier: espera o que der, guardando tempo para baixar
    const r = await trierAcao(base, p.serial, "runReport", campos, ck, Math.max(30_000, resta() - 40_000), pagina);
    const m = /openReport\('([^']+)'/i.exec(r);
    anota("runReport", m ? m[1] : semTags(r).replace(/\s+/g, " ").trim());
    if (!m) {
      const msg = trierMsg(r);
      throw new TrierErro(`o Trier não gerou o relatório${msg ? `: ${msg}` : " (resposta sem arquivo)."}`);
    }
    const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, Math.max(15_000, resta() - 10_000));
    anota("download", `HTTP ${arq.cod}, ${arq.corpo.length} bytes, começa com ${JSON.stringify(arq.corpo.subarray(0, 4).toString("latin1"))}`);
    if (arq.cod !== 200 || arq.corpo.length < 200) throw new TrierErro(`não consegui baixar o arquivo gerado pelo Trier (HTTP ${arq.cod}).`);
    if (arq.corpo.subarray(0, 2).toString("latin1") !== "PK") throw new TrierErro("o Trier devolveu um arquivo que não é Excel (.xlsx).");
    return { conteudo: arq.corpo, nome: `Trier contas a pagar ${ini.replaceAll("/", "-")} a ${fim.replaceAll("/", "-")}.xlsx`, periodo: `${ini} a ${fim}`, rastro };
  } catch (e) {
    const erro = e instanceof TrierErro ? e : new TrierErro(e instanceof Error ? e.message : String(e));
    if (!(e instanceof TrierErro)) anota("erro", erro.message);
    erro.rastro = rastro;
    throw erro;
  } finally {
    if (base) await trierSair(base, ck);
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

// ---------- diagnóstico de vendas: achar no menu os relatórios de vendas e gerar uma amostra de cada ----------

/** Relatórios de vendas vistos no menu em 19/10/2026 (desempenho por modalidade, relação de vendas, comissão): sempre abertos. */
const VENDAS_CONHECIDAS = ["Rel_0270.pod", "Rel_0027.pod", "Rel_0038.pod"];
// painel de vendas (modelo do usuário, 28/10): venda, atendimentos, ticket, unidades, premium (G47), genéricos+similares, Fortvigor, CMV
const EH_VENDA = /vend|comiss|tele|entreg|fatur|meta|ticket|curva|abc|desempenho|modalidade|balc|margem|lucr|cmv|gen[eé]ric|similar|premium/i;

export type RelatorioVendasDiagnosticado = RelatorioDiagnosticado & { contexto: string };
export type DiagnosticoVendasTrier = { links: LinkMenuTrier[]; scripts: Record<string, string>; relatorios: RelatorioVendasDiagnosticado[] };

const EH_DATA_FIM = /fim|final|ate|termino|fecha/i;

/** Campos de data do formulário (o nome muda de tela para tela): os de "fim/até" ganham o fim do período, os outros o início. */
function camposDeData(campos: CampoTrier[], padroes: Record<string, string>) {
  const ini: string[] = [];
  const fim: string[] = [];
  for (const c of campos) {
    if (c.tipo !== "text" && c.tipo !== "hidden" && c.tipo !== "date") continue;
    const v = padroes[c.nome] ?? c.valor;
    if (!(/^(dat|dt)_|_(dat|dt)$|data/i.test(c.nome) || /^\d{2}\/\d{2}\/\d{4}$/.test(v))) continue;
    (EH_DATA_FIM.test(c.nome) ? fim : ini).push(c.nome);
  }
  return [...ini, ...fim];
}

/** O formulário da tela com o dia nas datas, a filial do teste e a saída em Excel (4 = XLS em todas as telas vistas). */
function pedidoAmostra(campos: CampoTrier[], padroes: Record<string, string>, dia: string, filial: string) {
  const form = camposTentativa(campos, padroes);
  for (const n of camposDeData(campos, padroes)) form[n] = dia;
  if (filial)
    for (const n of ["id_cod_filial", "cod_filial"])
      if (n in form) {
        form[n] = filial;
        if (`${n}Entrada` in form) form[`${n}Entrada`] = filial;
      }
  const saida = campos.find((c) => c.tipo === "select" && /saida|formato/i.test(c.nome));
  if (saida) form[saida.nome] = saida.opcoes?.find((o) => /xls|excel|planilha/i.test(o.texto))?.valor ?? "4";
  else if ("saida" in form) form.saida = "4";
  return form;
}

/**
 * Entra no Trier, lê o menu e abre cada relatório de vendas (nome com venda, comissão, tele-entrega, faturamento…):
 * anota os campos e o script da tela e tenta gerar o relatório do dia, da filial do teste, em Excel.
 * Só leitura: não altera nada no Trier. O resultado serve para escolher de onde o robô de vendas tira os números.
 */
export async function diagnosticarVendasTrier(cred: CredenciaisTrier, dia: string, filial = ""): Promise<DiagnosticoVendasTrier> {
  const comeco = Date.now();
  const resta = () => 285_000 - (Date.now() - comeco); // a função tem 300 s na Vercel
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  try {
    const menu = await trierPagina(base, "Menu.pod", ck);
    let menuInicio = "";
    try {
      if (menu.serial) menuInicio = await trierAcao(base, menu.serial, "httpStart", { attributes: trierAtributos(menu.html) }, ck, 60_000, "Menu.pod");
    } catch {
      /* sem o httpStart fica só o que veio no HTML do menu */
    }
    const links = linksDoMenu(menu.html, menuInicio);
    const telas = links.filter((l) => /^Rel_/i.test(l.pagina) && (VENDAS_CONHECIDAS.includes(l.pagina) || EH_VENDA.test(`${l.rotulo} ${l.contexto}`)));
    for (const pagina of VENDAS_CONHECIDAS) if (!telas.some((t) => t.pagina === pagina)) telas.push({ pagina, rotulo: "", contexto: "" });
    // as conhecidas primeiro, depois as que têm "venda" no nome: ganham a amostra antes de o tempo acabar
    const peso = (l: LinkMenuTrier) => (VENDAS_CONHECIDAS.includes(l.pagina) ? 2 : /vend/i.test(l.rotulo) ? 1 : 0);
    telas.sort((a, b) => peso(b) - peso(a));
    const scripts: Record<string, string> = {};
    const relatorios: RelatorioVendasDiagnosticado[] = [];
    let guardado = 0; // bytes de arquivo guardados (a linha do diagnóstico não pode ficar enorme)
    for (const tela of telas.slice(0, 30)) {
      if (resta() < 20_000) break;
      const p = await trierPagina(base, tela.pagina, ck);
      if (!p.serial) {
        relatorios.push({ ...tela, acessivel: false, campos: [], padroes: {}, html: corta(p.html || p.redir, 2000), inicio: "", tentativas: [] });
        continue;
      }
      let inicio = "";
      try {
        inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, tela.pagina);
      } catch (e) {
        inicio = `[erro: ${e instanceof Error ? e.message : String(e)}]`;
      }
      const campos = camposDaTela(p.html);
      const padroes = padroesDoInicio(inicio);
      const rel: RelatorioVendasDiagnosticado = { ...tela, acessivel: true, campos, padroes, html: corta(p.html, 80_000), inicio: corta(inicio, 30_000), tentativas: [] };
      const js = `js/${tela.pagina.replace(/\.pod$/i, ".js")}`;
      try {
        const r = await httpPedido("GET", base + js, null, ck, 15_000);
        if (r.cod === 200) scripts[js] = corta(r.corpo.toString("latin1"), 120_000);
      } catch {
        /* o script é só para entender os botões da tela */
      }
      if (resta() > 40_000) {
        const pedido = pedidoAmostra(campos, padroes, dia, filial);
        const t: TentativaTrier = { acao: "runReport", campos: pedido };
        try {
          const r = await trierAcao(base, p.serial, "runReport", pedido, ck, Math.min(90_000, resta() - 25_000), tela.pagina);
          t.resposta = corta(r, 20_000);
          const m = /openReport\('([^']+)'/i.exec(r);
          if (m) {
            const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, Math.max(10_000, Math.min(60_000, resta() - 15_000)));
            t.arquivo = m[1];
            t.tamanho = arq.corpo.length;
            if (arq.cod === 200 && arq.corpo.length <= 2_500_000 && guardado + arq.corpo.length <= 8_000_000) {
              t.base64 = arq.corpo.toString("base64");
              guardado += arq.corpo.length;
            }
          } else t.mensagem = trierMsg(r) || "o Trier não devolveu arquivo";
        } catch (e) {
          t.mensagem = e instanceof Error ? e.message : String(e);
        }
        rel.tentativas.push(t);
      }
      relatorios.push(rel);
    }
    return { links, scripts, relatorios };
  } finally {
    await trierSair(base, ck);
  }
}

export const _testeDiagnostico = { linksDoMenu, camposDaTela, padroesDoInicio, camposTentativa, telasCaixaTrier, camposDeData, pedidoAmostra };

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

// ---------- vendas: os relatórios do Trier de onde sai o painel de vendas (todas as filiais, um período, Excel) ----------

/**
 * O que pedir em cada relatório. Opções conferidas no HTML das telas (diagnóstico de vendas de 28/10/2026):
 * Rel_0056 Vendas por Data — agrup_fil 2 = Filiais; selv 2 = vendas menos devoluções; chk_som_total S = só o total.
 * Rel_0080 Custo da Mercadoria Vendida — agrupFilial 2 = Filiais; agrupProd 1 = Grupo de produtos, 4 = Laboratório;
 *   soTotal S = só os totais do agrupamento; selecaoVend 2 = vendas menos devoluções.
 * Rel_0028 Vendas por Vendedor — agrup_fil 2 = Filiais; sel_relatorio 0 = totais por vendedor, 3 = vendedor e grupo de
 *   produtos; sel_vendas 2 = vendas menos devoluções; chk_vendastel S = só as vendas por tele-entrega.
 */
// Rel_0024 Vendas Produtos (receita e devoluções da DRE): mesmos campos, muda só a Seleção Vendas.
const AJUSTES_VENDAS_PRODUTOS = {
  agrup_fil: "2",
  consid_grfil: "C",
  consid_filial: "C",
  consid_grupo: "D",
  selecaoVendas: "0",
  selecaoPeriodo: "0",
  selecaoI: "9",
  selecaoII: "2",
  selecaoIII: "2",
  selecaoVI: "0",
  selecaoCusto: "3",
  selecaoCustoII: "0",
  agrup_rateio: "0",
  hor_init: "00:00:00",
  hor_fim: "23:59:59",
  hor_init_entrada: "00:00:00",
  hor_fim_entrada: "23:59:59",
  chk_transf: "N",
  chk_qtd_vendida_neg: "S",
  chk_produ_svendas_vendaxcompas: "N",
  chk_considerar_fornecedor: "N",
  chk_imprimir_estoq: "N",
  chk_mostraDescricaoProdutoCompleta: "N",
  chk_arquivo_layout_febrafar: "N",
  chk_imprimir_cod_barra: "N",
  chk_novo_layout: "N",
  chk_total_nota_compra: "N",
  chk_venda_promo: "N",
  chk_venda_itens_promo: "N",
  chk_imprimir_contato_cliente: "N",
  chk_venda_ecommerce: "N",
  chk_venda_ifood: "N",
  chk_venda_edelivery: "N",
  chk_venda_farmaciasapp: "N",
  chk_venda_pilotself: "N",
  chk_venda_scanntech: "N",
  chk_venda_promocao_importacao: "N",
  chk_produtos_sem_venda_e_estoque: "N",
} as const;
const ANTES_VENDAS_PRODUTOS = [
  { acao: "onChangeSelecaoI" },
  // a tela consulta o grupo antes (o nome vem da consulta); aqui o nome vai junto e a conferência é o código 61 na lista
  { acao: "addGrupo", campos: { cod_grupoEntrada: "61", cod_grupo: "61", cadgrpro_grupo_nom_grupo: "SERVICO" }, confere: /createSelectOption\('61 - [^']*',\s*'61'\)/, falha: "o Trier não confirmou a retirada do grupo 61 SERVICO" },
];

export const RELATORIOS_VENDAS = {
  filiais: { pagina: "Rel_0056.pod", rotulo: "Vendas por data, por filial", ajustes: { agrup_fil: "2", selv: "2", chk_som_total: "S" } },
  grupos: { pagina: "Rel_0080.pod", rotulo: "CMV por filial e grupo de produtos", ajustes: { agrupFilial: "2", agrupProd: "1", soTotal: "S", selecaoVend: "2" } },
  laboratorios: { pagina: "Rel_0080.pod", rotulo: "CMV por filial e laboratório", ajustes: { agrupFilial: "2", agrupProd: "4", soTotal: "S", selecaoVend: "2" } },
  atendimentos: { pagina: "Rel_0028.pod", rotulo: "Vendas por vendedor, por filial", ajustes: { agrup_fil: "2", sel_relatorio: "0", sel_vendas: "2", chk_vendastel: "N" } },
  vendedores: { pagina: "Rel_0028.pod", rotulo: "Vendedor por grupo de produtos (mês)", ajustes: { agrup_fil: "2", sel_relatorio: "3", sel_vendas: "2", chk_vendastel: "N" } },
  tele_entrega: { pagina: "Rel_0028.pod", rotulo: "Tele-entrega por vendedor, por filial", ajustes: { agrup_fil: "2", sel_relatorio: "0", sel_vendas: "2", chk_vendastel: "S" } },
  // só as vendas e-commerce (com a forma de pagamento): saem do televendas
  ecommerce: { pagina: "Rel_0027.pod", rotulo: "Vendas e-commerce (relação de vendas)", ajustes: { agrup_fil: "2", selecaoVendas: "2", agrupProduto: "0", chk_venda_ecommerce: "S", chk_impr_formapagto: "S" } },
  // quanto cada filial vendeu no tele (pedido do comercial, 10/11/2026): Relatórios > Vendas > Outros > Relação de Vendas,
  // só vendas tele-entrega, DESCONSIDERANDO o tipo de cartão 30 e os vendedores da central de televendas (já contados
  // à parte). As listas da tela (sel_cartao, sel_vendedor) são montadas pelas ações addCartao/addVendedor, como na tela.
  tele_filial: {
    pagina: "Rel_0027.pod",
    rotulo: "Tele-entrega de cada filial (relação de vendas, sem o cartão 30 e sem a central de televendas)",
    ajustes: { agrup_fil: "2", selecaoVendas: "2", agrupProduto: "0", chk_venda_tele_entrega: "S", chk_venda_ecommerce: "N", chk_impr_formapagto: "N", consid_cartao: "D", consid_vendedor: "D" },
    antes: [
      { acao: "addCartao", campos: { cod_cartaoEntrada: "30", cod_cartao: "30" }, confere: /createSelectOption\('30 - [^']*',\s*'30'\)/, falha: "o Trier não confirmou a retirada do tipo de cartão 30" },
      ...([
        ["56562", "ARTUR"],
        ["56698", "ISABEL FELISBINO"],
        ["56843", "JESSICA APARECIDA"],
        ["2582", "PRISCILLA SVOBODA"],
        ["60385", "DERIANE MARIA BENELLI"],
        ["56345", "SHEILA HIRT JACOVACS"],
        ["56828", "GUSTAVO MUNIZ PORTO"],
      ] as const).map(([cod, nome]) => ({
        acao: "addVendedor",
        campos: { cod_vendedorEntrada: cod, cod_vendedor: cod, cadusuar_vendedor_nom_usuario: nome },
        confere: new RegExp(`createSelectOption\\('${cod} - [^']*',\\s*'${cod}'\\)`),
        falha: `o Trier não confirmou a retirada do vendedor ${cod} ${nome}`,
      })),
    ],
  },
  // receita do mês fechado para a DRE (pedido do Luiz, 05/11/2026): Relatórios > Vendas > Produtos > Vendas Produtos,
  // agrupado por filial, só vendas, desconsiderando o grupo 61 SERVICO, totais por data, custo gerencial.
  // Rel_0024: agrup_fil 2 = Filiais; selecaoVendas 0 = Vendas; selecaoI 9 = TOTAIS POR DATA; selecaoII 2 = todos os
  // produtos; selecaoCusto 3 = Custo Gerencial. O grupo desconsiderado entra na lista da tela pela ação addGrupo.
  receita: {
    pagina: "Rel_0024.pod",
    rotulo: "Receita do mês por filial (Vendas Produtos sem o grupo 61 serviço)",
    ajustes: AJUSTES_VENDAS_PRODUTOS,
    // como a tela faz: trocar a Seleção I avisa o servidor; o grupo 61 só sai se o Trier devolver o nome dele
    antes: ANTES_VENDAS_PRODUTOS,
  },
  // devoluções do mês fechado para a DRE (pedido do Luiz, 10/11/2026): o mesmo caminho da receita (Vendas Produtos por
  // filial, sem o grupo 61 SERVICO) com a Seleção Vendas em "Devoluções" (selecaoVendas 1). Vai para "(-) Devoluções".
  devolucoes: {
    pagina: "Rel_0024.pod",
    rotulo: "Devoluções do mês por filial (Vendas Produtos, seleção Devoluções, sem o grupo 61 serviço)",
    ajustes: { ...AJUSTES_VENDAS_PRODUTOS, selecaoVendas: "1" },
    antes: ANTES_VENDAS_PRODUTOS,
  },
} as const;
export type RelatorioVendas = keyof typeof RELATORIOS_VENDAS;
type PassoAntes = { acao: string; campos?: Record<string, string>; confere?: RegExp; falha?: string };

// campos de filial das telas de venda: vazios = todas as filiais
const FILIAL_TODAS = ["cod_filial", "cod_filialEntrada", "id_cod_filial", "id_cod_filialEntrada", "sel_filial", "listFilial", "filial_sql_in"];

export type PedidoVendasTrier = { relatorio: RelatorioVendas; de: string; ate: string }; // aaaa-mm-dd
export type RespostaVendasTrier = PedidoVendasTrier & { xlsx?: Buffer; semMovimento?: boolean; erro?: string; ms: number };

/**
 * Gera no Trier cada relatório de vendas pedido (todas as filiais, agrupado por filial, Excel), um por vez, enquanto
 * couber no prazo. Cada resposta vai para `aoReceber` assim que chega. Devolve os pedidos que ficaram para a próxima
 * rodada. Só leitura: não altera nada no Trier.
 */
export async function buscarVendasTrier(cred: CredenciaisTrier, pedidos: PedidoVendasTrier[], aoReceber: (r: RespostaVendasTrier) => Promise<void>, prazoMs = 270_000) {
  const comeco = Date.now();
  const resta = () => prazoMs - (Date.now() - comeco);
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  // a tele por filial usa a mesma tela do e-commerce (Rel_0027) com listas de "desconsiderar": vai por último na rodada,
  // numa instância própria da tela, para as listas nunca valerem no relatório do e-commerce
  const restantes = [...pedidos].sort((a, b) => Number(a.relatorio === "tele_filial") - Number(b.relatorio === "tele_filial"));
  // cada tela é aberta uma vez por rodada: o formulário como o navegador mandaria + os campos de data
  const telas = new Map<string, { serial: string; formulario: Record<string, string>; datas: string[] } | null>();
  try {
    while (restantes.length && resta() > 45_000) {
      const pedido = restantes[0];
      const cfg = RELATORIOS_VENDAS[pedido.relatorio];
      const t0 = Date.now();
      let resposta: RespostaVendasTrier;
      try {
        // relatório com passos próprios (listas da tela) ganha a sua instância da tela
        const chaveTela = "antes" in cfg ? `${cfg.pagina}|${pedido.relatorio}` : cfg.pagina;
        let tela = telas.get(chaveTela);
        if (tela === undefined) {
          const p = await trierPagina(base, cfg.pagina, ck);
          tela = null;
          if (p.serial) {
            const inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, cfg.pagina);
            const campos = camposDaTela(p.html);
            const padroes = padroesDoInicio(inicio);
            tela = { serial: p.serial, formulario: camposTentativa(campos, padroes), datas: camposDeData(campos, padroes) };
            // passos que a tela faz antes de gerar (escolhas que o servidor do Trier guarda); se um falhar, nada é gerado
            const antes: readonly PassoAntes[] = "antes" in cfg ? cfg.antes : [];
            for (const passo of antes) {
              const r = await trierAcao(base, p.serial, passo.acao, { ...tela.formulario, ...cfg.ajustes, ...passo.campos }, ck, 30_000, cfg.pagina);
              if (passo.confere && !passo.confere.test(r)) {
                const msg = trierMsg(r);
                throw new TrierErro(`${passo.falha ?? `o Trier recusou a etapa ${passo.acao}`}${msg ? `: ${msg}` : ""} [resposta: ${corta(semTags(r).replace(/\s+/g, " ").trim(), 240)}]`);
              }
            }
          }
          telas.set(chaveTela, tela);
        }
        if (!tela) throw new TrierErro(`o usuário do robô no Trier não abre "${cfg.rotulo}" (${cfg.pagina}).`);
        const campos: Record<string, string> = { ...tela.formulario };
        for (const n of tela.datas) campos[n] = isoParaBr(EH_DATA_FIM.test(n) ? pedido.ate : pedido.de);
        for (const n of FILIAL_TODAS) if (n in campos) campos[n] = "";
        Object.assign(campos, cfg.ajustes, { saida: "4" }); // 4 = XLS
        const r = await trierAcao(base, tela.serial, "runReport", campos, ck, Math.min(150_000, resta() - 15_000), cfg.pagina);
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
      if (resposta.erro && /sem conex[aã]o|tempo esgotado/i.test(resposta.erro)) break;
    }
  } finally {
    await trierSair(base, ck);
  }
  return { restantes, ms: Date.now() - comeco };
}

// ---------- relatório avulso (pedido pontual: uma tela, um período, os filtros da tela) ----------

export type PassoAntesTrier = PassoAntes;
export type RelatorioAvulsoTrier = { pagina: string; rotulo: string; ajustes: Record<string, string>; antes?: readonly PassoAntes[] };

/**
 * Gera UM relatório do Trier com os filtros pedidos (todas as filiais, Excel), do jeito que a tela faria: abre a tela,
 * roda os passos que montam as listas (vendedor, laboratório...) e pede o Excel. Só leitura: não altera nada no Trier.
 */
export async function gerarRelatorioAvulsoTrier(cred: CredenciaisTrier, cfg: RelatorioAvulsoTrier, de: string, ate: string, prazoMs = 250_000) {
  const comeco = Date.now();
  const resta = () => prazoMs - (Date.now() - comeco);
  const ck: Cookies = {};
  const base = await trierEntrar(cred, ck);
  try {
    const p = await trierPagina(base, cfg.pagina, ck);
    if (!p.serial) throw new TrierErro(`o usuário do robô no Trier não abre "${cfg.rotulo}" (${cfg.pagina}).`);
    const inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 30_000, cfg.pagina);
    const camposTela = camposDaTela(p.html);
    const padroes = padroesDoInicio(inicio);
    const formulario = camposTentativa(camposTela, padroes);
    for (const passo of cfg.antes ?? []) {
      const r = await trierAcao(base, p.serial, passo.acao, { ...formulario, ...cfg.ajustes, ...passo.campos }, ck, 30_000, cfg.pagina);
      if (passo.confere && !passo.confere.test(r)) {
        const msg = trierMsg(r);
        throw new TrierErro(`${passo.falha ?? `o Trier recusou a etapa ${passo.acao}`}${msg ? `: ${msg}` : ""} [resposta: ${corta(semTags(r).replace(/\s+/g, " ").trim(), 240)}]`);
      }
    }
    const campos: Record<string, string> = { ...formulario };
    for (const n of camposDeData(camposTela, padroes)) campos[n] = isoParaBr(EH_DATA_FIM.test(n) ? ate : de);
    for (const n of FILIAL_TODAS) if (n in campos) campos[n] = "";
    Object.assign(campos, cfg.ajustes, { saida: "4" }); // 4 = XLS
    const r = await trierAcao(base, p.serial, "runReport", campos, ck, Math.min(180_000, resta() - 15_000), cfg.pagina);
    const m = /openReport\('([^']+\.xlsx?)'/i.exec(r);
    if (!m) {
      const msg = trierMsg(r);
      if (/nenhum|n[aã]o (h[aá]|foram|existe)|sem (registro|movimento)/i.test(msg)) return { semMovimento: true as const, ms: Date.now() - comeco };
      throw new TrierErro(msg || "o Trier não gerou o relatório");
    }
    const arq = await httpPedido("GET", base + m[1].replace(/^\/+/, ""), null, ck, Math.max(10_000, Math.min(60_000, resta() - 10_000)));
    if (arq.cod !== 200 || arq.corpo.subarray(0, 2).toString("latin1") !== "PK") throw new TrierErro("não consegui baixar o Excel gerado pelo Trier.");
    return { xlsx: arq.corpo, ms: Date.now() - comeco };
  } finally {
    await trierSair(base, ck);
  }
}

// ---------- produto: Cadastros >> Produtos e Fornecedores >> Produtos (Cad_0020), consulta pelo código reduzido ----------

/**
 * Tela que o Luiz usa para conferir preço × etiqueta (caminho passado em 18/11/2026). Conferido no HTML/JS da tela
 * (diagnóstico de 18/11): o código vai em cod_redbarraEntrada / cod_redbarra ("Código, Cód.Barras ou Nome") e a tela
 * carrega o produto com doAction('buscaProdutoPorCodReduzido'); a resposta escreve nom_produto, vlr_venda etc.
 */
export const TELA_PRODUTOS_TRIER = "Cad_0020.pod";
const ACAO_BUSCA_PRODUTO = "buscaProdutoPorCodReduzido";

export type ProdutoTrier = { codigo: string; descricao: string; preco: number; precoLiquido: number | null };
export type DiagProdutoTrier = {
  tela: string;
  rastro: PassoTrier0010[];
  valores?: Record<string, string>;
  mensagem?: string;
  resposta?: string;
  html?: string;
};

/** Valores que a resposta de uma ação escreve na tela ($el('x').value = '...'). */
function valoresDaResposta(js: string) {
  const out: Record<string, string> = {};
  for (const m of js.matchAll(/\$el\('([^']+)'\)\.(?:value|innerHTML|innerText|textContent)\s*=\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] = desescapar(m[2]);
  for (const m of js.matchAll(/(?:setValue|setVal|setText)\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) out[m[1]] ??= desescapar(m[2]);
  return out;
}

/** "1.234,56" / "12,90" / "12.90" → número; vazio ou inválido → null. */
function numeroTrier(v: string | undefined) {
  const s = (v ?? "").trim().replace(/[R$\s]/g, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const n = Number(/,\d{1,4}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

const soDigitos = (s: string) => s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

/**
 * Produto na resposta da tela: descrição (nom_produto) e preço de venda (vlr_venda). Se o código digitado é um código
 * reduzido e a tela carregou outro produto, não devolve nada (nunca mostra preço de outro item).
 */
export function produtoDaResposta(valores: Record<string, string>, codigo: string): ProdutoTrier | null {
  const descricao = (valores.nom_produto || valores.nom_prodcomp || "").replace(/\s+/g, " ").trim();
  const preco = numeroTrier(valores.vlr_venda);
  if (!descricao || preco === null || preco <= 0) return null;
  const reduzido = soDigitos(valores.id_cod_reduzido ?? valores.cod_redbarra ?? "");
  const digitado = soDigitos(codigo);
  if (reduzido && digitado.length <= 7 && reduzido !== digitado) return null;
  const liq = numeroTrier(valores.vlr_vendaliq);
  return { codigo: reduzido || codigo, descricao: descricao.slice(0, 200), preco, precoLiquido: liq !== null && liq > 0 && Math.abs(liq - preco) >= 0.005 ? liq : null };
}

/**
 * Abre no Trier Cadastros > Produtos e Fornecedores > Produtos, informa o código e lê a descrição e o preço de venda,
 * como a tela faz ao digitar o código. Só consulta (a única ação chamada é a de buscar o produto). Devolve também o
 * diagnóstico (valores que a tela recebeu) para conferir quando não achar.
 */
export async function buscarProdutoTrier(cred: CredenciaisTrier, codigo: string, prazoMs = 40_000): Promise<{ produto: ProdutoTrier | null; motivo?: string; diag: DiagProdutoTrier }> {
  const comeco = Date.now();
  const resta = () => prazoMs - (Date.now() - comeco);
  const diag: DiagProdutoTrier = { tela: TELA_PRODUTOS_TRIER, rastro: [] };
  const anota = (etapa: string, info?: string) => diag.rastro.push({ etapa, ms: Date.now() - comeco, ...(info ? { info: corta(info, 2000) } : {}) });
  const ck: Cookies = {};
  let base = "";
  try {
    base = await trierEntrar(cred, ck);
    anota("login");
    const p = await trierPagina(base, TELA_PRODUTOS_TRIER, ck);
    if (!p.serial) {
      diag.html = corta(p.html || p.redir, 20_000);
      return { produto: null, motivo: "o usuário do robô no Trier não abre Cadastros > Produtos (Cad_0020)", diag };
    }
    const inicio = await trierAcao(base, p.serial, "httpStart", { attributes: trierAtributos(p.html) }, ck, 20_000, TELA_PRODUTOS_TRIER);
    anota("httpStart", trierMsg(inicio) || undefined);
    const form = { ...camposTentativa(camposDaTela(p.html), padroesDoInicio(inicio)), cod_redbarraEntrada: codigo, cod_redbarra: codigo };
    const r = await trierAcao(base, p.serial, ACAO_BUSCA_PRODUTO, form, ck, Math.max(8_000, Math.min(25_000, resta() - 3_000)), TELA_PRODUTOS_TRIER);
    const valores = valoresDaResposta(r);
    diag.mensagem = trierMsg(r);
    diag.valores = Object.fromEntries(Object.entries(valores).map(([k, v]) => [k, v.slice(0, 200)]));
    diag.resposta = corta(r, 60_000);
    anota(ACAO_BUSCA_PRODUTO, diag.mensagem || `${Object.keys(valores).length} campos`);
    const produto = produtoDaResposta(valores, codigo);
    if (produto) return { produto, diag };
    if (diag.mensagem) return { produto: null, motivo: `Trier: ${diag.mensagem}`, diag };
    return { produto: null, motivo: valores.nom_produto ? "o Trier não mostrou o preço de venda desse produto" : "o Trier não achou esse código", diag };
  } catch (e) {
    anota("erro", e instanceof Error ? e.message : String(e));
    return { produto: null, motivo: e instanceof Error ? e.message : String(e), diag };
  } finally {
    if (base) await trierSair(base, ck);
  }
}

export const _testeProduto = { valoresDaResposta, numeroTrier, produtoDaResposta };
