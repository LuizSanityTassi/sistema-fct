// Aviso diário por e-mail das quebras de caixa em aberto (SÓ SERVIDOR). Dois públicos, uma mensagem por e-mail:
//   - quem justifica (mesma regra de private.pode_justificar_quebra): o gestor definido na quebra ou, sem gestor, os
//     gerentes ativos da loja (loja principal ou "outras filiais que ele gerencia");
//   - o colaborador da quebra (caixa_diferencas.employee_id), para explicar ao gestor: e-mail do usuário dele no
//     sistema (profiles.employee_id), só depois de o admin mandar o convite de acesso (ou de ele já ter entrado).
// Usa o cliente service_role porque roda também sem usuário logado (rotina da manhã); quem chama pela tela
// confere o papel antes. A senha do e-mail fica no Vault (Administração → Integrações) e nunca vai para a tela.
import type { SupabaseClient } from "@supabase/supabase-js";
import { INICIO_OPERACAO } from "@/lib/operacao";
import { assuntoAviso, htmlAviso, textoAviso, type Destinatario, type QuebraAviso } from "@/lib/caixa/avisos-email";
import { configSmtp, remetente, SITE, transporteSmtp } from "@/lib/email";
import type { Database } from "@/lib/supabase/types";

type Admin = SupabaseClient<Database>;

export const CHAVE_CONFIG = "caixa_avisos";

/** Dia de hoje no horário de Brasília (aaaa-mm-dd). */
export const hojeBrasil = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);

const diasEntre = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000));
const r2 = (v: number) => Math.round(v * 100) / 100;
const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailOk = (e: string | null | undefined) => (e && EMAIL_VALIDO.test(e.trim()) ? e.trim() : null);
const primeiro = (nome: string) => nome.trim().split(/\s+/)[0];

// ---------- configuração ----------

/** Liga/desliga do envio automático (padrão: ligado). */
export async function avisosLigados(cliente: Admin) {
  const { data } = await cliente.from("sistema_config").select("valor").eq("chave", CHAVE_CONFIG).maybeSingle();
  const v = data?.valor as { ligado?: boolean } | null | undefined;
  return v?.ligado !== false;
}

// ---------- quem recebe ----------

export type LojaSemResponsavel = { branchId: string; loja: string; nome: string; quantidade: number; valor: number };
export type PreviaAvisos = {
  hoje: string;
  totalQuebras: number;
  destinatarios: Destinatario[];
  /** lojas com quebra pendente sem ninguém para justificar */
  semResponsavel: LojaSemResponsavel[];
  /** colaboradores com quebra pendente sem e-mail (nem usuário no sistema, nem na ficha do RH) */
  colaboradoresSemEmail: number;
  /** colaboradores com quebra pendente e e-mail, mas sem login com convite enviado (não recebem o aviso) */
  colaboradoresSemConvite: number;
};

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
  employee_id: string | null;
  filial: { codigo: string; nome: string } | null;
};

async function quebrasPendentes(admin: Admin) {
  const out: LinhaQuebra[] = [];
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await admin
      .from("caixa_diferencas")
      .select("id, branch_id, dia, numero_caixa, nome_operador, diferenca, valor_quebra, origem, gestor_id, employee_id, filial:branches!caixa_diferencas_branch_id_fkey(codigo, nome)")
      .eq("classe", "quebra")
      .eq("andamento", "pendente")
      .gte("dia", INICIO_OPERACAO)
      .order("dia")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as unknown as LinhaQuebra[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

async function funcionarios(admin: Admin, ids: string[]) {
  const out: { id: string; nome: string; email: string | null; status: string }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from("employees").select("id, nome, email, status").in("id", ids.slice(i, i + 200));
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

/** Monta, para hoje, quem recebe o aviso e com quais quebras (gestor e/ou colaborador); e o que ficou sem ninguém. */
export async function montarAvisos(admin: Admin): Promise<PreviaAvisos> {
  const hoje = hojeBrasil();
  const [quebras, { data: perfis, error: e1 }, { data: acessos, error: e2 }] = await Promise.all([
    quebrasPendentes(admin),
    admin.from("profiles").select("id, nome, email, papel, branch_id, ativo, employee_id, convite_enviado_em, ultimo_acesso").eq("ativo", true),
    admin.from("user_branch_access").select("user_id, branch_id"),
  ]);
  if (e1 || e2) throw new Error((e1 ?? e2)!.message);
  const idsFuncionarios = [...new Set(quebras.map((q) => q.employee_id).filter((x): x is string => !!x))];
  const fichas = new Map((await funcionarios(admin, idsFuncionarios)).map((f) => [f.id, f]));

  const ativos = new Map((perfis ?? []).filter((p) => emailOk(p.email)).map((p) => [p.id, p]));
  const usuarioDoFuncionario = new Map<string, NonNullable<typeof perfis>[number]>();
  for (const p of ativos.values()) if (p.employee_id) usuarioDoFuncionario.set(p.employee_id, p);
  const gerentesDaLoja = new Map<string, Set<string>>();
  const ligar = (loja: string | null, perfil: string) => {
    if (!loja) return;
    const s = gerentesDaLoja.get(loja) ?? new Set<string>();
    s.add(perfil);
    gerentesDaLoja.set(loja, s);
  };
  for (const p of ativos.values()) if (p.papel === "gerente") ligar(p.branch_id, p.id);
  for (const a of acessos ?? []) if (ativos.get(a.user_id)?.papel === "gerente") ligar(a.branch_id, a.user_id);

  // uma mensagem por e-mail (a mesma pessoa pode ser gestor de umas quebras e colaborador de outras)
  const porEmail = new Map<string, Destinatario>();
  const destino = (email: string, nome: string, profileId: string | null) => {
    const chave = email.toLowerCase();
    let d = porEmail.get(chave);
    if (!d) {
      d = { chave, profileId, nome, email, temAcesso: !!profileId, quebras: [], total: 0, minhas: [], totalMinhas: 0 };
      porEmail.set(chave, d);
    } else if (profileId && !d.profileId) {
      d.profileId = profileId;
      d.temAcesso = true;
    }
    return d;
  };

  const sem = new Map<string, LojaSemResponsavel>();
  const semEmail = new Set<string>();
  const semConvite = new Set<string>();
  for (const q of quebras) {
    const valor = r2(Number(q.valor_quebra ?? Math.abs(Number(q.diferenca))));
    const base: QuebraAviso = {
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

    // quem justifica: gestor definido (e ativo) ou, sem gestor, os gerentes da loja
    const responsaveis = q.gestor_id ? (ativos.has(q.gestor_id) ? [q.gestor_id] : []) : [...(gerentesDaLoja.get(q.branch_id) ?? [])];
    if (!responsaveis.length) {
      const s = sem.get(q.branch_id) ?? { branchId: q.branch_id, loja: base.loja, nome: base.lojaNome, quantidade: 0, valor: 0 };
      s.quantidade += 1;
      s.valor = r2(s.valor + valor);
      sem.set(q.branch_id, s);
    }
    for (const id of responsaveis) {
      const p = ativos.get(id)!;
      const d = destino(emailOk(p.email)!, p.nome?.trim() || p.email!, p.id);
      d.quebras.push(base);
      d.total = r2(d.total + valor);
    }

    // o colaborador da quebra: só pelo usuário dele no sistema, depois do convite (o admin escolhe quando mandar, em
    // Usuários). Sem login ou sem convite ainda não recebe — o e-mail da ficha pode estar digitado errado.
    if (!q.employee_id) continue;
    const ficha = fichas.get(q.employee_id);
    if (!ficha || ficha.status === "desligado") continue;
    const usuario = usuarioDoFuncionario.get(q.employee_id);
    if (!usuario) {
      (emailOk(ficha.email) ? semConvite : semEmail).add(q.employee_id);
      continue;
    }
    if (!usuario.convite_enviado_em && !usuario.ultimo_acesso) {
      semConvite.add(q.employee_id);
      continue;
    }
    const email = emailOk(usuario.email);
    if (!email) {
      semEmail.add(q.employee_id);
      continue;
    }
    const nomesResp = responsaveis.map((id) => primeiro(ativos.get(id)!.nome || "")).filter(Boolean);
    const d = destino(email, usuario?.nome?.trim() || ficha.nome, usuario?.id ?? null);
    // se o próprio colaborador é quem justifica (gerente que opera caixa), a quebra já está na parte de gestor
    if (d.quebras.some((x) => x.id === q.id)) continue;
    d.minhas.push({ ...base, quemJustifica: nomesResp.length ? nomesResp.join(" ou ") : null });
    d.totalMinhas = r2(d.totalMinhas + valor);
  }

  return {
    hoje,
    totalQuebras: quebras.length,
    destinatarios: [...porEmail.values()].sort((a, b) => b.total + b.totalMinhas - (a.total + a.totalMinhas)),
    semResponsavel: [...sem.values()].sort((a, b) => b.valor - a.valor),
    colaboradoresSemEmail: semEmail.size,
    colaboradoresSemConvite: semConvite.size,
  };
}

// ---------- envio ----------

export type ResultadoEnvio = { enviados: number; jaAvisados: number; falhas: { nome: string; erro: string }[]; semResponsavel: number; destinatarios: number };

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
const quantidade = (d: Destinatario) => d.quebras.length + d.minhas.length;
const valorTotal = (d: Destinatario) => r2(d.total + d.totalMinhas);

/** Manda o aviso para cada e-mail com quebra em aberto. Quem já recebeu hoje (automático ou manual) não recebe de novo. */
export async function enviarAvisos(admin: Admin, origem: "automatico" | "manual", soPerfil?: string): Promise<ResultadoEnvio> {
  const smtp = await configSmtp(admin);
  if (!smtp.configurado) throw new Error("Falta cadastrar a senha do e-mail de envio em Administração → Integrações.");
  const previa = await montarAvisos(admin);
  // envio pontual para uma pessoa só (ex.: o responsável novo do televendas)
  if (soPerfil) previa.destinatarios = previa.destinatarios.filter((d) => d.profileId === soPerfil);
  const { data: jaHoje, error } = await admin.from("caixa_avisos").select("email").eq("dia", previa.hoje).is("erro", null).in("origem", ["automatico", "manual"]);
  if (error) throw new Error(error.message);
  const avisados = new Set((jaHoje ?? []).map((r) => r.email.toLowerCase()));

  const correio = transporteSmtp(smtp);
  const resultado: ResultadoEnvio = { enviados: 0, jaAvisados: 0, falhas: [], semResponsavel: previa.semResponsavel.length, destinatarios: previa.destinatarios.length };
  for (const d of previa.destinatarios) {
    if (avisados.has(d.chave)) {
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
    await admin.from("caixa_avisos").insert({ dia: previa.hoje, profile_id: d.profileId, nome: d.nome, email: d.email, quantidade: quantidade(d), valor: valorTotal(d), origem, erro });
  }
  correio.close();
  return resultado;
}

/**
 * Teste: manda para quem pediu um e-mail com as duas partes (para justificar e "suas quebras"), usando as quebras
 * de verdade do primeiro da lista quando houver, ou um exemplo. Não conta como aviso do dia.
 */
export async function enviarTeste(admin: Admin, para: { profileId: string; nome: string; email: string }) {
  const smtp = await configSmtp(admin);
  if (!smtp.configurado) throw new Error("Falta cadastrar a senha do e-mail de envio em Administração → Integrações.");
  const previa = await montarAvisos(admin);
  const gestor = previa.destinatarios.find((d) => d.quebras.length);
  const colaborador = previa.destinatarios.find((d) => d.minhas.length);
  const exemplo: QuebraAviso = { id: "exemplo", loja: "F002", lojaNome: "Exemplo", dia: previa.hoje, caixa: 4667, operador: "OPERADOR DE EXEMPLO", diferenca: 68.1, valor: 68.1, manual: false, diasAberta: 0 };
  const quebras = gestor?.quebras ?? [exemplo];
  const minhas = colaborador?.minhas ?? [{ ...exemplo, id: "exemplo-2", quemJustifica: primeiro(para.nome) }];
  const d: Destinatario = {
    chave: para.email.toLowerCase(),
    profileId: para.profileId,
    nome: para.nome,
    email: para.email,
    temAcesso: true,
    quebras,
    total: r2(quebras.reduce((s, q) => s + q.valor, 0)),
    minhas,
    totalMinhas: r2(minhas.reduce((s, q) => s + q.valor, 0)),
  };
  const correio = transporteSmtp(smtp);
  let erro: string | null = null;
  try {
    await correio.sendMail({ from: remetente(smtp), to: { name: para.nome, address: para.email }, subject: `[Teste] ${assuntoAviso(d)}`, text: textoAviso(d, SITE), html: htmlAviso(d, SITE) });
  } catch (e) {
    erro = motivo(e);
  } finally {
    correio.close();
  }
  await admin.from("caixa_avisos").insert({ dia: previa.hoje, profile_id: para.profileId, nome: para.nome, email: para.email, quantidade: quantidade(d), valor: valorTotal(d), origem: "teste", erro });
  if (erro) throw new Error(erro);
  return { usouGestor: gestor?.nome ?? null, usouColaborador: colaborador?.nome ?? null };
}
