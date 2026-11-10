"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { registrarAuditoria } from "@/lib/auditoria";
import { podeTravarContabil } from "@/lib/data/contabil-trava";
import { createClient } from "@/lib/supabase/server";

export type EstadoTrava = { erro?: string; ok?: string };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const rotulo = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

function atualizarTelas() {
  revalidatePath("/financeiro/dre");
  revalidatePath("/financeiro/caixa-contabil");
  revalidatePath("/financeiro/lancamentos");
}

/** Trava o mês: a parte contábil dele (DRE, caixa contábil e lançamentos) para de mudar até alguém liberar. */
export async function travarMesContabil(_prev: EstadoTrava, fd: FormData): Promise<EstadoTrava> {
  const sessao = await getSessao();
  if (!podeTravarContabil(sessao.papel)) return { erro: "Só o contador e o administrador travam o mês." };
  const mes = String(fd.get("mes") ?? "").trim();
  if (!MES.test(mes)) return { erro: "Escolha o mês." };
  const supabase = await createClient();
  const { error } = await supabase.from("contabil_meses_travados").insert({ competencia: `${mes}-01`, travado_por: sessao.id, travado_por_nome: sessao.nome });
  if (error) return { erro: error.code === "23505" ? `${rotulo(mes)} já estava travado.` : `Não travou: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "contabil_meses_travados", novo: { competencia: mes, travado: true } });
  atualizarTelas();
  return { ok: `${rotulo(mes)} travado: a DRE, o caixa contábil e os lançamentos desse mês não mudam mais até liberar.` };
}

/** Libera o mês travado (fica registrado quem liberou). */
export async function liberarMesContabil(fd: FormData) {
  const sessao = await getSessao();
  if (!podeTravarContabil(sessao.papel)) return;
  const mes = String(fd.get("mes") ?? "").trim();
  if (!MES.test(mes)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("contabil_meses_travados").delete().eq("competencia", `${mes}-01`).select("competencia, travado_por_nome, travado_em");
  if (error) throw new Error(`Não liberou: ${error.message}`);
  if (data.length) {
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "contabil_meses_travados", anterior: { competencia: mes, travado: true, por: data[0].travado_por_nome, em: data[0].travado_em }, novo: { competencia: mes, travado: false } });
  }
  atualizarTelas();
}
