// Aviso diário por e-mail das quebras de caixa esperando justificativa (SÓ SERVIDOR).
// Quem recebe segue a mesma regra de quem pode justificar (private.pode_justificar_quebra): o gestor definido na
// quebra ou, sem gestor, os gerentes ativos da loja (loja principal ou "outras filiais que ele gerencia").
// Usa o cliente service_role porque roda também sem usuário logado (rotina da manhã); quem chama pela tela
// confere o papel antes. A senha do e-mail fica no Vault (Administração → Integrações) e nunca vai para a tela.
import nodemailer from "nodemailer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assuntoAviso, htmlAviso, textoAviso, type Destinatario, type QuebraAviso } from "@/lib/caixa/avisos-email";
import { SEGREDOS } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://portal.farmaciafct.com.br").replace(/\/$/, "");
export const SMTP_PADRAO = { host: "mail.farmaciafct.com.br", porta: 465, usuario: "nao-responda@farmaciafct.com.br" };
export const CHAVE_CONFIG = "caixa_avisos";

/** Dia de hoje no horário de Brasília (aaaa-mm-dd). */
export const hojeBrasil = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

const diasEntre = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000));
const r2 = (v: number) => Math.round(v * 100) / 100;

// ---------- configuração ----------

export type ConfigSmtp = { host: string; porta: number; usuario: string; senha: string; configurado: boolean };

export async function configSmtp(admin: Admin): Promise<ConfigSmtp> {
  const nomes = [SEGREDOS.smtp_host, SEGREDOS.smtp_porta, SEGREDOS.smtp_usuario, SEGREDOS.smtp_senha];
  const { data, error } = await admin.rpc("integracao_ler_segredos_servico", { p_nomes: nomes });
  if (error) throw new Error(`Não consegui ler a configuração do e-mail: ${error.message}`);
  const s = new Map((data ?? []).map((r) => [r.nome, r.valor]));
  const porta = Number(s.get(SEGREDOS.smtp_porta)) || SMTP_PADRAO.porta;
  const senha = s.get(SEGREDOS.smtp_senha) ?? "";
  return { host: s.get(SEGREDOS.smtp_host) || SMTP_PADRAO.host, porta, usuario: s.get(SEGREDOS.smtp_usuario) || SMTP_PADRAO.usuario, senha, configurado: !!senha };
}

function transporte(c: ConfigSmtp) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.porta,
    secure: c.porta === 465,
    auth: { user: c.usuario, pass: c.senha },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Confere se o servidor de e-mail aceita o usuário e a senha (sem mandar nada). */
export async function testarSmtp(c: ConfigSmtp) {
  await transporte(c).verify();
}

/** Liga/desliga do envio automático (padrão: ligado). */
export async function avisosLigados(cliente: Admin) {
  const { data } = await cliente.from("sistema_config").select("valor").eq("chave", CHAVE_CONFIG).maybeSingle();
  const v = data?.valor as { ligado?: boolean } | null | undefined;
  return v?.ligado !== false;
}

// ---------- quem recebe ----------

export type LojaSemResponsavel = { branchId: string; loja: string; nome: string; quantidade: number; valor: number };
export type PreviaAvisos = { destinatarios: Destinatario[]; semResponsavel: LojaSemResponsavel[]; totalQuebras: number; hoje: string };

type LinhaQuebra = {
  id: string;
  branch_id: string;
  dia: string;
  numero_caixa: number | null;
  nome_operador: string | null;
  diferenca: number;
  valor_quebra: number | null;
  origem: string | null;
  gestor_id: string | null;
  filial: { codigo: string; nome: string } | null;
};

async function quebrasPendentes(admin: Admin) {
  const out: LinhaQuebra[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await admin
      .from("caixa_diferencas")
      .select("id, branch_id, dia, numero_caixa, nome_operador, diferenca, valor_quebra, origem, gestor_id, filial:branches!caixa_diferencas_branch_id_fkey(codigo, nome)")
      .eq("classe", "quebra")
      .eq("andamento", "pendente")
      .order("dia")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as LinhaQuebra[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** Monta, para hoje, quem recebe o aviso e com quais quebras; e as lojas com quebra sem ninguém para avisar. */
export async function montarAvisos(admin: Admin): Promise<PreviaAvisos> {
  const hoje = hojeBrasil();
  const [quebras, { data: perfis, error: e1 }, { data: acessos, error: e2 }] = await Promise.all([
    quebrasPendentes(admin),
    admin.from("profiles").select("id, nome, email, papel, branch_id, ativo").eq("ativo", true),
    admin.from("user_branch_access").select("user_id, branch_id"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);

  const ativos = new Map((perfis ?? []).filter((p) => p.email).map((p) => [p.id, p]));
  const gerentesDaLoja = new Map<string, Set<string>>();
  const ligar = (loja: string | null, perfil: string) => {
    if (!loja) return;
    const s = gerentesDaLoja.get(loja) ?? new Set<string>();
    s.add(perfil);
    gerentesDaLoja.set(loja, s);
  };
  for (const p of ativos.values()) if (p.papel === "gerente") ligar(p.branch_id, p.id);
  for (const a of acessos ?? []) if (ativos.get(a.user_id)?.papel === "gerente") ligar(a.branch_id, a.user_id);

  const porPessoa = new Map<string, Destinatario>();
  const sem = new Map<string, LojaSemResponsavel>();
  for (const q of quebras) {
    const valor = r2(Number(q.valor_quebra ?? Math.abs(Number(q.diferenca))));
    const aviso: QuebraAviso = {
      id: q.id,
      loja: q.filial?.codigo ?? "—",
      lojaNome: q.filial?.nome ?? "",
      dia: q.dia,
      caixa: q.numero_caixa,
      operador: q.nome_operador?.trim() || "—",
      diferenca: Number(q.diferenca),
      valor,
      manual: q.origem === "manual",
      diasAberta: diasEntre(q.dia, hoje),
    };
    // gestor definido (e ativo) ou, sem gestor, os gerentes da loja — igual a quem pode justificar
    const responsaveis = q.gestor_id ? (ativos.has(q.gestor_id) ? [q.gestor_id] : []) : [...(gerentesDaLoja.get(q.branch_id) ?? [])];
    if (!responsaveis.length) {
      const s = sem.get(q.branch_id) ?? { branchId: q.branch_id, loja: aviso.loja, nome: aviso.lojaNome, quantidade: 0, valor: 0 };
      s.quantidade += 1;
      s.valor = r2(s.valor + valor);
      sem.set(q.branch_id, s);
      continue;
    }
    for (const id of responsaveis) {
      const p = ativos.get(id)!;
      const d = porPessoa.get(id) ?? { profileId: id, nome: p.nome?.trim() || p.email!, email: p.email!, quebras: [], total: 0 };
      d.quebras.push(aviso);
      d.total = r2(d.total + valor);
      porPessoa.set(id, d);
    }
  }
  return {
    hoje,
    totalQuebras: quebras.length,
    destinatarios: [...porPessoa.values()].sort((a, b) => b.total - a.total),
    semResponsavel: [...sem.values()].sort((a, b) => b.valor - a.valor),
  };
}

// ---------- envio ----------

export type ResultadoEnvio = { enviados: number; jaAvisados: number; falhas: { nome: string; erro: string }[]; semResponsavel: number; destinatarios: number };

const remetente = (c: ConfigSmtp) => ({ name: "Sistema FCT", address: c.usuario });
const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

/** Manda o aviso a cada gestor com quebra pendente. Quem já recebeu hoje (automático ou manual) não recebe de novo. */
export async function enviarAvisos(admin: Admin, origem: "automatico" | "manual"): Promise<ResultadoEnvio> {
  const smtp = await configSmtp(admin);
  if (!smtp.configurado) throw new Error("Falta cadastrar a senha do e-mail de envio em Administração → Integrações.");
  const previa = await montarAvisos(admin);
  const { data: jaHoje, error } = await admin.from("caixa_avisos").select("profile_id").eq("dia", previa.hoje).is("erro", null).in("origem", ["automatico", "manual"]);
  if (error) throw new Error(error.message);
  const avisados = new Set((jaHoje ?? []).map((r) => r.profile_id));

  const correio = transporte(smtp);
  const resultado: ResultadoEnvio = { enviados: 0, jaAvisados: 0, falhas: [], semResponsavel: previa.semResponsavel.length, destinatarios: previa.destinatarios.length };
  for (const d of previa.destinatarios) {
    if (avisados.has(d.profileId)) {
      resultado.jaAvisados += 1;
      continue;
    }
    let erro: string | null = null;
    try {
      await correio.sendMail({ from: remetente(smtp), to: { name: d.nome, address: d.email }, subject: assuntoAviso(d), text: textoAviso(d, SITE), html: htmlAviso(d, SITE) });
      resultado.enviados += 1;
    } catch (e) {
      erro = motivo(e);
      resultado.falhas.push({ nome: d.nome, erro });
    }
    await admin.from("caixa_avisos").insert({ dia: previa.hoje, profile_id: d.profileId, nome: d.nome, email: d.email, quantidade: d.quebras.length, valor: d.total, origem, erro });
  }
  correio.close();
  return resultado;
}

/**
 * Teste: manda para quem pediu o e-mail que o primeiro gestor da lista receberia (ou um exemplo, se ninguém tem
 * quebra pendente). Não conta como aviso do dia.
 */
export async function enviarTeste(admin: Admin, para: { profileId: string; nome: string; email: string }) {
  const smtp = await configSmtp(admin);
  if (!smtp.configurado) throw new Error("Falta cadastrar a senha do e-mail de envio em Administração → Integrações.");
  const previa = await montarAvisos(admin);
  const base = previa.destinatarios[0];
  const exemplo: Destinatario = base
    ? { ...base, nome: para.nome, email: para.email }
    : {
        profileId: para.profileId,
        nome: para.nome,
        email: para.email,
        total: 68.1,
        quebras: [{ id: "exemplo", loja: "F002", lojaNome: "Exemplo", dia: previa.hoje, caixa: 4667, operador: "OPERADOR DE EXEMPLO", diferenca: 68.1, valor: 68.1, manual: false, diasAberta: 0 }],
      };
  const correio = transporte(smtp);
  let erro: string | null = null;
  try {
    await correio.sendMail({
      from: remetente(smtp),
      to: { name: para.nome, address: para.email },
      subject: `[Teste] ${assuntoAviso(exemplo)}`,
      text: textoAviso(exemplo, SITE),
      html: htmlAviso(exemplo, SITE),
    });
  } catch (e) {
    erro = motivo(e);
  } finally {
    correio.close();
  }
  await admin.from("caixa_avisos").insert({ dia: previa.hoje, profile_id: para.profileId, nome: para.nome, email: para.email, quantidade: exemplo.quebras.length, valor: exemplo.total, origem: "teste", erro });
  if (erro) throw new Error(erro);
  return { usouGestor: base?.nome ?? null };
}
