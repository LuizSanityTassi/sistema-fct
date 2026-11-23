// Agente WhatsApp do Portal FCT — manda os chamados novos nos grupos de WhatsApp de cada setor.
// Conecta um número pelo QR code (como o WhatsApp Web, biblioteca Baileys) e, a cada 10 segundos, pergunta ao portal o
// que mandar (/api/whatsapp/agente, com a chave do config.json). Use um CHIP SÓ PARA ISSO: é conexão não oficial.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { exec } = require("node:child_process");

const PASTA = __dirname;
const SESSAO = path.join(PASTA, "sessao");
const ARQ_QR = path.join(PASTA, "qr.png");
const LOG = path.join(PASTA, "agente.log");

function log(...partes) {
  const linha = `[${new Date().toLocaleString("pt-BR")}] ${partes.join(" ")}`;
  console.log(linha);
  try {
    fs.appendFileSync(LOG, linha + "\n");
  } catch {}
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(path.join(PASTA, "config.json"), "utf8"));
} catch (e) {
  log("Não consegui ler o config.json:", e.message);
  process.exit(1);
}
if (!cfg.chave || !/^ag_[0-9a-f]{48}$/.test(cfg.chave)) {
  log("Cole a chave do agente no config.json (Portal → Chamados → WhatsApp dos setores → Gerar a chave do agente).");
  process.exit(1);
}
const PORTAL = String(cfg.portal || "https://portal.farmaciafct.com.br").replace(/\/$/, "");

let baileys, pino, QR, qrTerminal;
try {
  baileys = require("@whiskeysockets/baileys");
  pino = require("pino");
  QR = require("qrcode");
  qrTerminal = require("qrcode-terminal");
} catch {
  log("Faltam as bibliotecas. Rode o iniciar.bat (ele instala na primeira vez).");
  process.exit(1);
}
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys;

let sock = null;
let conectado = false;
let numero = null;
let situacao = "iniciando";
let gruposParaMandar = null; // lista nova de grupos, mandada na próxima rodada
let ultimaListaGrupos = 0;
let resultados = []; // resultado dos envios, mandado na próxima rodada
let ocupado = false;
let qrAberto = false;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSAO);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    browser: Browsers.windows("Portal FCT"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      situacao = "aguardando o QR code";
      qrTerminal.generate(qr, { small: true });
      try {
        await QR.toFile(ARQ_QR, qr, { width: 420, margin: 2 });
        log("Escaneie o QR code com o WhatsApp do chip: Configurações → Aparelhos conectados → Conectar aparelho. (Também está em qr.png.)");
        if (!qrAberto) {
          qrAberto = true;
          exec(`start "" "${ARQ_QR}"`);
        }
      } catch {}
    }
    if (connection === "open") {
      conectado = true;
      qrAberto = false;
      situacao = "conectado";
      numero = String(sock.user?.id || "").split(":")[0].split("@")[0] || null;
      ultimaListaGrupos = 0;
      try {
        fs.rmSync(ARQ_QR, { force: true });
      } catch {}
      log(`WhatsApp conectado${numero ? ` (${numero})` : ""}.`);
    }
    if (connection === "close") {
      conectado = false;
      const codigo = lastDisconnect?.error?.output?.statusCode;
      if (codigo === DisconnectReason.loggedOut) {
        situacao = "desconectado pelo celular: escaneie o QR de novo";
        log("O celular desconectou este computador. Vou mostrar um QR code novo.");
        try {
          fs.rmSync(SESSAO, { recursive: true, force: true });
        } catch {}
      } else {
        situacao = "reconectando";
        log("Conexão caiu, reconectando…");
      }
      setTimeout(() => conectar().catch((e) => log("Erro ao conectar:", e.message)), 5000);
    }
  });
}

async function rodada() {
  if (ocupado) return;
  ocupado = true;
  try {
    if (conectado && Date.now() - ultimaListaGrupos > 5 * 60 * 1000) {
      const todos = await sock.groupFetchAllParticipating();
      gruposParaMandar = Object.values(todos).map((g) => ({ jid: g.id, nome: g.subject || g.id }));
      ultimaListaGrupos = Date.now();
    }
    const corpo = { numero, conectado, situacao, resultados };
    if (gruposParaMandar) corpo.grupos = gruposParaMandar;
    const r = await fetch(`${PORTAL}/api/whatsapp/agente`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agente": cfg.chave },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      log("O portal recusou:", j.erro || `HTTP ${r.status}`);
      return;
    }
    resultados = [];
    if (corpo.grupos) gruposParaMandar = null;
    for (const p of j.pendentes || []) {
      try {
        await sock.sendMessage(p.grupo, { text: p.mensagem });
        resultados.push({ id: p.id, ok: true });
        log(`Enviado #${p.id} para o grupo ${p.grupo}.`);
      } catch (e) {
        resultados.push({ id: p.id, ok: false, erro: String(e?.message || e).slice(0, 200) });
        log(`Falhou #${p.id}:`, e?.message || e);
      }
      await espera(1500);
    }
  } catch (e) {
    log("Erro na rodada (sem internet?):", e.message);
  } finally {
    ocupado = false;
  }
}

log(`Agente WhatsApp iniciando (portal ${PORTAL}).`);
conectar().catch((e) => log("Erro ao conectar:", e.message));
setInterval(rodada, 10_000);
