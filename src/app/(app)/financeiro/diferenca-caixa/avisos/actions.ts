"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { CHAVE_CONFIG, enviarAvisos, enviarTeste } from "@/lib/caixa/avisos";
import { pluralizar } from "@/lib/formatos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoAvisos = { erro?: string; ok?: string };

const ROTA = "/financeiro/diferenca-caixa/avisos";
const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function exigirFinanceiro() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "financeiro" ? sessao : null;
}

/** Manda para quem clicou o e-mail que o primeiro gestor da lista receberia (não conta como aviso do dia). */
export async function enviarTesteAvisos(): Promise<EstadoAvisos> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o administrador e o financeiro mexem nos avisos." };
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor." };
  try {
    const r = await enviarTeste(admin, { profileId: sessao.id, nome: sessao.nome, email: sessao.email });
    revalidatePath(ROTA);
    const fonte = [r.usouGestor ? `a parte de gestor com as quebras de ${r.usouGestor}` : null, r.usouColaborador ? `a parte de colaborador com as de ${r.usouColaborador}` : null].filter(Boolean);
    return { ok: `Teste enviado para ${sessao.email}, com as duas partes do e-mail (gestor e colaborador)${fonte.length ? `: ${fonte.join("; ")}` : ", usando quebras de exemplo"}. Confira a caixa de entrada (e o spam, na primeira vez).` };
  } catch (e) {
    revalidatePath(ROTA);
    return { erro: `Não consegui enviar o teste: ${mensagem(e)}` };
  }
}

/** Envia agora para todos com quebra em aberto, gestores e colaboradores (quem já recebeu hoje não recebe de novo). */
export async function enviarAvisosAgora(): Promise<EstadoAvisos> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o administrador e o financeiro mexem nos avisos." };
  const admin = createAdminClient();
  if (!admin) return { erro: "Falta a variável SUPABASE_SERVICE_ROLE_KEY no servidor." };
  try {
    const r = await enviarAvisos(admin, "manual");
    const supabase = await createClient();
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "caixa_avisos", novo: { envio_manual: { enviados: r.enviados, ja_avisados: r.jaAvisados, falhas: r.falhas.length } } });
    revalidatePath(ROTA);
    const partes = [
      r.enviados ? `${pluralizar(r.enviados, "aviso enviado", "avisos enviados")}` : "nenhum aviso novo",
      r.jaAvisados ? `${pluralizar(r.jaAvisados, "pessoa já tinha recebido hoje", "pessoas já tinham recebido hoje")}` : null,
    ].filter(Boolean);
    if (r.falhas.length) return { erro: `${partes.join(" · ")}. Falhou para: ${r.falhas.map((f) => `${f.nome} (${f.erro})`).join("; ")}` };
    if (!r.destinatarios) return { ok: "Ninguém para avisar agora: nenhuma quebra pendente com gestor, gerente ou colaborador com e-mail." };
    return { ok: `Pronto: ${partes.join(" · ")}.` };
  } catch (e) {
    return { erro: mensagem(e) };
  }
}

/** Liga ou desliga o envio automático da manhã. */
export async function alternarAvisos(_prev: EstadoAvisos, fd: FormData): Promise<EstadoAvisos> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o administrador e o financeiro mexem nos avisos." };
  const ligado = fd.get("ligar") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("sistema_config").upsert({ chave: CHAVE_CONFIG, valor: { ligado }, atualizado_por: sessao.id, atualizado_em: new Date().toISOString() });
  if (error) return { erro: `Não consegui gravar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "sistema_config", novo: { chave: CHAVE_CONFIG, ligado } });
  revalidatePath(ROTA);
  return { ok: ligado ? "Envio automático ligado." : "Envio automático desligado: ninguém recebe o aviso da manhã até você ligar de novo." };
}
