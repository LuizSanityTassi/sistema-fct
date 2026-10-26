"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { gerePonto, lerUuid } from "@/lib/data/ponto";
import { TIPOS_AUSENCIA, type TipoAusencia } from "@/lib/ponto/calculo";
import { mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Férias, atestado, afastamento, licença, abono ou folga compensatória: o dia não vira falta. */
export async function lancarAusencia(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!gerePonto(sessao) || sessao.papel === "coordenador") return { erro: "Só Administrador, RH e o gerente da filial lançam ausências." };
  const employeeId = lerUuid(texto(fd, "employee_id"));
  const tipo = texto(fd, "tipo") as TipoAusencia | undefined;
  const inicio = texto(fd, "inicio");
  const fim = texto(fd, "fim") ?? inicio;
  const observacao = texto(fd, "observacao") ?? null;
  const erros: Record<string, string> = {};
  if (!employeeId) erros.employee_id = "Escolha o funcionário.";
  if (!tipo || !TIPOS_AUSENCIA.includes(tipo)) erros.tipo = "Escolha o tipo.";
  if (!inicio || !DATA_RE.test(inicio)) erros.inicio = "Informe o primeiro dia.";
  if (!fim || !DATA_RE.test(fim) || (inicio && fim < inicio)) erros.fim = "O último dia não pode ser antes do primeiro.";
  if (observacao && observacao.length > 300) erros.observacao = "Máximo de 300 caracteres.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };
  const supabase = await createClient();
  const { data: sobrepostas } = await supabase.from("ponto_ausencias").select("id").eq("employee_id", employeeId!).lte("inicio", fim!).gte("fim", inicio!).limit(1);
  if (sobrepostas?.length) return { erro: "Já existe uma ausência deste funcionário nesse período. Remova ou ajuste a outra antes." };
  const { error } = await supabase.from("ponto_ausencias").insert({ employee_id: employeeId!, tipo: tipo!, inicio: inicio!, fim: fim!, observacao, registrado_por: sessao.id });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto", "layout");
  return { ok: "Ausência lançada." };
}

export async function removerAusencia(fd: FormData) {
  const sessao = await getSessao();
  if (!gerePonto(sessao) || sessao.papel === "coordenador") return;
  const id = lerUuid(texto(fd, "id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("ponto_ausencias").delete().eq("id", id);
  revalidatePath("/ponto", "layout");
}
