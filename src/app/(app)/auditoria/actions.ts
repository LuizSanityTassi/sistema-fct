"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { campoComentario, campoItem, ehResposta, PERGUNTAS_CHECKLIST, type RespostaGravada } from "@/lib/auditoria/checklist";
import { lerPlanilhaPrecos } from "@/lib/auditoria/precos-planilha";
import { getSessao } from "@/lib/auth/session";
import { lerDecimal } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTA = "/auditoria";
const ROTA_PREC = "/auditoria/precificacao";

export type EstadoAud = { erro?: string; erros?: Record<string, string>; id?: string; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const semPermissao = (msg: string) => /row-level security|42501/i.test(msg);
const normalizarCodigo = (c: string) => c.trim().replace(/\s+/g, "").replace(/^0+(?=\d)/, "").slice(0, 30);

// ---------------------------------------------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------------------------------------------

/** Auditor grava o checklist da loja. O banco carimba quem fez e a hora de finalização. */
export async function salvarChecklistAuditoria(_prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  const erros: Record<string, string> = {};
  const branch_id = texto(fd, "branch_id");
  if (!UUID.test(branch_id)) erros.branch_id = "Escolha a filial.";
  const gerente_nome = texto(fd, "gerente_nome").slice(0, 120);
  const abertoBruto = texto(fd, "aberto_em");
  const aberto = abertoBruto && !Number.isNaN(Date.parse(abertoBruto)) ? new Date(abertoBruto).toISOString() : new Date().toISOString();
  const faltando: number[] = [];
  const respostas: RespostaGravada[] = PERGUNTAS_CHECKLIST.map((q) => {
    const itens = q.itens.map((item, i) => {
      const r = texto(fd, campoItem(q.n, i));
      if (!ehResposta(r)) faltando.push(q.n);
      return { item, resposta: (ehResposta(r) ? r : "sim") as RespostaGravada["itens"][number]["resposta"] };
    });
    const comentario = texto(fd, campoComentario(q.n)).slice(0, 500);
    return { n: q.n, pergunta: q.pergunta, ...(comentario ? { comentario } : {}), itens };
  });
  const perguntasFaltando = [...new Set(faltando)];
  if (perguntasFaltando.length) erros.respostas = `Falta responder ${perguntasFaltando.length === 1 ? "a pergunta" : "as perguntas"} ${perguntasFaltando.join(", ")}.`;
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { data: novo, error } = await supabase
    .from("aud_checklists")
    .insert({ branch_id, gerente_nome: gerente_nome || null, aberto_em: aberto, respostas, observacao: texto(fd, "observacao").slice(0, 4000) || null, anotacoes: texto(fd, "anotacoes").slice(0, 4000) || null })
    .select("id, numero")
    .single();
  if (error) return { erro: semPermissao(error.message) ? "Você não pode auditar essa filial." : `Não consegui gravar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "aud_checklists", registroId: novo.id, novo: { branch_id, numero: novo.numero } });
  revalidatePath(ROTA);
  return { id: novo.id };
}

/** Quem fez (ou o administrador) cancela o checklist, com motivo. */
export async function cancelarChecklistAuditoria(id: string, _prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Checklist inválido." };
  const motivo = texto(fd, "motivo").slice(0, 500);
  if (motivo.length < 5) return { erro: "Conte o motivo do cancelamento (pelo menos 5 letras)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("aud_checklists").update({ situacao: "cancelado", motivo_cancelamento: motivo }).eq("id", id).eq("situacao", "finalizado").select("id").maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Este checklist já foi cancelado ou você não pode cancelá-lo." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "inativar", entidade: "aud_checklists", registroId: id, novo: { situacao: "cancelado", motivo } });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
  return { ok: "Checklist cancelado." };
}

// ---------------------------------------------------------------------------------------------------------------
// Precificação
// ---------------------------------------------------------------------------------------------------------------

/** "Continuar": abre a auditoria de precificação da filial e vai para a tela dos produtos. */
export async function abrirPrecificacao(_prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  const branch_id = texto(fd, "branch_id");
  if (!UUID.test(branch_id)) return { erro: "Selecione uma filial." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("aud_precificacoes").insert({ branch_id }).select("id").single();
  if (error) return { erro: semPermissao(error.message) ? "Você não pode auditar essa filial." : `Não consegui abrir: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "aud_precificacoes", registroId: data.id, novo: { branch_id } });
  revalidatePath(ROTA_PREC);
  redirect(`${ROTA_PREC}/${data.id}`);
}

/** Código reduzido → produto e preço de venda na base carregada do Trier. */
export async function buscarPreco(codigo: string): Promise<{ codigo: string; descricao: string; preco: number } | null> {
  await getSessao();
  const c = normalizarCodigo(codigo);
  if (!c) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("aud_precos").select("codigo, descricao, preco").eq("codigo", c).maybeSingle();
  if (data) return { codigo: data.codigo, descricao: data.descricao, preco: Number(data.preco) };
  // também pelo código de barras
  if (/^\d{8,14}$/.test(c)) {
    const { data: porEan } = await supabase.from("aud_precos").select("codigo, descricao, preco").eq("ean", c).limit(1).maybeSingle();
    if (porEan) return { codigo: porEan.codigo, descricao: porEan.descricao, preco: Number(porEan.preco) };
  }
  return null;
}

/** "Adicionar": lança o produto com divergência (etiqueta × sistema). */
export async function adicionarItemPrecificacao(id: string, _prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  await getSessao();
  if (!UUID.test(id)) return { erro: "Auditoria inválida." };
  const erros: Record<string, string> = {};
  const codigo = normalizarCodigo(texto(fd, "codigo"));
  const produto = texto(fd, "produto").replace(/\s+/g, " ").slice(0, 200);
  const sistema = lerDecimal(texto(fd, "valor_sistema"));
  const etiqueta = lerDecimal(texto(fd, "valor_etiqueta"));
  if (!codigo) erros.codigo = "Informe o código reduzido.";
  if (!produto) erros.produto = "Informe o produto.";
  if (sistema === null || sistema < 0) erros.valor_sistema = "Informe o valor no sistema.";
  if (etiqueta === null || etiqueta < 0) erros.valor_etiqueta = "Informe o valor na etiqueta.";
  if (fd.get("sistema_confirmado") !== "on") erros.sistema_confirmado = "Confirme que o valor no sistema está correto.";
  if (!erros.valor_sistema && !erros.valor_etiqueta && Math.round((sistema ?? 0) * 100) === Math.round((etiqueta ?? 0) * 100)) erros.valor_etiqueta = "Sem diferença: não precisa lançar.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { error } = await supabase.from("aud_precificacao_itens").insert({
    precificacao_id: id,
    codigo,
    produto,
    valor_sistema: Math.round((sistema ?? 0) * 100) / 100,
    valor_etiqueta: Math.round((etiqueta ?? 0) * 100) / 100,
    sistema_confirmado: true,
    da_base: fd.get("da_base") === "1",
  });
  if (error) return { erro: semPermissao(error.message) ? "Só quem abriu a auditoria lança os produtos." : error.message };
  revalidatePath(`${ROTA_PREC}/${id}`);
  return { ok: `${produto} adicionado.` };
}

export async function excluirItemPrecificacao(id: string, itemId: string): Promise<EstadoAud> {
  await getSessao();
  if (!UUID.test(id) || !UUID.test(itemId)) return { erro: "Produto inválido." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("aud_precificacao_itens").delete().eq("id", itemId).eq("precificacao_id", id).select("id");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "Não consegui excluir (a auditoria já foi finalizada ou não é sua)." };
  revalidatePath(`${ROTA_PREC}/${id}`);
  return { ok: "Produto excluído." };
}

/** "Finalizar auditoria": grava a quantidade verificada e a observação; o banco conta as divergências. */
export async function finalizarPrecificacao(id: string, _prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Auditoria inválida." };
  const qtd = Number(texto(fd, "qtd_verificada"));
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 100000) return { erro: "Informe a quantidade de produtos verificados.", erros: { qtd_verificada: "Obrigatório." } };
  const observacao = texto(fd, "observacao").slice(0, 2000) || null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aud_precificacoes")
    .update({ situacao: "finalizada", qtd_verificada: qtd, observacao })
    .eq("id", id)
    .eq("situacao", "em_andamento")
    .select("id, qtd_divergente")
    .maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Esta auditoria já foi finalizada ou você não pode alterá-la." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "aud_precificacoes", registroId: id, novo: { situacao: "finalizada", qtd_verificada: qtd, qtd_divergente: data.qtd_divergente } });
  revalidatePath(ROTA_PREC);
  revalidatePath(`${ROTA_PREC}/${id}`);
  return { ok: "Auditoria finalizada." };
}

export async function cancelarPrecificacao(id: string, _prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Auditoria inválida." };
  const motivo = texto(fd, "motivo").slice(0, 500);
  if (motivo.length < 5) return { erro: "Conte o motivo do cancelamento (pelo menos 5 letras)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("aud_precificacoes").update({ situacao: "cancelada", motivo_cancelamento: motivo }).eq("id", id).neq("situacao", "cancelada").select("id").maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Esta auditoria já foi cancelada ou você não pode cancelá-la." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "inativar", entidade: "aud_precificacoes", registroId: id, novo: { situacao: "cancelada", motivo } });
  revalidatePath(ROTA_PREC);
  revalidatePath(`${ROTA_PREC}/${id}`);
  return { ok: "Auditoria cancelada." };
}

// ---------------------------------------------------------------------------------------------------------------
// Base de preços
// ---------------------------------------------------------------------------------------------------------------

/** Importa a planilha de produtos do Trier: atualiza quem já existe e inclui os novos (não apaga nada). */
export async function importarPrecos(_prev: EstadoAud, fd: FormData): Promise<EstadoAud> {
  const sessao = await getSessao();
  if (!["admin", "financeiro"].includes(sessao.papel)) return { erro: "Só o administrador e o financeiro atualizam a base de preços." };
  const arq = fd.get("arquivo");
  if (!(arq instanceof File) || arq.size === 0) return { erro: "Escolha a planilha do Trier." };
  if (arq.size > 20 * 1024 * 1024) return { erro: "Planilha muito grande (máximo 20 MB)." };
  let leitura;
  try {
    leitura = lerPlanilhaPrecos(Buffer.from(await arq.arrayBuffer()));
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const LOTE = 1000;
  for (let i = 0; i < leitura.produtos.length; i += LOTE) {
    const lote = leitura.produtos.slice(i, i + LOTE).map((p) => ({ ...p, atualizado_em: agora, atualizado_por: sessao.id }));
    const { error } = await supabase.from("aud_precos").upsert(lote, { onConflict: "codigo" });
    if (error) return { erro: `Parei no produto ${i + 1} de ${leitura.produtos.length}: ${error.message}. Os anteriores já foram gravados; pode importar de novo.` };
  }
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "importar",
    entidade: "aud_precos",
    registroId: null,
    novo: { arquivo: arq.name, produtos: leitura.produtos.length, colunas: leitura.colunas, aba: leitura.aba, ignoradas: leitura.ignoradas },
  });
  revalidatePath("/auditoria/precos");
  const extra = [leitura.ignoradas ? `${leitura.ignoradas} linhas sem código/preço ignoradas` : "", leitura.repetidos ? `${leitura.repetidos} códigos repetidos (ficou o último)` : ""].filter(Boolean).join("; ");
  return { ok: `${leitura.produtos.length.toLocaleString("pt-BR")} produtos gravados da aba “${leitura.aba}” (colunas: ${leitura.colunas.join(", ")}).${extra ? ` ${extra}.` : ""}` };
}
