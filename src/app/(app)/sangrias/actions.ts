"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA, MAX_ANEXOS_POR_ENVIO, TAMANHO_MAXIMO_ANEXO, TIPOS_ANEXO, type AnexoEnviado } from "@/lib/caixa/anexos";
import { enviarSangriasAoOmie, INICIO_SANGRIAS_NO_OMIE, MAX_SANGRIAS_POR_ENVIO, resumoDoEnvio, vincularSangriaAoOmie, type ResultadoSangria } from "@/lib/sangrias/envio-omie";
import { caminhoDaSangria, lerValor } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ROTA = "/sangrias";
const ROTA_CONFERENCIA = "/financeiro/sangrias";
// lançamento (loja) e conferência (financeiro) mostram a mesma sangria: atualiza as duas telas
const revalidar = (id?: string) => {
  revalidatePath(ROTA);
  revalidatePath(ROTA_CONFERENCIA);
  if (id) {
    revalidatePath(`${ROTA}/${id}`);
    revalidatePath(`${ROTA_CONFERENCIA}/${id}`);
  }
};

export type EstadoSangria = { erro?: string; erros?: Record<string, string>; id?: string };
export type EstadoAcao = { erro?: string; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * 1º passo do cadastro: grava a sangria e devolve o id. O navegador então envia o comprovante direto ao Storage
 * (sangrias/<id>/) e chama registrarComprovantes. O banco carimba quem cadastrou e confere se pode na loja.
 */
export async function cadastrarSangria(_prev: EstadoSangria, fd: FormData): Promise<EstadoSangria> {
  const sessao = await getSessao();
  const erros: Record<string, string> = {};
  const branch_id = texto(fd, "branch_id");
  const conta_id = texto(fd, "conta_id");
  const data_retirada = texto(fd, "data_retirada");
  const data_deposito = texto(fd, "data_deposito");
  const numero_deposito = texto(fd, "numero_deposito").slice(0, 40) || null;
  const valor = lerValor(texto(fd, "valor"));
  const observacao = texto(fd, "observacao").slice(0, 1000) || null;
  const hoje = hojeBrasil();
  if (!UUID.test(branch_id)) erros.branch_id = "Escolha a filial.";
  if (!UUID.test(conta_id)) erros.conta_id = "Escolha o banco.";
  if (!DATA.test(data_retirada)) erros.data_retirada = "Informe a data da retirada.";
  else if (data_retirada > hoje) erros.data_retirada = "A retirada não pode ser no futuro.";
  if (!DATA.test(data_deposito)) erros.data_deposito = "Informe a data do depósito.";
  else if (data_deposito > hoje) erros.data_deposito = "O depósito não pode ser no futuro.";
  else if (DATA.test(data_retirada) && data_deposito < data_retirada) erros.data_deposito = "O depósito não pode ser antes da retirada.";
  if (valor === null) erros.valor = "Informe o valor (ex.: 2.530,00).";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_sangrias")
    // conta_apelido e quem cadastrou o banco preenche (gatilho)
    .insert({ branch_id, conta_id, conta_apelido: "", data_retirada, data_deposito, numero_deposito, valor: valor!, observacao })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { erro: "Esse comprovante (banco + nº do depósito) já foi cadastrado.", erros: { numero_deposito: "Já cadastrado." } };
    if (error.code === "42501" || /row-level security/i.test(error.message)) return { erro: "Você não pode cadastrar sangria nessa filial." };
    return { erro: `Não consegui cadastrar: ${error.message}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "caixa_sangrias", registroId: data.id, novo: { branch_id, conta_id, data_retirada, data_deposito, numero_deposito, valor } });
  revalidar();
  return { id: data.id };
}

/** 2º passo: registra os comprovantes que o navegador já enviou ao Storage. */
export async function registrarComprovantes(id: string, lista: AnexoEnviado[]): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Sangria inválida." };
  if (!Array.isArray(lista) || !lista.length) return { ok: "Nada para registrar." };
  if (lista.length > MAX_ANEXOS_POR_ENVIO) return { erro: `No máximo ${MAX_ANEXOS_POR_ENVIO} arquivos por vez.` };
  for (const a of lista) {
    if (typeof a?.caminho !== "string" || !caminhoDaSangria(id, a.caminho)) return { erro: "Arquivo fora da pasta desta sangria." };
    if (typeof a.mime !== "string" || !(TIPOS_ANEXO as readonly string[]).includes(a.mime)) return { erro: "Tipo de arquivo não aceito." };
    if (!(Number(a.tamanho) > 0 && Number(a.tamanho) <= TAMANHO_MAXIMO_ANEXO)) return { erro: "Arquivo com tamanho inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("sangria_anexos")
    .insert(lista.map((a) => ({ sangria_id: id, nome: String(a.nome).trim().slice(0, 160) || "comprovante", storage_path: a.caminho, mime: a.mime, tamanho: Number(a.tamanho), enviado_por: sessao.id, enviado_por_nome: sessao.nome })));
  if (error) {
    await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(lista.map((a) => a.caminho));
    return { erro: `Não consegui registrar o comprovante: ${error.message}` };
  }
  revalidar(id);
  return { ok: "Comprovante anexado." };
}

/** Financeiro confere (ou desfaz a conferência); quem cadastrou ou o financeiro cancela com motivo. O banco confere quem pode. */
export async function mudarSituacao(id: string, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Sangria inválida." };
  const acao = texto(fd, "acao");
  const nota = texto(fd, "nota").slice(0, 500);
  const supabase = await createClient();
  let patch: { situacao: string; conferencia_obs?: string | null; motivo_cancelamento?: string | null };
  if (acao === "conferir") patch = { situacao: "conferida", conferencia_obs: nota || null };
  else if (acao === "desfazer") patch = { situacao: "pendente" };
  else if (acao === "cancelar") {
    if (nota.length < 5) return { erro: "Conte o motivo do cancelamento (pelo menos 5 letras)." };
    patch = { situacao: "cancelada", motivo_cancelamento: nota };
  } else return { erro: "Ação inválida." };

  const { data, error } = await supabase.from("caixa_sangrias").update(patch).eq("id", id).select("situacao").maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Você não pode mudar esta sangria (ou ela já mudou)." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: acao === "cancelar" ? "inativar" : "editar", entidade: "caixa_sangrias", registroId: id, novo: { situacao: data.situacao, nota: nota || null } });
  if (acao === "conferir" && ehFinanceiro(sessao.papel)) {
    // conferida, vai para o Omie (no lugar da Zanini); se não for, a conferência continua valendo e dá para reenviar
    const r = (await enviarSangriasAoOmie(supabase, [id], { id: sessao.id, nome: sessao.nome })).get(id);
    await auditarEnvio(supabase, sessao.id, new Map(r ? [[id, r]] : []));
    revalidar(id);
    return r?.tipo === "lancada" || r?.tipo === "ja_estava" ? { ok: `Sangria conferida e lançada no Omie (lançamento ${r.codigo}).` } : { erro: `Sangria conferida, mas não foi ao Omie: ${r && "motivo" in r ? r.motivo : "veja o quadro Omie"}.` };
  }
  revalidar(id);
  return { ok: acao === "conferir" ? "Sangria conferida." : acao === "desfazer" ? "Conferência desfeita: voltou para a conferir." : "Sangria cancelada." };
}

const ehFinanceiro = (papel: string) => papel === "admin" || papel === "financeiro";

async function auditarEnvio(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, porId: Map<string, ResultadoSangria>) {
  if (!porId.size) return;
  await registrarAuditoria(supabase, { userId, acao: "editar", entidade: "caixa_sangrias", novo: { omie: Object.fromEntries([...porId].map(([id, r]) => [id, r])) } });
}

/** Lança no Omie uma sangria conferida que ainda não foi (de novo, ou "mesmo assim" quando era só parecida com outra de lá). */
export async function enviarSangriaAoOmie(id: string, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!ehFinanceiro(sessao.papel)) return { erro: "Só o financeiro lança sangria no Omie." };
  if (!UUID.test(id)) return { erro: "Sangria inválida." };
  const supabase = await createClient();
  const porId = await enviarSangriasAoOmie(supabase, [id], { id: sessao.id, nome: sessao.nome }, { mesmoParecida: texto(fd, "mesmo_assim") === "sim" });
  await auditarEnvio(supabase, sessao.id, porId);
  revalidar(id);
  const r = porId.get(id);
  if (!r) return { erro: "Ela não está conferida ou já está no Omie." };
  return r.tipo === "lancada" || r.tipo === "ja_estava" ? { ok: r.tipo === "lancada" ? `Lançada no Omie (lançamento ${r.codigo}).` : `Já estava no Omie (lançamento ${r.codigo}): só marquei.` } : { erro: `Não foi ao Omie: ${r.motivo}.` };
}

/** Liga a sangria ao lançamento igual que já estava no Omie (da Zanini ou de alguém), sem lançar outro. */
export async function vincularSangriaOmie(id: string): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!ehFinanceiro(sessao.papel)) return { erro: "Só o financeiro mexe no Omie das sangrias." };
  if (!UUID.test(id)) return { erro: "Sangria inválida." };
  const supabase = await createClient();
  const r = await vincularSangriaAoOmie(supabase, id, { id: sessao.id, nome: sessao.nome });
  await auditarEnvio(supabase, sessao.id, new Map([[id, r]]));
  revalidar(id);
  return r.tipo === "erro" ? { erro: `Não liguei: ${r.motivo}.` } : { ok: `Ligada ao lançamento ${r.tipo === "ja_estava" ? r.codigo : ""} que já estava no Omie.` };
}

/** Conferidas que ainda não estão no Omie (sem as barradas e as parecidas, que esperam decisão na sangria): manda a leva. */
export async function enviarPendentesAoOmie(): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!ehFinanceiro(sessao.papel)) return { erro: "Só o financeiro lança sangria no Omie." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_sangrias")
    .select("id")
    .eq("situacao", "conferida")
    .is("omie_codigo", null)
    .or("omie_situacao.is.null,omie_situacao.eq.erro")
    .gte("criada_em", INICIO_SANGRIAS_NO_OMIE)
    .order("data_deposito")
    .limit(MAX_SANGRIAS_POR_ENVIO);
  if (error) return { erro: error.message };
  if (!data.length) return { ok: "Nada para enviar: as conferidas já estão no Omie (ou esperam decisão na própria sangria)." };
  const porId = await enviarSangriasAoOmie(supabase, data.map((s) => s.id), { id: sessao.id, nome: sessao.nome });
  await auditarEnvio(supabase, sessao.id, porId);
  revalidar();
  const { texto, problemas } = resumoDoEnvio(porId);
  return problemas ? { erro: `${texto}. Abra as marcadas na coluna Omie para ver o motivo.` } : { ok: `${texto}.` };
}

/** Conferência em lote (Financeiro → Conferência de sangrias): marca as escolhidas que ainda estão a conferir. */
export async function conferirSangrias(_prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") return { erro: "Só o financeiro confere sangrias." };
  const ids = fd.getAll("ids").filter((v): v is string => typeof v === "string" && UUID.test(v));
  if (!ids.length) return { erro: "Marque pelo menos uma sangria." };
  if (ids.length > 200) return { erro: "No máximo 200 por vez." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("caixa_sangrias").update({ situacao: "conferida" }).in("id", ids).eq("situacao", "pendente").select("id");
  if (error) return { erro: error.message };
  const n = data?.length ?? 0;
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_sangrias", novo: { conferidas_em_lote: n } });
  const conferidas = n === 1 ? "1 sangria conferida" : `${n} sangrias conferidas`;
  if (!n) {
    revalidar();
    return { ok: `${conferidas}.` };
  }
  // conferidas vão para o Omie; passando do limite de uma leva, o resto sai no botão "Enviar ao Omie"
  const porId = await enviarSangriasAoOmie(
    supabase,
    data.map((s) => s.id),
    { id: sessao.id, nome: sessao.nome },
  );
  await auditarEnvio(supabase, sessao.id, porId);
  revalidar();
  const { texto, problemas } = resumoDoEnvio(porId);
  const fora = n > MAX_SANGRIAS_POR_ENVIO ? ` · ${n - MAX_SANGRIAS_POR_ENVIO} ficaram para o próximo "Enviar ao Omie"` : "";
  return problemas ? { erro: `${conferidas}: ${texto}${fora}. Veja a coluna Omie.` } : { ok: `${conferidas}: ${texto}${fora}.` };
}
