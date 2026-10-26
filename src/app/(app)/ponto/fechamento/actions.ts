"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { administraPonto, apurar, lerUuid, listarAjustes, listarEquipe } from "@/lib/data/ponto";
import { hojeLocal, limitesMes } from "@/lib/ponto/calculo";
import { mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

/**
 * Fecha o mês da filial: calcula o saldo de cada funcionário com as regras do espelho, grava o resumo e lança o
 * saldo no banco de horas. Depois disso marcações, ajustes, escalas e ausências do mês ficam travados.
 */
export async function fecharMes(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return { erro: "Só Administrador e RH fecham o ponto." };
  const branch = lerUuid(texto(fd, "branch_id"));
  const mes = texto(fd, "mes") ?? "";
  if (!branch || !/^\d{4}-\d{2}$/.test(mes)) return { erro: "Filial ou mês inválido." };
  const { de, ate } = limitesMes(mes);
  if (ate >= hojeLocal()) return { erro: "Só dá para fechar depois que o mês terminar." };
  if (fd.get("ciente") !== "on") return { erro: "Confirme que conferiu as inconsistências." };

  const pendentes = (await listarAjustes({ status: "pendente", filial: branch, de, ate })).length;
  if (pendentes) return { erro: `Ainda há ${pendentes} pedido(s) de ajuste pendente(s) neste mês. Decida antes de fechar.` };

  const equipe = (await listarEquipe({ filial: branch, desligados: true })).filter((f) => !f.data_desligamento || f.data_desligamento >= de);
  const aps = await apurar(equipe, de, ate);
  const somar = (k: "trabalhado" | "extra" | "extra100" | "debito" | "saldo" | "faltas" | "atrasos" | "inconsistencias" | "incompletos") => aps.reduce((s, a) => s + a.totais[k], 0);
  const resumo = {
    funcionarios: aps.length,
    trabalhado: somar("trabalhado"),
    extra: somar("extra"),
    extra100: somar("extra100"),
    debito: somar("debito"),
    saldo: somar("saldo"),
    faltas: somar("faltas"),
    atrasos: somar("atrasos"),
    inconsistencias: somar("inconsistencias"),
    incompletos: somar("incompletos"),
    calculado_em: new Date().toISOString(),
  };
  const saldos = aps.filter((a) => a.totais.saldo !== 0).map((a) => ({ employee_id: a.func.id, minutos: a.totais.saldo }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("ponto_fechar_mes", { p_competencia: `${mes}-01`, p_branch: branch, p_resumo: resumo, p_saldos: saldos });
  if (error) return { erro: mensagemBanco(error, "Não foi possível fechar.") };
  revalidatePath("/ponto", "layout");
  return { ok: `Mês fechado: ${aps.length} funcionário(s), ${saldos.length} saldo(s) lançado(s) no banco de horas.` };
}

/** Reabre um mês fechado (só o administrador, com motivo). Os saldos do fechamento saem do banco. */
export async function reabrirMes(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador reabre um mês fechado." };
  const id = lerUuid(texto(fd, "id"));
  const motivo = texto(fd, "motivo") ?? "";
  if (!id) return { erro: "Fechamento inválido." };
  if (motivo.length < 5) return { erro: "Explique por que reabrir (vai para a auditoria)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ponto_reabrir_mes", { p_id: id, p_motivo: motivo });
  if (error) return { erro: mensagemBanco(error, "Não foi possível reabrir.") };
  revalidatePath("/ponto", "layout");
  return { ok: "Mês reaberto. Corrija o que for preciso e feche de novo." };
}
