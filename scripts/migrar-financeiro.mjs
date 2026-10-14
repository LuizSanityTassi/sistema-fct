#!/usr/bin/env node
// Migra o fluxo de caixa anterior (SQLite do app "fluxo-caixa") para o Sistema FCT.
//
//   node scripts/migrar-financeiro.mjs --db "C:\caminho\fluxo-caixa.db"              # só mostra o plano (padrão)
//   node scripts/migrar-financeiro.mjs --db "C:\caminho\fluxo-caixa.db" --confirmar  # grava
//
// Opções: --seeds <pasta com seed-dre.json e seed-financeiro.json> (padrão: pasta acima da do banco)
//         --lote <n> (lançamentos por requisição, padrão 500)
//
// Autenticação: usa a SUA conta (admin) via e-mail/senha — nunca a service_role key.
//   E-mail: variável FCT_EMAIL ou pergunta no terminal. Senha: FCT_SENHA ou pergunta (sem eco).
//   URL/anon key vêm do .env.local (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).
//
// Reexecutável: categorias são upsert por (tipo, grupo, nome); lançamentos por legado_id (duplicados são ignorados);
// unidades só são criadas quando não existem. Nada é apagado.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@supabase/supabase-js";

// ---------- argumentos ----------
const argv = process.argv.slice(2);
const opcao = (nome) => {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] : undefined;
};
const CONFIRMAR = argv.includes("--confirmar");
const DB = opcao("--db");
if (!DB) falhar("Informe --db <caminho do fluxo-caixa.db>.");
if (!existsSync(DB)) falhar(`Banco não encontrado: ${DB}`);
const SEEDS = opcao("--seeds") ?? dirname(dirname(resolve(DB)));
const LOTE = Number(opcao("--lote") ?? 500);

function falhar(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}
const log = (...a) => console.log(...a);
const brl = (n) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ---------- ambiente / login ----------
try {
  process.loadEnvFile(".env.local");
} catch {
  // sem .env.local: as variáveis precisam vir do ambiente
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !ANON) falhar("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não encontrados (rode na pasta do projeto, com .env.local).");

function perguntar(pergunta, oculto = false) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (oculto) {
      const original = rl._writeToOutput.bind(rl);
      rl._writeToOutput = (texto) => {
        if (texto.includes(pergunta)) original(pergunta);
      };
    }
    rl.question(pergunta, (resposta) => {
      rl.close();
      if (oculto) process.stdout.write("\n");
      resolve(resposta.trim());
    });
  });
}

const supabase = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
let uid;
let email;
if (process.env.FCT_ACCESS_TOKEN && process.env.FCT_REFRESH_TOKEN) {
  // Sessão já aberta (ex.: disparado pelo próprio sistema em desenvolvimento): nada de senha.
  const { data, error } = await supabase.auth.setSession({ access_token: process.env.FCT_ACCESS_TOKEN, refresh_token: process.env.FCT_REFRESH_TOKEN });
  if (error || !data.user) falhar(`Sessão inválida: ${error?.message ?? "sem usuário"}`);
  uid = data.user.id;
  email = data.user.email;
} else {
  email = process.env.FCT_EMAIL || (await perguntar("E-mail do seu usuário (admin): "));
  const senha = process.env.FCT_SENHA || (await perguntar("Senha: ", true));
  const { data: login, error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) falhar(`Login falhou: ${erroLogin.message}`);
  uid = login.user.id;
}
const { data: perfil } = await supabase.from("profiles").select("nome, papel").eq("id", uid).maybeSingle();
if (perfil?.papel !== "admin") falhar(`O usuário ${email} não é administrador (papel: ${perfil?.papel ?? "?"}). A migração cria unidades, então precisa de admin.`);
log(`✔ Logado como ${perfil.nome} (admin)`);

// ---------- legado ----------
const db = new DatabaseSync(DB);
db.exec("pragma query_only = 1");
const categoriasLegado = db.prepare("select tipo, grupo, categoria from categorias").all();
const filiaisLegado = db.prepare("select nome, empresa, regional, ativo from filiais").all();
const lancamentos = db.prepare("select id, filial, tipo, grupo, categoria, valor, data, obs, lote_id from lancamentos order by id").all();
log(`✔ Legado: ${lancamentos.length} lançamentos, ${categoriasLegado.length} categorias, ${filiaisLegado.length} filiais`);

const lerSeed = (nome) => {
  const caminho = join(SEEDS, nome);
  if (!existsSync(caminho)) {
    log(`  (aviso) ${nome} não encontrado em ${SEEDS}: categorias ficam sem essa classificação`);
    return {};
  }
  return JSON.parse(readFileSync(caminho, "utf8"));
};
const cat2cls = lerSeed("seed-dre.json").cat2cls ?? {};
const cat2fin = lerSeed("seed-financeiro.json").cat2fin ?? {};

const limpar = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const chaveNome = (s) => semAcento(limpar(s)).toLowerCase();
const procurar = (mapa, nome) => mapa[nome] ?? mapa[limpar(nome)] ?? Object.entries(mapa).find(([k]) => chaveNome(k) === chaveNome(nome))?.[1];
const TIPO = { Pagar: "pagar", Receber: "receber" };
const GRUPOS_IGNORADOS = new Set(["teste", "testeshim", "zz"]);

// ---------- categorias ----------
const categorias = new Map(); // chave tipo|grupo|nome -> linha
const chaveCat = (tipo, grupo, nome) => `${tipo}|${grupo}|${nome}`;
function registrarCategoria(tipoLegado, grupoLegado, nomeLegado) {
  const tipo = TIPO[limpar(tipoLegado)];
  const grupo = limpar(grupoLegado);
  const nome = limpar(nomeLegado);
  if (!tipo || !grupo || !nome) return null;
  const k = chaveCat(tipo, grupo, nome);
  if (!categorias.has(k)) {
    const cls = procurar(cat2cls, nome);
    const fin = procurar(cat2fin, nome);
    categorias.set(k, {
      tipo,
      grupo,
      nome,
      dre_familia: cls?.familia ?? null,
      dre_grupo: cls?.grupo ?? null,
      dre_sinal: cls?.sinal ?? null,
      fin_familia: fin?.familia ?? null,
      fin_grupo: fin?.grupo ?? null,
    });
  }
  return k;
}
for (const c of categoriasLegado) {
  if (GRUPOS_IGNORADOS.has(chaveNome(c.grupo))) continue;
  registrarCategoria(c.tipo, c.grupo, c.categoria);
}
let combosNovos = 0;
for (const l of lancamentos) {
  const antes = categorias.size;
  registrarCategoria(l.tipo, l.grupo, l.categoria);
  if (categorias.size > antes) combosNovos += 1;
}
const semDre = [...categorias.values()].filter((c) => !c.dre_familia).length;
log(`✔ Categorias a garantir: ${categorias.size} (${combosNovos} só existiam nos lançamentos; ${semDre} sem classificação DRE)`);

// ---------- unidades ----------
const { data: orgs, error: eOrgs } = await supabase.from("organizations").select("id, nome_fantasia");
if (eOrgs) falhar(eOrgs.message);
const { data: branches, error: eBr } = await supabase.from("branches").select("id, codigo, nome, cnpj, organization_id, ativo");
if (eBr) falhar(eBr.message);
const orgPorNome = (nome) => orgs.find((o) => chaveNome(o.nome_fantasia ?? "") === chaveNome(nome));

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const COD_RE = /\bF\d{3}\b/;
const digitos = (s) => String(s ?? "").replace(/\D/g, "");
const EMPRESA_LEGADO = { VARELA: "VARELA", ITAJAI: "VARELA", NAZARIO: "NAZARIO", BLUMENAU: "NAZARIO" };
const REGIONAL_LEGADO = { SUL: "Sul", SERRA: "Serra", OESTE: "Oeste", BLUMENAU: "Blumenau", "VALE DO ITAJAI": "Vale do Itajaí" };
const NOMES = { "SAO VICENTE": "SÃO VICENTE", ITAJAI: "ITAJAÍ", CENTENARIO: "CENTENÁRIO", "ALVARO CATAO": "ÁLVARO CATÃO", ADMINSTRATIVO: "ADMINISTRATIVO" };
// Nomes do legado que não seguem o padrão "Fxxx NOME CNPJ".
const ESPECIAIS = {
  TELEVENDAS: { codigo: "TLV", nome: "TELEVENDAS", empresa: "VARELA", regional: "Administrativo" },
  TERCEIRIZADAS: { codigo: "TERC", nome: "TERCEIRIZADAS (legado)", empresa: "VARELA", regional: "Terceirizadas" },
  "423 - ADMINISTRATIVO 20-82": { codigo: "F423", nome: "ADMINISTRATIVO", empresa: "NAZARIO", regional: "Administrativo" },
};
const regionalPorCodigo = (codigo) => {
  const n = Number(codigo.slice(1));
  if (n < 100) return "Sul";
  if (n < 200) return "Serra";
  if (n < 300) return "Vale do Itajaí";
  if (n < 500) return "Oeste";
  return "Blumenau";
};

function existente(nomeLegado) {
  const cnpj = nomeLegado.match(CNPJ_RE)?.[0];
  if (cnpj) {
    const b = branches.find((x) => digitos(x.cnpj) === digitos(cnpj));
    if (b) return b;
  }
  const codigo = nomeLegado.match(COD_RE)?.[0] ?? ESPECIAIS[limpar(nomeLegado)]?.codigo;
  return codigo ? branches.find((x) => x.codigo === codigo) : undefined;
}

function planejarNova(nomeLegado) {
  const legado = filiaisLegado.find((f) => f.nome === nomeLegado);
  const esp = ESPECIAIS[limpar(nomeLegado)];
  if (esp) return { ...esp, cnpj: null, ativo: true };
  const codigo = nomeLegado.match(COD_RE)?.[0];
  if (!codigo) return null;
  const cnpj = nomeLegado.match(CNPJ_RE)?.[0] ?? null;
  let nome = limpar(nomeLegado.replace(CNPJ_RE, "").replace(COD_RE, "").replace(/INATIVA/i, "").replace(/[-–]/g, " ")).toUpperCase();
  nome = NOMES[nome] ?? nome;
  const empresa = EMPRESA_LEGADO[limpar(legado?.empresa).toUpperCase()] ?? (codigo >= "F300" ? "NAZARIO" : "VARELA");
  const regional = REGIONAL_LEGADO[limpar(legado?.regional).toUpperCase()] ?? regionalPorCodigo(codigo);
  const ativo = !/INATIVA/i.test(nomeLegado) && (legado ? legado.ativo !== 0 : true);
  return { codigo, nome, cnpj, empresa, regional, ativo };
}

const nomesFilial = [...new Set(lancamentos.map((l) => l.filial))].sort();
const mapaFilial = new Map(); // nome legado -> branch_id
const novas = []; // { nomeLegado, ...plano }
const semMapa = [];
for (const nome of nomesFilial) {
  const b = existente(nome);
  if (b) {
    mapaFilial.set(nome, b.id);
    continue;
  }
  const plano = planejarNova(nome);
  if (!plano || !orgPorNome(plano.empresa)) {
    semMapa.push(nome);
    continue;
  }
  novas.push({ nomeLegado: nome, ...plano });
}
if (semMapa.length) falhar(`Filiais do legado sem correspondência e sem regra de criação:\n  - ${semMapa.join("\n  - ")}`);

log("\nUnidades do legado → Sistema FCT");
for (const nome of nomesFilial) {
  const qtd = lancamentos.filter((l) => l.filial === nome).length;
  const b = existente(nome);
  if (b) log(`  ${nome.padEnd(52)} → ${b.codigo.padEnd(6)} ${b.nome}  (${qtd})`);
  else {
    const n = novas.find((x) => x.nomeLegado === nome);
    log(`  ${nome.padEnd(52)} → NOVA ${n.codigo.padEnd(5)} ${n.nome} · ${n.empresa} · ${n.regional}${n.ativo ? "" : " · inativa"}  (${qtd})`);
  }
}

// ---------- resumo do plano ----------
const totalLegado = { receber: 0, pagar: 0 };
for (const l of lancamentos) totalLegado[TIPO[limpar(l.tipo)]] += Number(l.valor);
log(`\nLançamentos: ${lancamentos.length} · receber ${brl(totalLegado.receber)} · pagar ${brl(totalLegado.pagar)}`);
log(`Unidades novas: ${novas.length} · categorias: ${categorias.size}`);

if (!CONFIRMAR) {
  log("\nNada foi gravado. Rode de novo com --confirmar para executar.");
  process.exit(0);
}

// ---------- gravação ----------
log("\nGravando…");
if (novas.length) {
  const linhas = novas.map((n) => ({
    organization_id: orgPorNome(n.empresa).id,
    codigo: n.codigo,
    nome: n.nome,
    cnpj: n.cnpj,
    regional: n.regional,
    ativo: n.ativo,
  }));
  const { data, error } = await supabase.from("branches").insert(linhas).select("id, codigo, cnpj, nome, organization_id, ativo");
  if (error) falhar(`Criar unidades: ${error.message}`);
  branches.push(...data);
  for (const n of novas) mapaFilial.set(n.nomeLegado, data.find((b) => b.codigo === n.codigo).id);
  await supabase.from("audit_logs").insert({ user_id: uid, acao: "importar", entidade: "branches", valor_novo: { origem: "migracao-financeiro", unidades: data.map((b) => b.codigo) } });
  log(`✔ ${data.length} unidades criadas`);
}

const { data: cats, error: eCat } = await supabase
  .from("fin_categorias")
  .upsert([...categorias.values()], { onConflict: "tipo,grupo,nome" })
  .select("id, tipo, grupo, nome");
if (eCat) falhar(`Categorias: ${eCat.message}`);
const idCategoria = new Map(cats.map((c) => [chaveCat(c.tipo, c.grupo, c.nome), c.id]));
log(`✔ ${cats.length} categorias garantidas`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const linhas = lancamentos.map((l) => {
  const k = registrarCategoria(l.tipo, l.grupo, l.categoria);
  const categoria_id = idCategoria.get(k);
  if (!categoria_id) falhar(`Categoria sem id: ${k}`);
  const obs = limpar(l.obs);
  return {
    branch_id: mapaFilial.get(l.filial),
    tipo: TIPO[limpar(l.tipo)],
    categoria_id,
    valor: Math.round(Number(l.valor) * 100) / 100,
    data: l.data,
    competencia: l.data.slice(0, 7),
    descricao: obs || null,
    origem: /omie/i.test(obs) ? "omie" : "migracao",
    lote_id: UUID_RE.test(l.lote_id ?? "") ? l.lote_id : null,
    legado_id: l.id,
  };
});

let inseridos = 0;
for (let i = 0; i < linhas.length; i += LOTE) {
  const lote = linhas.slice(i, i + LOTE);
  const { data, error } = await supabase.from("fin_lancamentos").upsert(lote, { onConflict: "legado_id", ignoreDuplicates: true }).select("legado_id");
  if (error) falhar(`Lançamentos (lote a partir de ${i}): ${error.message}`);
  inseridos += data.length;
  process.stdout.write(`\r  ${Math.min(i + LOTE, linhas.length)}/${linhas.length} enviados · ${inseridos} novos`);
}
log(`\n✔ ${inseridos} lançamentos inseridos (${linhas.length - inseridos} já existiam)`);

// ---------- conferência ----------
const { count } = await supabase.from("fin_lancamentos").select("id", { count: "exact", head: true }).not("legado_id", "is", null);
const { data: totais } = await supabase.rpc("fin_totais", {});
const porTipo = Object.fromEntries((totais ?? []).map((t) => [t.tipo, Number(t.total)]));
log("\nConferência");
log(`  legado:      ${lancamentos.length} lançamentos · receber ${brl(totalLegado.receber)} · pagar ${brl(totalLegado.pagar)}`);
log(`  Sistema FCT: ${count} com legado_id · receber ${brl(porTipo.receber ?? 0)} · pagar ${brl(porTipo.pagar ?? 0)} (todos os lançamentos, inclusive manuais)`);
if (count !== lancamentos.length) log("  (atenção) a contagem difere do legado — reveja antes de seguir.");

await supabase.from("audit_logs").insert({
  user_id: uid,
  acao: "importar",
  entidade: "fin_lancamentos",
  valor_novo: { origem: "migracao", inseridos, ja_existiam: linhas.length - inseridos, categorias: cats.length, unidades_criadas: novas.map((n) => n.codigo) },
});
log("\n✔ Migração concluída. Abra /financeiro no sistema para conferir.");
