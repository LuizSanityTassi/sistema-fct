"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehEmpresaOmie, EMPRESAS_OMIE, OmieErro } from "@/lib/conciliacao/omie-api";
import { atualizarCadastrosOmie } from "@/lib/conciliacao/omie-envio";
import { testarLoginTrier } from "@/lib/conciliacao/trier-robo";
import { chavesOmieDe, credenciaisTrier, salvarSegredo, SEGREDOS } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";

export type EstadoIntegracao = { erro?: string; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const mensagem = (e: unknown) => (e instanceof OmieErro || e instanceof Error ? e.message : String(e));
const revalidar = () => {
  revalidatePath("/configuracoes/integracoes");
  revalidatePath("/conciliacao/robos");
  revalidatePath("/conciliacao/omie");
};

async function exigirAdmin() {
  const sessao = await getSessao();
  return sessao.papel === "admin" ? sessao : null;
}

/** Trier: endereço, usuário e senha do robô. Campo em branco mantém o que já está salvo; "limpar" apaga os três. */
export async function salvarTrier(_prev: EstadoIntegracao, fd: FormData): Promise<EstadoIntegracao> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só o administrador altera integrações." };
  const supabase = await createClient();
  const url = texto(fd, "url");
  const usuario = texto(fd, "usuario");
  const senha = typeof fd.get("senha") === "string" ? String(fd.get("senha")) : "";
  const limpar = fd.get("limpar") === "1";
  const testar = fd.get("testar") === "1";
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return { erro: "Endereço do Trier inválido (comece com http:// ou https://)." };
  try {
    if (limpar) {
      await salvarSegredo(supabase, SEGREDOS.trier_url, "");
      await salvarSegredo(supabase, SEGREDOS.trier_usuario, "");
      await salvarSegredo(supabase, SEGREDOS.trier_senha, "");
    } else {
      if (url) await salvarSegredo(supabase, SEGREDOS.trier_url, url);
      if (usuario) await salvarSegredo(supabase, SEGREDOS.trier_usuario, usuario);
      if (senha) await salvarSegredo(supabase, SEGREDOS.trier_senha, senha);
    }
  } catch (e) {
    return { erro: `Não consegui gravar: ${mensagem(e)}` };
  }
  // auditoria registra só O QUE mudou, nunca os valores
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "integracoes", novo: { trier: limpar ? "limpou" : { url: !!url, usuario: !!usuario, senha: !!senha } } });
  revalidar();
  if (limpar) return { ok: "Credenciais do Trier apagadas." };
  if (!testar) return { ok: "Credenciais do Trier salvas." };
  try {
    const cred = await credenciaisTrier(supabase);
    if (!cred.usuario || !cred.senha) return { erro: "Salvo, mas ainda falta usuário ou senha para testar." };
    await testarLoginTrier(cred);
    return { ok: "Salvo e testado: o robô entrou no Trier com esse usuário e senha." };
  } catch (e) {
    return { erro: `Salvo, mas o teste de login falhou: ${mensagem(e)}` };
  }
}

/** Omie: app_key e app_secret de uma empresa. "Salvar e testar" já busca os cadastros (conta, categoria, departamentos). */
export async function salvarOmie(_prev: EstadoIntegracao, fd: FormData): Promise<EstadoIntegracao> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só o administrador altera integrações." };
  const empresa = texto(fd, "empresa");
  if (!ehEmpresaOmie(empresa)) return { erro: "Empresa inválida." };
  const supabase = await createClient();
  const appKey = texto(fd, "app_key");
  const appSecret = texto(fd, "app_secret");
  const limpar = fd.get("limpar") === "1";
  const testar = fd.get("testar") === "1";
  const nomeKey = empresa === "nazario" ? SEGREDOS.omie_nazario_app_key : SEGREDOS.omie_varela_app_key;
  const nomeSecret = empresa === "nazario" ? SEGREDOS.omie_nazario_app_secret : SEGREDOS.omie_varela_app_secret;
  try {
    if (limpar) {
      await salvarSegredo(supabase, nomeKey, "");
      await salvarSegredo(supabase, nomeSecret, "");
    } else {
      if (appKey) await salvarSegredo(supabase, nomeKey, appKey);
      if (appSecret) await salvarSegredo(supabase, nomeSecret, appSecret);
    }
  } catch (e) {
    return { erro: `Não consegui gravar: ${mensagem(e)}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "integracoes", novo: { omie: empresa, acao: limpar ? "limpou" : { app_key: !!appKey, app_secret: !!appSecret } } });
  revalidar();
  if (limpar) return { ok: `Chaves da Omie ${EMPRESAS_OMIE[empresa]} apagadas.` };
  if (!testar) return { ok: `Chaves da Omie ${EMPRESAS_OMIE[empresa]} salvas.` };
  try {
    const ch = await chavesOmieDe(supabase, empresa);
    if (!ch) return { erro: "Salvo, mas ainda falta app_key ou app_secret para testar." };
    const cache = await atualizarCadastrosOmie(supabase, ch, empresa, sessao);
    const avisos = [cache.conta ? null : "conta corrente padrão não achada", cache.categoria ? null : "categoria padrão não achada", cache.departamentosFaltando.length ? `${cache.departamentosFaltando.length} departamento(s) não achado(s)` : null].filter(Boolean);
    return { ok: `Salvo e testado: a Omie ${EMPRESAS_OMIE[empresa]} respondeu (${cache.todos.length} departamentos, ${cache.opcoesConta.length} contas correntes).${avisos.length ? ` Atenção: ${avisos.join("; ")} — ajuste em Conciliação → Omie.` : ""}` };
  } catch (e) {
    return { erro: `Salvo, mas a Omie recusou: ${mensagem(e)}` };
  }
}
