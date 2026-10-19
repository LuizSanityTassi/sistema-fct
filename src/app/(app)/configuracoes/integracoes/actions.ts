"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehEmpresaOmie, EMPRESAS_OMIE, OmieErro } from "@/lib/conciliacao/omie-api";
import { atualizarCadastrosOmie } from "@/lib/conciliacao/omie-envio";
import { diagnosticarTrier, testarLoginTrier } from "@/lib/conciliacao/trier-robo";
import { SMTP_PADRAO, testarSmtp } from "@/lib/caixa/avisos";
import { chavesOmieDe, credenciaisTrier, lerSegredos, salvarSegredo, SEGREDOS } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

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

/** E-mail de envio dos avisos (SMTP). Campo em branco mantém o que já está salvo; "Salvar e testar" confere a senha sem mandar nada. */
export async function salvarSmtp(_prev: EstadoIntegracao, fd: FormData): Promise<EstadoIntegracao> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só o administrador altera integrações." };
  const supabase = await createClient();
  const host = texto(fd, "host");
  const porta = texto(fd, "porta");
  const usuario = texto(fd, "usuario");
  const senha = typeof fd.get("senha") === "string" ? String(fd.get("senha")) : "";
  const limpar = fd.get("limpar") === "1";
  const testar = fd.get("testar") === "1";
  if (host && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return { erro: "Servidor inválido (ex.: mail.farmaciafct.com.br)." };
  if (porta && !(/^\d{2,5}$/.test(porta) && Number(porta) <= 65535)) return { erro: "Porta inválida (ex.: 465)." };
  if (usuario && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario)) return { erro: "Usuário inválido: use o endereço de e-mail completo." };
  try {
    if (limpar) {
      for (const n of [SEGREDOS.smtp_host, SEGREDOS.smtp_porta, SEGREDOS.smtp_usuario, SEGREDOS.smtp_senha]) await salvarSegredo(supabase, n, "");
    } else {
      if (host) await salvarSegredo(supabase, SEGREDOS.smtp_host, host);
      if (porta) await salvarSegredo(supabase, SEGREDOS.smtp_porta, porta);
      if (usuario) await salvarSegredo(supabase, SEGREDOS.smtp_usuario, usuario);
      if (senha) await salvarSegredo(supabase, SEGREDOS.smtp_senha, senha);
    }
  } catch (e) {
    return { erro: `Não consegui gravar: ${mensagem(e)}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "integracoes", novo: { smtp: limpar ? "limpou" : { host: !!host, porta: !!porta, usuario: !!usuario, senha: !!senha } } });
  revalidatePath("/configuracoes/integracoes");
  revalidatePath("/financeiro/diferenca-caixa/avisos");
  if (limpar) return { ok: "Configuração do e-mail apagada." };
  if (!testar) return { ok: "E-mail de envio salvo." };
  try {
    const s = await lerSegredos(supabase, [SEGREDOS.smtp_host, SEGREDOS.smtp_porta, SEGREDOS.smtp_usuario, SEGREDOS.smtp_senha]);
    if (!s.integ_smtp_senha) return { erro: "Salvo, mas ainda falta a senha para testar." };
    const cfg = { host: s.integ_smtp_host || SMTP_PADRAO.host, porta: Number(s.integ_smtp_porta) || SMTP_PADRAO.porta, usuario: s.integ_smtp_usuario || SMTP_PADRAO.usuario, senha: s.integ_smtp_senha, configurado: true };
    await testarSmtp(cfg);
    return { ok: `Salvo e testado: o servidor ${cfg.host} aceitou o usuário ${cfg.usuario}. Mande um aviso de teste em Financeiro → Diferença de caixa → Avisos por e-mail.` };
  } catch (e) {
    return { erro: `Salvo, mas o servidor de e-mail recusou: ${mensagem(e)}` };
  }
}

export type RelatorioEncontrado ={ pagina: string; rotulo: string; acessivel: boolean; campos: number; gerado: string };
export type EstadoDiagnostico = { erro?: string; ok?: string; relatorios?: RelatorioEncontrado[] };

/**
 * Procura no menu do Trier as telas dos relatórios de caixa e anota os campos de cada uma (e tenta gerar o
 * relatório do dia escolhido). O resultado fica em integracao_diagnosticos (só admin) para montar o robô da
 * diferença de caixa. Não grava usuário nem senha e não altera nada no Trier.
 */
export async function diagnosticarRelatoriosTrier(_prev: EstadoDiagnostico, fd: FormData): Promise<EstadoDiagnostico> {
  const sessao = await exigirAdmin();
  if (!sessao) return { erro: "Só o administrador roda o diagnóstico." };
  const iso = texto(fd, "dia");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { erro: "Escolha o dia." };
  const dia = iso.split("-").reverse().join("/");
  const filial = texto(fd, "filial").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return { erro: "Cadastre antes o usuário e a senha do robô do Trier." };
  let diag;
  try {
    diag = await diagnosticarTrier(cred, dia, filial);
  } catch (e) {
    return { erro: `O robô não conseguiu ler o Trier: ${mensagem(e)}` };
  }
  const passo = (t: (typeof diag.relatorios)[number]["tentativas"][number]) => {
    if (t.base64) return `${t.acao}: gerou ${t.arquivo?.split(".").pop()?.toUpperCase() ?? "arquivo"} (${Math.round((t.tamanho ?? 0) / 1024)} KB)`;
    if (t.arquivo || t.resposta === undefined || t.mensagem) return `${t.acao}: ${t.mensagem || "sem arquivo"}`;
    return `${t.acao}: respondeu (${Math.round(t.resposta.length / 1024)} KB)`;
  };
  const relatorios: RelatorioEncontrado[] = diag.relatorios.map((r) => ({ pagina: r.pagina, rotulo: r.rotulo, acessivel: r.acessivel, campos: r.campos.length, gerado: r.tentativas.map(passo).join(" · ") }));
  const resumo = { dia, filial, telas_no_menu: diag.links.length, scripts: Object.keys(diag.scripts).length, relatorios };
  const { error } = await supabase.from("integracao_diagnosticos").insert({ sistema: "trier", resumo, dados: diag as unknown as Json });
  if (error) return { erro: `O diagnóstico rodou, mas não consegui guardar o resultado: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "integracoes", novo: { diagnostico_trier: { dia, relatorios: relatorios.length } } });
  if (!relatorios.length) return { erro: `Entrei no Trier e li o menu (${diag.links.length} telas), mas não consegui abrir os relatórios de caixa.` };
  const gerados = diag.relatorios.flatMap((r) => r.tentativas).filter((t) => t.base64).length;
  return { ok: `Pronto: abri ${relatorios.length} relatório(s) de caixa no Trier e ${gerados} arquivo(s) foram gerados. O resultado ficou guardado para montar a busca automática.`, relatorios };
}
