"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { convitesPendentes } from "@/lib/data/usuarios";
import { filtrarTelasEscolhiveis, MODULOS_BLOQUEAVEIS, PAPEL_TELAS_ESCOLHIDAS, papeisDeLeitura } from "@/lib/nav";
import { PAPEIS } from "@/lib/roles";
import { randomBytes } from "node:crypto";
import { createClient as createClientPublico } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoUsuario = {
  erro?: string;
  erros?: Record<string, string>;
  ok?: string;
};

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

function errosDoZod(e: z.ZodError) {
  const { fieldErrors } = z.flattenError(e);
  const erros: Record<string, string> = {};
  for (const [campo, mensagens] of Object.entries(fieldErrors)) {
    const primeira = (mensagens as string[] | undefined)?.[0];
    if (primeira) erros[campo] = primeira;
  }
  return erros;
}

async function origem() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Coordenador precisa de uma regional que exista nas lojas; os outros papéis ficam sem regional. */
async function regionalDoPapel(papel: string, bruto: string | undefined): Promise<{ regional: string | null } | { erro: string }> {
  if (papel !== "coordenador") return { regional: null };
  if (!bruto) return { erro: "Escolha a regional que ele coordena." };
  const supabase = await createClient();
  const { count } = await supabase.from("branches").select("id", { count: "exact", head: true }).eq("regional", bruto);
  if (!count) return { erro: "Nenhuma loja nessa regional." };
  return { regional: bruto };
}

/**
 * Diretor de Compras: as telas marcadas viram as linhas de acesso_telas da pessoa (só consulta). Tira as desmarcadas e
 * põe as novas; devolve o que ficou. Em outro papel não mexe (o Fluxo de caixa compartilhado continua como estava).
 */
async function gravarTelas(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, telas: string[], concedidoPor: string) {
  const { data: atuais, error } = await supabase.from("acesso_telas").select("rota").eq("user_id", userId);
  if (error) return { erro: error.message, antes: [] as string[] };
  const antes = (atuais ?? []).map((t) => t.rota).sort();
  const sair = antes.filter((r) => !telas.includes(r));
  const entrar = telas.filter((r) => !antes.includes(r));
  if (sair.length) {
    const { error: e } = await supabase.from("acesso_telas").delete().eq("user_id", userId).in("rota", sair);
    if (e) return { erro: e.message, antes };
  }
  if (entrar.length) {
    const { error: e } = await supabase.from("acesso_telas").insert(entrar.map((rota) => ({ user_id: userId, rota, pode_editar: false, concedido_por: concedidoPor })));
    if (e) return { erro: e.message, antes };
  }
  return { erro: null, antes };
}

async function exigirAdmin() {
  const sessao = await getSessao();
  // administrador com o módulo Administração bloqueado não mexe em usuários
  return sessao.papel === "admin" && !sessao.bloqueios.includes("Administração") ? sessao : null;
}

// ---------- convidar ----------

const esquemaConvite = z.object({
  email: z.email({ error: "E-mail inválido." }).transform((e) => e.toLowerCase()),
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  papel: z.enum(PAPEIS, { error: "Escolha o papel." }),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
});

/** Convida por e-mail (Supabase Auth, chave service_role só no servidor) e define papel/unidade. Só admin. */
export async function convidarUsuario(_prev: EstadoUsuario, fd: FormData): Promise<EstadoUsuario> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores convidam usuários." };

  const r = esquemaConvite.safeParse({
    email: texto(fd, "email"),
    nome: texto(fd, "nome"),
    papel: texto(fd, "papel"),
    branch_id: texto(fd, "branch_id"),
  });
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const reg = await regionalDoPapel(r.data.papel, texto(fd, "regional"));
  if ("erro" in reg) return { erro: "Confira os campos destacados.", erros: { regional: reg.erro } };
  const filiaisConvite = [...new Set(fd.getAll("filiais").filter((v): v is string => typeof v === "string" && ehUuid(v)))];

  const destino = `${await origem()}/auth/confirm?next=/auth/atualizar-senha`;
  const admin = createAdminClient();
  let userId: string;
  let modo: "convite" | "confirmacao";
  if (admin) {
    // Com a service_role no servidor: convite oficial do Supabase (e-mail "você foi convidado").
    const { data, error } = await admin.auth.admin.inviteUserByEmail(r.data.email, { data: { nome: r.data.nome }, redirectTo: destino });
    if (error || !data.user) return { erro: `Não foi possível convidar: ${error?.message ?? "erro desconhecido"}` };
    userId = data.user.id;
    modo = "convite";
  } else {
    // Sem service_role: cria a conta com a chave pública (signUp) e uma senha aleatória que ninguém conhece;
    // a pessoa recebe o e-mail de confirmação do Supabase e define a própria senha no primeiro acesso.
    const publico = createClientPublico(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await publico.auth.signUp({ email: r.data.email, password: randomBytes(32).toString("base64url"), options: { data: { nome: r.data.nome }, emailRedirectTo: destino } });
    if (error) return { erro: `Não foi possível criar a conta: ${error.message}` };
    if (!data.user) return { erro: "O Supabase não devolveu o usuário criado." };
    if (data.user.identities && data.user.identities.length === 0) return { erro: "Já existe uma conta com esse e-mail. Use “Redefinir senha” na lista." };
    userId = data.user.id;
    modo = "confirmacao";
  }

  // O trigger handle_new_user já criou o perfil; aqui definimos papel e unidade.
  const supabase = await createClient();
  const telasConvite = r.data.papel === PAPEL_TELAS_ESCOLHIDAS ? filtrarTelasEscolhiveis(fd.getAll("telas")) : [];
  const { error: erroPerfil } = await supabase
    .from("profiles")
    .update({
      nome: r.data.nome,
      papel: r.data.papel,
      admin_sistema: r.data.papel !== "admin" && fd.get("admin_sistema") === "on",
      branch_id: r.data.branch_id ?? null,
      regional: reg.regional,
      papeis_leitura: r.data.papel === PAPEL_TELAS_ESCOLHIDAS ? papeisDeLeitura(telasConvite) : [],
    })
    .eq("id", userId);
  if (erroPerfil) return { erro: `Conta criada, mas o perfil não pôde ser ajustado: ${erroPerfil.message}` };
  if (telasConvite.length) {
    const t = await gravarTelas(supabase, userId, telasConvite, sessao.id);
    if (t.erro) return { erro: `Conta criada, mas as telas não foram gravadas: ${t.erro}` };
  }
  if (filiaisConvite.length && r.data.papel !== "coordenador") {
    const { error: erroAcesso } = await supabase.from("user_branch_access").insert(filiaisConvite.map((branch_id) => ({ user_id: userId, branch_id })));
    if (erroAcesso) return { erro: `Conta criada, mas as outras filiais não foram gravadas: ${erroAcesso.message}` };
  }

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "convidar",
    entidade: "profiles",
    registroId: userId,
    novo: { email: r.data.email, nome: r.data.nome, papel: r.data.papel, branch_id: r.data.branch_id ?? null, regional: reg.regional, filiais_adicionais: filiaisConvite, telas: telasConvite, modo },
  });
  revalidatePath("/configuracoes/usuarios");
  redirect(`/configuracoes/usuarios?convidado=1&modo=${modo}`);
}

// ---------- editar ----------

const esquemaUsuario = z.object({
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  papel: z.enum(PAPEIS, { error: "Escolha o papel." }),
  branch_id: z.uuid({ error: "Unidade inválida." }).optional(),
});

export async function salvarUsuario(id: string, _prev: EstadoUsuario, fd: FormData): Promise<EstadoUsuario> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores alteram usuários." };
  if (!ehUuid(id)) return { erro: "Usuário inválido." };

  const r = esquemaUsuario.safeParse({ nome: texto(fd, "nome"), papel: texto(fd, "papel"), branch_id: texto(fd, "branch_id") });
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const reg = await regionalDoPapel(r.data.papel, texto(fd, "regional"));
  if ("erro" in reg) return { erro: "Confira os campos destacados.", erros: { regional: reg.erro } };
  const ativo = fd.get("ativo") === "on";
  const filiais = fd.getAll("filiais").filter((v): v is string => typeof v === "string" && ehUuid(v));

  // cargo Administrador já tem tudo; nos outros cargos vale a marcação "Administrador do sistema"
  const admin_sistema = r.data.papel !== "admin" && fd.get("admin_sistema") === "on";
  if (id === sessao.id) {
    if (r.data.papel !== "admin" && !admin_sistema) return { erro: "Para trocar o seu próprio cargo, mantenha marcado “Administrador do sistema” (senão você perde o acesso de administrador)." };
    if (!ativo) return { erro: "Você não pode desativar o seu próprio usuário." };
  }

  const supabase = await createClient();
  const [{ data: atual }, { data: acessosAtuais }] = await Promise.all([
    supabase.from("profiles").select("id, nome, papel, admin_sistema, branch_id, ativo, employee_id, regional, modulos_bloqueados, papeis_leitura").eq("id", id).maybeSingle(),
    supabase.from("user_branch_access").select("branch_id").eq("user_id", id),
  ]);
  if (!atual) return { erro: "Usuário não encontrado." };

  const empTexto = texto(fd, "employee_id") ?? "";
  const employee_id = fd.has("employee_id") ? (ehUuid(empTexto) ? empTexto : null) : atual.employee_id;
  if (employee_id && employee_id !== atual.employee_id) {
    const { data: outro } = await supabase.from("profiles").select("nome").eq("employee_id", employee_id).neq("id", id).maybeSingle();
    if (outro) return { erro: `Esse funcionário já está ligado ao usuário ${outro.nome || "(sem nome)"}.` };
  }
  // módulos tirados da pessoa (o próprio usuário não mexe nos dele: o campo nem aparece)
  const modulos_bloqueados = id === sessao.id ? atual.modulos_bloqueados : [...new Set(fd.getAll("modulos_bloqueados").filter((v): v is string => typeof v === "string" && MODULOS_BLOQUEAVEIS.includes(v)))];
  // Diretor de Compras: o que ele vê são as telas marcadas; os dados que pode LER saem delas (papeis_leitura)
  const ehDiretor = r.data.papel === PAPEL_TELAS_ESCOLHIDAS;
  const telas = ehDiretor ? filtrarTelasEscolhiveis(fd.getAll("telas")) : [];
  const papeis_leitura = ehDiretor ? papeisDeLeitura(telas) : [];
  const patch = { nome: r.data.nome, papel: r.data.papel, admin_sistema, branch_id: r.data.branch_id ?? null, ativo, employee_id, regional: reg.regional, modulos_bloqueados, papeis_leitura };
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { erro: `Não foi possível salvar: ${error.message}` };

  // telas: no diretor, grava as marcadas; deixando de ser diretor, as telas dele saem junto
  let telasAntes: string[] = [];
  if (ehDiretor || atual.papel === PAPEL_TELAS_ESCOLHIDAS) {
    const t = await gravarTelas(supabase, id, telas, sessao.id);
    if (t.erro) return { erro: `Perfil salvo, mas as telas falharam: ${t.erro}` };
    telasAntes = t.antes;
  }

  const antes = (acessosAtuais ?? []).map((a) => a.branch_id).sort();
  // coordenador enxerga pela regional: lojas avulsas não se aplicam
  const depois = r.data.papel === "coordenador" ? [] : [...new Set(filiais)].sort();
  if (antes.join(",") !== depois.join(",")) {
    await supabase.from("user_branch_access").delete().eq("user_id", id);
    if (depois.length > 0) {
      const { error: erroAcesso } = await supabase.from("user_branch_access").insert(depois.map((branch_id) => ({ user_id: id, branch_id })));
      if (erroAcesso) return { erro: `Perfil salvo, mas as unidades adicionais falharam: ${erroAcesso.message}` };
    }
  }

  // comitê do canal de denúncias
  const querComite = fd.get("responde_denuncias") === "on";
  const { data: noComite } = await supabase.from("denuncia_responsaveis").select("user_id").eq("user_id", id).maybeSingle();
  if (querComite !== !!noComite) {
    const { error: erroComite } = querComite
      ? await supabase.from("denuncia_responsaveis").insert({ user_id: id, liberado_por: sessao.id })
      : await supabase.from("denuncia_responsaveis").delete().eq("user_id", id);
    if (erroComite) return { erro: `Perfil salvo, mas o acesso ao canal de denúncias falhou: ${erroComite.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: querComite ? "criar" : "excluir", entidade: "denuncia_responsaveis", registroId: id, novo: { comite: querComite } });
  }

  const dif = diferencas({ ...atual, filiais_adicionais: antes, telas: telasAntes }, { ...patch, filiais_adicionais: depois, telas: ehDiretor || telasAntes.length ? telas : telasAntes });
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: !atual.ativo && ativo ? "reativar" : atual.ativo && !ativo ? "inativar" : "editar",
    entidade: "profiles",
    registroId: id,
    anterior: dif.anterior,
    novo: dif.novo,
  });
  revalidatePath("/configuracoes/usuarios");
  redirect("/configuracoes/usuarios?salvo=1");
}

// ---------- convites dos logins criados sem e-mail ----------

export type EstadoConvites = { erro?: string; ok?: string; falhas?: string[] };

/** Para no meio se o tempo da função for acabar (Vercel corta em 300 s) — o resto fica pendente para o próximo clique. */
const PRAZO_CONVITES_MS = 240_000;

/**
 * Manda o e-mail "Boas-vindas ao Sistema FCT" (modelo de convite do Supabase) para quem tem login criado e ainda não
 * recebeu: todos, uma filial ou uma pessoa, até a quantidade escolhida. O Supabase limita e-mails por hora: no limite,
 * para e avisa (o resto continua pendente). Grava convite_enviado_em de quem recebeu.
 */
export async function enviarConvites(_prev: EstadoConvites, fd: FormData): Promise<EstadoConvites> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores enviam convites." };
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor para mandar convites." };

  const filial = texto(fd, "filial");
  const id = texto(fd, "id");
  const quantidade = Number.parseInt(texto(fd, "quantidade") ?? "", 10);
  const pendentes = await convitesPendentes();
  const alvo = pendentes
    .filter((p) => (id ? p.id === id : !filial || filial === "todos" || (filial === "sem" ? !p.branchId : p.branchId === filial)))
    .slice(0, Number.isFinite(quantidade) && quantidade > 0 ? quantidade : undefined);
  if (!alvo.length) return { erro: "Ninguém pendente nessa escolha." };

  const destino = `${await origem()}/auth/confirm?next=/auth/atualizar-senha`;
  const inicio = Date.now();
  const enviados: string[] = [];
  const falhas: string[] = [];
  let parou: "limite" | "tempo" | null = null;
  for (const p of alvo) {
    if (Date.now() - inicio > PRAZO_CONVITES_MS) {
      parou = "tempo";
      break;
    }
    const { error } = await admin.auth.admin.inviteUserByEmail(p.email, { redirectTo: destino });
    if (error) {
      if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
        parou = "limite";
        break;
      }
      falhas.push(`${p.nome} (${p.email}): ${error.message}`);
      continue;
    }
    enviados.push(p.id);
  }

  const supabase = await createClient();
  const agora = new Date().toISOString();
  for (let i = 0; i < enviados.length; i += 100) await supabase.from("profiles").update({ convite_enviado_em: agora }).in("id", enviados.slice(i, i + 100));
  if (enviados.length || falhas.length)
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "convidar",
      entidade: "profiles",
      registroId: id ?? null,
      novo: { convites_enviados: enviados.length, falhas: falhas.length, filial: filial ?? null, parou },
    });
  revalidatePath("/configuracoes/usuarios");

  const faltam = pendentes.length - enviados.length;
  const motivo =
    parou === "limite"
      ? " Parei no limite de e-mails por hora do Supabase: espere um pouco e clique de novo (ou aumente o limite em Supabase → Authentication → Rate Limits)."
      : parou === "tempo"
        ? " Parei para não estourar o tempo da página: clique de novo para continuar."
        : "";
  const resumo = enviados.length === 1 ? "1 convite enviado." : `${enviados.length} convites enviados.`;
  return {
    ok: enviados.length ? `${resumo} Ainda sem convite: ${faltam}.${motivo}` : undefined,
    erro: enviados.length ? undefined : `Nenhum convite saiu.${motivo}`,
    falhas: falhas.length ? falhas : undefined,
  };
}

// ---------- redefinição de senha ----------

export async function enviarRedefinicaoSenha(fd: FormData) {
  const sessao = await exigirAdmin();
  if (!sessao) return;
  const email = texto(fd, "email");
  if (!email) return;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origem()}/auth/confirm?next=/auth/atualizar-senha`,
  });
  redirect("/configuracoes/usuarios?reset=1");
}

// ---------- excluir ----------

export type EstadoExclusao = { erro?: string };

/**
 * Exclui o usuário de vez (login e perfil). Lojas extras, gestor de loja, comitê de denúncias e pedidos de acesso
 * dele saem junto; o histórico (chamados, auditoria, lançamentos, justificativas) fica, sem o vínculo com a pessoa.
 * Não exclui a si mesmo nem o último administrador. Nome, e-mail e cargo ficam gravados na auditoria antes.
 */
export async function excluirUsuario(id: string, _prev: EstadoExclusao, fd: FormData): Promise<EstadoExclusao> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só administradores excluem usuários." };
  if (!ehUuid(id)) return { erro: "Usuário inválido." };
  if (id === sessao.id) return { erro: "Você não pode excluir o seu próprio usuário." };
  const supabase = await createClient();
  const { data: alvo } = await supabase.from("profiles").select("id, nome, email, papel, admin_sistema, ativo").eq("id", id).maybeSingle();
  if (!alvo) return { erro: "Usuário não encontrado." };
  // confirmação digitando o e-mail (ou o nome, se não tiver e-mail): exclusão não tem volta
  const confirmacao = (texto(fd, "confirmacao") ?? "").toLowerCase();
  if (confirmacao !== (alvo.email || alvo.nome).trim().toLowerCase()) return { erro: "Digite o e-mail do usuário exatamente como aparece para confirmar." };
  if (alvo.papel === "admin" || alvo.admin_sistema) {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("ativo", true).or("papel.eq.admin,admin_sistema.eq.true").neq("id", id);
    if (!count) return { erro: "Este é o último administrador ativo: cadastre outro antes de excluir." };
  }
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor para excluir o login." };

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "excluir",
    entidade: "profiles",
    registroId: id,
    anterior: { nome: alvo.nome, email: alvo.email, papel: alvo.papel, admin_sistema: alvo.admin_sistema, ativo: alvo.ativo },
  });
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return { erro: `Não consegui excluir: ${error.message}` };
  revalidatePath("/configuracoes/usuarios");
  redirect("/configuracoes/usuarios?excluido=1");
}
