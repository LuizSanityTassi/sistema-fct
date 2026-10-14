// Robô do Trier (só servidor): entra no Trier web (Podium), gera o relatório "Contas a Pagar ou Pagas" (Rel_0010)
// de todas as filiais em Excel e devolve o arquivo — porta fiel das funções trier_* do api.php da ferramenta anterior.
// Credenciais SÓ em variáveis de ambiente (TRIER_URL, TRIER_USUARIO, TRIER_SENHA): nunca no banco, no código ou no Git.
import http from "node:http";
import https from "node:https";

export type ConfigTrier = { diasAntes: number; diasDepois: number };
export const CONFIG_TRIER_PADRAO: ConfigTrier = { diasAntes: 5, diasDepois: 60 };
/** Guardado em conc_config "trier_ultimo": como foi a última busca. */
export type UltimaBuscaTrier = { quando: string; por: string | null; ok: boolean; msg: string; periodo: string; arquivoId?: string | null };

const URL_PADRAO = "http://redefct.ddns.com.br:4647/sgfpod1/";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36 SistemaFCT";

type Cookies = Record<string, string>;
type Resposta = { cod: number; corpo: Buffer; local: string };

export class TrierErro extends Error {}

function credenciais() {
  const url = (process.env.TRIER_URL || URL_PADRAO).trim();
  return { url: url.endsWith("/") ? url : `${url}/`, usuario: (process.env.TRIER_USUARIO ?? "").trim(), senha: process.env.TRIER_SENHA ?? "" };
}

/** O que a tela pode mostrar: configurado ou não, endereço e começo do usuário (nunca a senha). */
export function statusTrier() {
  const c = credenciais();
  return { configurado: Boolean(c.usuario && c.senha), url: c.url, usuario: c.usuario ? `${c.usuario.slice(0, 2)}•••` : "" };
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

async function trierEntrar(ck: Cookies) {
  const cfg = credenciais();
  if (!cfg.usuario || !cfg.senha) throw new TrierErro("usuário e senha do Trier não configurados no servidor (TRIER_USUARIO / TRIER_SENHA).");
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
export async function testarLoginTrier() {
  const ck: Cookies = {};
  const base = await trierEntrar(ck);
  await trierSair(base, ck);
}

/** Gera o relatório de contas a pagar (todas as filiais, por vencimento, detalhado, Excel) e devolve o .xlsx. */
export async function buscarRelatorioTrier(cfg: ConfigTrier = CONFIG_TRIER_PADRAO) {
  const hoje = new Date();
  const ini = dataBr(new Date(hoje.getTime() - cfg.diasAntes * 86_400_000));
  const fim = dataBr(new Date(hoje.getTime() + cfg.diasDepois * 86_400_000));
  const ck: Cookies = {};
  const base = await trierEntrar(ck);
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
