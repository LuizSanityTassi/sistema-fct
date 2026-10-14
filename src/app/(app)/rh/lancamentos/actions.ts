"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { competenciaValida } from "@/lib/rh/competencia";
import { competenciaParaData } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";

export type AlteracaoValor = { employeeId: string; eventoId: string; valor: number | null };
export type AlteracaoObs = { employeeId: string; texto: string; pendente: boolean };
export type ResultadoSalvar = { ok: true; gravados: number; apagados: number; observacoes: number } | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_VALOR = 9_999_999.99;

function pedacos<T>(lista: T[], tamanho: number) {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

/** Grava as células alteradas na grade (valor > 0 grava, vazio apaga) e as observações do mês. */
export async function salvarLancamentos(competencia: string, valores: AlteracaoValor[], observacoes: AlteracaoObs[]): Promise<ResultadoSalvar> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "rh") return { ok: false, erro: "Sem permissão para lançar." };
  if (!competenciaValida(competencia)) return { ok: false, erro: "Competência inválida." };
  if (!Array.isArray(valores) || !Array.isArray(observacoes)) return { ok: false, erro: "Dados inválidos." };
  if (valores.length > 20_000 || observacoes.length > 5_000) return { ok: false, erro: "Alterações demais de uma vez: salve em partes." };
  for (const v of valores) {
    if (!UUID.test(v?.employeeId) || !UUID.test(v?.eventoId)) return { ok: false, erro: "Dados inválidos." };
    if (v.valor !== null && (typeof v.valor !== "number" || !Number.isFinite(v.valor) || v.valor < 0 || v.valor > MAX_VALOR)) {
      return { ok: false, erro: "Há valor inválido na grade (use números positivos, ex.: 9,58)." };
    }
  }
  for (const o of observacoes) {
    if (!UUID.test(o?.employeeId) || typeof o.texto !== "string" || o.texto.length > 2000) return { ok: false, erro: "Observação inválida (máx. 2000 caracteres)." };
  }

  const supabase = await createClient();
  const data = competenciaParaData(competencia);
  const ids = [...new Set([...valores.map((v) => v.employeeId), ...observacoes.map((o) => o.employeeId)])];
  const branchDe = new Map<string, string>();
  for (const parte of pedacos(ids, 300)) {
    const { data: emps, error } = await supabase.from("employees").select("id, branch_id").in("id", parte);
    if (error) return { ok: false, erro: error.message };
    for (const e of emps) if (e.branch_id) branchDe.set(e.id, e.branch_id);
  }
  if (valores.some((v) => !branchDe.has(v.employeeId))) return { ok: false, erro: "Funcionário sem filial no cadastro: corrija o cadastro antes de lançar." };

  const gravar = valores
    .filter((v) => v.valor !== null && Math.round(v.valor * 100) > 0)
    .map((v) => ({
      competencia: data,
      employee_id: v.employeeId,
      evento_id: v.eventoId,
      branch_id: branchDe.get(v.employeeId)!,
      valor: Math.round(v.valor! * 100) / 100,
      origem: "manual",
      updated_by: sessao.id,
    }));
  const apagar = valores.filter((v) => v.valor === null || Math.round(v.valor * 100) <= 0);

  for (const parte of pedacos(gravar, 500)) {
    const { error } = await supabase.from("folha_lancamentos").upsert(parte, { onConflict: "competencia,employee_id,evento_id" });
    if (error) return { ok: false, erro: `Não foi possível gravar: ${error.message}` };
  }
  const apagarPorEvento = new Map<string, string[]>();
  for (const v of apagar) apagarPorEvento.set(v.eventoId, [...(apagarPorEvento.get(v.eventoId) ?? []), v.employeeId]);
  for (const [eventoId, emps] of apagarPorEvento) {
    for (const parte of pedacos(emps, 300)) {
      const { error } = await supabase.from("folha_lancamentos").delete().eq("competencia", data).eq("evento_id", eventoId).in("employee_id", parte);
      if (error) return { ok: false, erro: `Não foi possível apagar: ${error.message}` };
    }
  }
  // um CNPJ por funcionário no mês: o do cadastro atual
  const porBranch = new Map<string, string[]>();
  for (const v of gravar) porBranch.set(v.branch_id, [...new Set([...(porBranch.get(v.branch_id) ?? []), v.employee_id])]);
  for (const [branchId, emps] of porBranch) {
    const { error } = await supabase.from("folha_lancamentos").update({ branch_id: branchId }).eq("competencia", data).in("employee_id", emps).neq("branch_id", branchId);
    if (error) return { ok: false, erro: error.message };
  }

  const obsGravar = observacoes
    .filter((o) => o.texto.trim())
    .map((o) => ({ competencia: data, employee_id: o.employeeId, texto: o.texto.trim(), pendente: !!o.pendente, updated_by: sessao.id }));
  const obsApagar = observacoes.filter((o) => !o.texto.trim()).map((o) => o.employeeId);
  if (obsGravar.length) {
    const { error } = await supabase.from("folha_observacoes").upsert(obsGravar, { onConflict: "competencia,employee_id" });
    if (error) return { ok: false, erro: `Não foi possível gravar as observações: ${error.message}` };
  }
  if (obsApagar.length) {
    const { error } = await supabase.from("folha_observacoes").delete().eq("competencia", data).in("employee_id", obsApagar);
    if (error) return { ok: false, erro: error.message };
  }

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "folha_lancamentos",
    novo: { competencia, valores_gravados: gravar.length, valores_apagados: apagar.length, observacoes: observacoes.length, funcionarios: ids.length },
  });
  revalidatePath("/rh/lancamentos");
  return { ok: true, gravados: gravar.length, apagados: apagar.length, observacoes: observacoes.length };
}
