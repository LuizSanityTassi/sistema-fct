"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { BUCKET_ANEXOS_CAIXA, MAX_ANEXOS_POR_ENVIO, TAMANHO_MAXIMO_ANEXO, TIPOS_ANEXO, type AnexoEnviado } from "@/lib/caixa/anexos";
import { caminhoDoComprovante, ehTipoVenda, MAX_PARCELAS } from "@/lib/comprovantes/rotulos";
import { comprovanteParecido } from "@/lib/data/comprovantes";
import { lerValor } from "@/lib/sangrias/rotulos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ROTA = "/comprovantes";
const ROTA_CONFERENCIA = "/financeiro/comprovantes";
// cadastro (loja) e conferência (financeiro) mostram o mesmo comprovante: atualiza as duas telas
const revalidar = (id?: string) => {
  revalidatePath(ROTA);
  revalidatePath(ROTA_CONFERENCIA);
  if (id) {
    revalidatePath(`${ROTA}/${id}`);
    revalidatePath(`${ROTA_CONFERENCIA}/${id}`);
  }
};
const ehFinanceiro = (papel: string) => papel === "admin" || papel === "financeiro";

export type EstadoComprovante = { erro?: string; erros?: Record<string, string>; id?: string; parecido?: string };
export type EstadoAcao = { erro?: string; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/**
 * 1º passo do cadastro: grava o comprovante e devolve o id. O navegador então envia o anexo direto ao Storage
 * (comprovantes/<id>/) e chama registrarAnexos. O banco carimba quem cadastrou e confere se pode na loja.
 * Se já existe um igual (mesma loja, data, cliente e valor), pergunta antes de gravar outro.
 */
export async function cadastrarComprovante(_prev: EstadoComprovante, fd: FormData): Promise<EstadoComprovante> {
  const sessao = await getSessao();
  const erros: Record<string, string> = {};
  const branch_id = texto(fd, "branch_id");
  const tipo = texto(fd, "tipo");
  const empresa = texto(fd, "empresa").slice(0, 160);
  const cliente = texto(fd, "cliente").replace(/\s+/g, " ").slice(0, 160);
  const valor = lerValor(texto(fd, "valor"));
  const parcelas = Number.parseInt(texto(fd, "parcelas"), 10);
  const data_compra = texto(fd, "data_compra");
  const numero_venda = texto(fd, "numero_venda").slice(0, 40) || null;
  const observacao = texto(fd, "observacao").slice(0, 1000) || null;
  const mesmoAssim = texto(fd, "mesmo_assim") === "sim";
  const hoje = hojeBrasil();
  if (!UUID.test(branch_id)) erros.branch_id = "Escolha a filial.";
  if (!ehTipoVenda(tipo)) erros.tipo = "Escolha convênio ou crediário.";
  if (tipo === "convenio" && empresa.length < 2) erros.empresa = "Informe a empresa do convênio.";
  if (cliente.length < 2) erros.cliente = "Informe o nome do cliente.";
  if (valor === null) erros.valor = "Informe o total da venda (ex.: 48,21).";
  else if (valor >= 1_000_000) erros.valor = "Valor alto demais: confira.";
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAX_PARCELAS) erros.parcelas = `De 1 a ${MAX_PARCELAS} parcelas.`;
  if (!DATA.test(data_compra)) erros.data_compra = "Informe a data da compra.";
  else if (data_compra > hoje) erros.data_compra = "A compra não pode ser no futuro.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const novo = {
    branch_id,
    tipo,
    empresa: tipo === "convenio" ? empresa : empresa || null,
    cliente,
    valor: valor!,
    parcelas,
    data_compra,
    numero_venda,
    observacao,
  };
  if (!mesmoAssim) {
    const parecido = await comprovanteParecido(novo);
    if (parecido) return { erro: "Já existe um comprovante ativo desta loja com a mesma data, cliente e valor.", parecido };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("venda_comprovantes").insert(novo).select("id").single();
  if (error) {
    if (error.code === "23505") return { erro: "Essa venda (loja + nº da venda) já foi cadastrada.", erros: { numero_venda: "Já cadastrada." } };
    if (error.code === "42501" || /row-level security/i.test(error.message)) return { erro: "Você não pode cadastrar comprovante nessa filial." };
    return { erro: `Não consegui cadastrar: ${error.message}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "venda_comprovantes", registroId: data.id, novo: { ...novo, mesmo_assim: mesmoAssim || undefined } });
  revalidar();
  return { id: data.id };
}

/** 2º passo: registra os anexos que o navegador já enviou ao Storage. */
export async function registrarAnexos(id: string, lista: AnexoEnviado[]): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Comprovante inválido." };
  if (!Array.isArray(lista) || !lista.length) return { ok: "Nada para registrar." };
  if (lista.length > MAX_ANEXOS_POR_ENVIO) return { erro: `No máximo ${MAX_ANEXOS_POR_ENVIO} arquivos por vez.` };
  for (const a of lista) {
    if (typeof a?.caminho !== "string" || !caminhoDoComprovante(id, a.caminho)) return { erro: "Arquivo fora da pasta deste comprovante." };
    if (typeof a.mime !== "string" || !(TIPOS_ANEXO as readonly string[]).includes(a.mime)) return { erro: "Tipo de arquivo não aceito." };
    if (!(Number(a.tamanho) > 0 && Number(a.tamanho) <= TAMANHO_MAXIMO_ANEXO)) return { erro: "Arquivo com tamanho inválido." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("venda_comprovante_anexos").insert(
    lista.map((a) => ({
      comprovante_id: id,
      nome: String(a.nome).trim().slice(0, 160) || "comprovante",
      storage_path: a.caminho,
      mime: a.mime,
      tamanho: Number(a.tamanho),
      enviado_por: sessao.id,
      enviado_por_nome: sessao.nome,
    })),
  );
  if (error) {
    await supabase.storage.from(BUCKET_ANEXOS_CAIXA).remove(lista.map((a) => a.caminho));
    return { erro: `Não consegui registrar o anexo: ${error.message}` };
  }
  revalidar(id);
  return { ok: "Anexo enviado." };
}

/** Cancela com motivo (quem cadastrou ou o financeiro). O cadastro não se edita: para corrigir, cancela e cadastra de novo. */
export async function cancelarComprovante(id: string, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!UUID.test(id)) return { erro: "Comprovante inválido." };
  const motivo = texto(fd, "motivo").slice(0, 500);
  if (motivo.length < 5) return { erro: "Conte o motivo do cancelamento (pelo menos 5 letras)." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("venda_comprovantes")
    .update({ situacao: "cancelado", motivo_cancelamento: motivo })
    .eq("id", id)
    .eq("situacao", "ativo")
    .select("id")
    .maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Você não pode cancelar este comprovante (ou ele já foi cancelado)." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "inativar", entidade: "venda_comprovantes", registroId: id, anterior: { situacao: "ativo" }, novo: { situacao: "cancelado", motivo } });
  revalidar(id);
  return { ok: "Comprovante cancelado." };
}

/**
 * Conferência de um comprovante (financeiro): conferido (observação opcional), com problema (o que a loja precisa
 * corrigir, obrigatório) ou desfazer (volta para a conferir). O banco confere quem pode e carimba quem conferiu.
 */
export async function conferirComprovante(id: string, _prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!ehFinanceiro(sessao.papel)) return { erro: "Só o financeiro confere comprovantes." };
  if (!UUID.test(id)) return { erro: "Comprovante inválido." };
  const acao = texto(fd, "acao");
  const nota = texto(fd, "nota").slice(0, 500);
  let patch: { conferencia: string; conferencia_obs?: string | null };
  if (acao === "conferir") patch = { conferencia: "conferido", conferencia_obs: nota || null };
  else if (acao === "problema") {
    if (nota.length < 5) return { erro: "Conte qual é o problema (ex.: sem assinatura do cliente, valor diferente do cupom)." };
    patch = { conferencia: "divergente", conferencia_obs: nota };
  } else if (acao === "desfazer") patch = { conferencia: "pendente" };
  else return { erro: "Ação inválida." };

  const supabase = await createClient();
  const { data: antes } = await supabase.from("venda_comprovantes").select("conferencia, conferencia_obs").eq("id", id).maybeSingle();
  const { data, error } = await supabase.from("venda_comprovantes").update(patch).eq("id", id).eq("situacao", "ativo").select("conferencia").maybeSingle();
  if (error) return { erro: error.message };
  if (!data) return { erro: "Este comprovante não pode ser conferido (foi cancelado?)." };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "venda_comprovantes", registroId: id, anterior: antes ?? undefined, novo: { conferencia: data.conferencia, conferencia_obs: patch.conferencia_obs ?? null } });
  revalidar(id);
  return { ok: acao === "conferir" ? "Comprovante conferido." : acao === "problema" ? "Problema apontado: a loja vê o aviso e corrige anexando o arquivo certo." : "Conferência desfeita: voltou para a conferir." };
}

/** Conferência em lote: marca como conferidos os escolhidos que ainda estão a conferir e têm anexo. */
export async function conferirComprovantes(_prev: EstadoAcao, fd: FormData): Promise<EstadoAcao> {
  const sessao = await getSessao();
  if (!ehFinanceiro(sessao.papel)) return { erro: "Só o financeiro confere comprovantes." };
  const ids = [...new Set(fd.getAll("ids").filter((v): v is string => typeof v === "string" && UUID.test(v)))];
  if (!ids.length) return { erro: "Marque pelo menos um comprovante." };
  if (ids.length > 200) return { erro: "No máximo 200 por vez." };
  const supabase = await createClient();
  // só os que têm anexo: conferir sem ver o comprovante não vale
  const { data: comAnexo } = await supabase.from("venda_comprovante_anexos").select("comprovante_id").in("comprovante_id", ids);
  const validos = [...new Set((comAnexo ?? []).map((a) => a.comprovante_id))];
  if (!validos.length) return { erro: "Nenhum dos marcados tem anexo." };
  const { data, error } = await supabase
    .from("venda_comprovantes")
    // sem observação: limpa o problema apontado antes (a loja já corrigiu)
    .update({ conferencia: "conferido", conferencia_obs: null })
    .in("id", validos)
    .eq("situacao", "ativo")
    .eq("conferencia", "pendente")
    .select("id");
  if (error) return { erro: error.message };
  const n = data?.length ?? 0;
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "venda_comprovantes", novo: { conferidos_em_lote: (data ?? []).map((c) => c.id) } });
  revalidar();
  const fora = ids.length - n;
  return { ok: `${n === 1 ? "1 comprovante conferido" : `${n} comprovantes conferidos`}${fora ? ` · ${fora} ficaram de fora (sem anexo ou já mudaram)` : ""}.` };
}
