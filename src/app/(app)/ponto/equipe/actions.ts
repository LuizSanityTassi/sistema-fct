"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { gerePonto, lerUuid, listarFechamentos } from "@/lib/data/ponto";
import { somarDias } from "@/lib/ponto/calculo";
import { mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Troca a jornada de um ou mais funcionários a partir de uma data: o vínculo vigente termina na véspera (nada é
 * sobrescrito); vínculos que começariam na mesma data ou depois são substituídos.
 */
export async function aplicarJornada(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!gerePonto(sessao) || sessao.papel === "coordenador") return { erro: "Só Administrador, RH e o gerente da filial mudam a jornada." };
  const ids = fd.getAll("ids").map((v) => lerUuid(v)).filter(Boolean) as string[];
  const jornada = lerUuid(texto(fd, "jornada_id"));
  const inicio = texto(fd, "inicio");
  if (!ids.length) return { erro: "Marque pelo menos um funcionário na lista." };
  if (!jornada) return { erro: "Escolha a jornada." };
  if (!inicio || !DATA_RE.test(inicio)) return { erro: "Informe a partir de quando vale." };

  const supabase = await createClient();
  const { data: funcs } = await supabase.from("employees").select("id, nome, branch_id").in("id", ids);
  const fechados = new Set((await listarFechamentos([`${inicio.slice(0, 7)}-01`])).filter((f) => f.status === "fechado").map((f) => f.branch_id));
  const bloqueados = (funcs ?? []).filter((f) => fechados.has(f.branch_id));
  if (bloqueados.length) return { erro: `O ponto de ${inicio.slice(5, 7)}/${inicio.slice(0, 4)} está fechado para a filial de ${bloqueados[0].nome}. Escolha uma data num mês aberto.` };

  const { data: atuais, error } = await supabase.from("ponto_vinculos").select("id, employee_id, inicio, fim").in("employee_id", ids);
  if (error) return { erro: mensagemBanco(error) };
  const remover = (atuais ?? []).filter((v) => v.inicio >= inicio).map((v) => v.id);
  const encerrar = (atuais ?? []).filter((v) => v.inicio < inicio && (!v.fim || v.fim >= inicio)).map((v) => v.id);
  if (remover.length) {
    const { error: e } = await supabase.from("ponto_vinculos").delete().in("id", remover);
    if (e) return { erro: mensagemBanco(e) };
  }
  if (encerrar.length) {
    const { error: e } = await supabase.from("ponto_vinculos").update({ fim: somarDias(inicio, -1) }).in("id", encerrar);
    if (e) return { erro: mensagemBanco(e) };
  }
  const { error: e2 } = await supabase.from("ponto_vinculos").insert(ids.map((id) => ({ employee_id: id, jornada_id: jornada, inicio, definido_por: sessao.id })));
  if (e2) return { erro: mensagemBanco(e2) };
  revalidatePath("/ponto", "layout");
  return { ok: `Jornada aplicada a ${ids.length} funcionário(s) a partir de ${inicio.split("-").reverse().join("/")}.` };
}

/** PIN do relógio da filial (4 a 6 números). O próprio funcionário ou o gestor da filial. */
export async function definirPin(employeeId: string, _prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const pin = texto(fd, "pin") ?? "";
  const conf = texto(fd, "confirmacao") ?? "";
  if (!/^\d{4,6}$/.test(pin)) return { erro: "O PIN tem de ter de 4 a 6 números." };
  if (pin !== conf) return { erro: "A confirmação não bate com o PIN." };
  if (/^(\d)\1+$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) return { erro: "PIN fácil demais (repetido ou em sequência). Escolha outro." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("ponto_definir_pin", { p_employee: employeeId, p_pin: pin });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto/equipe");
  revalidatePath("/ponto/registrar");
  return { ok: "PIN definido." };
}
