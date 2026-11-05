"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { lerUuid, meuFuncionario, obterFuncPonto } from "@/lib/data/ponto";
import { MOTIVOS_AJUSTE, momentoDe, somarDias, TIPOS_MARCACAO, TIPOS_NORMAIS } from "@/lib/ponto/calculo";
import { lerHorario, mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Pedido de ajuste: incluir uma marcação esquecida, corrigir o horário de uma ou anular uma registrada por engano. */
export async function solicitarAjuste(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  const supabase = await createClient();
  const employeeId = lerUuid(texto(fd, "employee_id"));
  const data = texto(fd, "data");
  const acao = texto(fd, "acao");
  const motivoTipo = texto(fd, "motivo_tipo");
  const motivo = texto(fd, "motivo") ?? "";
  const erros: Record<string, string> = {};
  if (!employeeId) return { erro: "Escolha o funcionário." };
  if (!data || !DATA_RE.test(data)) erros.data = "Informe o dia.";
  if (acao !== "incluir" && acao !== "alterar" && acao !== "anular") erros.acao = "Escolha o que fazer.";
  if (!motivoTipo || !(MOTIVOS_AJUSTE as readonly string[]).includes(motivoTipo)) erros.motivo_tipo = "Escolha o motivo.";
  if (motivo.length < 3) erros.motivo = "Explique o que aconteceu (mínimo 3 letras).";
  if (motivo.length > 500) erros.motivo = "Máximo de 500 caracteres.";

  let marcacao: { id: string; momento: string; tipo: string } | null = null;
  if (acao === "alterar" || acao === "anular") {
    const mid = lerUuid(texto(fd, "marcacao_id"));
    if (!mid) erros.marcacao_id = "Escolha a marcação.";
    else {
      const { data: m } = await supabase.from("ponto_marcacoes").select("id, momento, tipo, employee_id, anulada").eq("id", mid).maybeSingle();
      if (!m || m.employee_id !== employeeId || m.anulada) erros.marcacao_id = "Marcação não encontrada.";
      else marcacao = m;
    }
  }
  let horario: string | null = null;
  if (acao === "incluir" || acao === "alterar") {
    const h = lerHorario(fd, "horario");
    if (!h) erros.horario = "Informe o horário certo (HH:MM).";
    else if (data && DATA_RE.test(data)) horario = momentoDe(fd.get("dia_seguinte") === "on" ? somarDias(data, 1) : data, h);
    if (horario && Date.parse(horario) > Date.now()) erros.horario = "O horário não pode estar no futuro.";
  }
  const tipo = texto(fd, "tipo_marcacao");
  // incluir entrada ou saída extra por ajuste é só do RH/DP: para os outros, a extra sempre passa pelo chamado
  const tiposPermitidos: readonly string[] = sessao.papel === "admin" || sessao.papel === "rh" ? TIPOS_MARCACAO : TIPOS_NORMAIS;
  if (acao === "incluir" && (!tipo || !tiposPermitidos.includes(tipo))) erros.tipo_marcacao = "Escolha o tipo da marcação.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const emp = await obterFuncPonto(employeeId);
  if (!emp) return { erro: "Funcionário não encontrado." };
  const { error } = await supabase.from("ponto_ajustes").insert({
    employee_id: employeeId,
    branch_id: emp.branch_id,
    data: data!,
    acao: acao as "incluir" | "alterar" | "anular",
    tipo_marcacao: acao === "incluir" ? tipo! : (marcacao?.tipo ?? null),
    marcacao_id: marcacao?.id ?? null,
    horario_original: marcacao?.momento ?? null,
    horario_solicitado: horario,
    motivo_tipo: motivoTipo!,
    motivo,
    solicitado_por: sessao.id,
  });
  if (error) return { erro: mensagemBanco(error, "Não foi possível enviar o pedido.") };
  revalidatePath("/ponto", "layout");
  const eu = await meuFuncionario();
  redirect(`/ponto/ajustes?aba=${eu?.id === employeeId ? "meus" : "aprovar"}&ok=enviado`);
}

/** Aprovar ou recusar (gestor da filial, RH, admin). Mês fechado: só o admin, com o motivo da exceção. */
export async function decidirAjuste(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const id = lerUuid(texto(fd, "id"));
  const aprovar = texto(fd, "decisao") === "aprovar";
  const resposta = texto(fd, "resposta") ?? null;
  const motivoFechado = texto(fd, "motivo_fechado") ?? null;
  if (!id) return { erro: "Pedido inválido." };
  if (!aprovar && !resposta) return { erro: "Para recusar, escreva o motivo para o funcionário." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ponto_decidir_ajuste", { p_id: id, p_aprovar: aprovar, p_resposta: resposta, p_motivo_fechado: motivoFechado });
  if (error) return { erro: mensagemBanco(error, "Não foi possível decidir.") };
  revalidatePath("/ponto", "layout");
  return { ok: aprovar ? "Ajuste aprovado: a marcação já vale no espelho." : "Pedido recusado." };
}

export async function cancelarAjuste(fd: FormData) {
  const id = lerUuid(texto(fd, "id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.rpc("ponto_cancelar_ajuste", { p_id: id });
  revalidatePath("/ponto", "layout");
}
