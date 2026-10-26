"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { administraPonto, lerUuid } from "@/lib/data/ponto";
import { mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const TIPOS = ["compensacao", "pagamento", "ajuste", "saldo_inicial"] as const;

/** "1:30" → 90; "1,5" → 90; "45" (sem separador) → 45 minutos? Não: número inteiro = horas. */
function lerHoras(t: string | undefined): number | null {
  if (!t) return null;
  const s = t.replace(/\s/g, "");
  const hm = /^(\d{1,4}):([0-5]\d)$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const dec = /^\d{1,4}([.,]\d{1,2})?$/.test(s) ? Number(s.replace(",", ".")) : NaN;
  return Number.isFinite(dec) ? Math.round(dec * 60) : null;
}

/** Lançamento manual no banco (compensação, pagamento em folha, ajuste, saldo inicial). Só admin e RH. */
export async function lancarMovimento(employeeId: string, _prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return { erro: "Só Administrador e RH lançam no banco de horas." };
  const tipo = texto(fd, "tipo") as (typeof TIPOS)[number] | undefined;
  const data = texto(fd, "data");
  const minutos = lerHoras(texto(fd, "horas"));
  const sinal = texto(fd, "sinal") === "-" ? -1 : 1;
  const descricao = texto(fd, "descricao") ?? null;
  const erros: Record<string, string> = {};
  if (!tipo || !TIPOS.includes(tipo)) erros.tipo = "Escolha o tipo.";
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) erros.data = "Informe a data.";
  if (!minutos) erros.horas = "Use H:MM (ex.: 2:30) ou horas decimais (2,5).";
  if (!descricao || descricao.length < 3) erros.descricao = "Explique o lançamento (aparece no histórico).";
  if (descricao && descricao.length > 300) erros.descricao = "Máximo de 300 caracteres.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };
  const supabase = await createClient();
  const { error } = await supabase.from("ponto_banco_movimentos").insert({ employee_id: employeeId, data: data!, minutos: sinal * minutos!, tipo: tipo!, descricao, registrado_por: sessao.id });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto", "layout");
  return { ok: "Lançamento registrado no banco de horas." };
}

/** Remove um lançamento manual (os de fechamento só saem reabrindo o mês). Só admin e RH. */
export async function removerMovimento(fd: FormData) {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return;
  const id = lerUuid(texto(fd, "id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("ponto_banco_movimentos").delete().eq("id", id).neq("tipo", "fechamento");
  revalidatePath("/ponto", "layout");
}
