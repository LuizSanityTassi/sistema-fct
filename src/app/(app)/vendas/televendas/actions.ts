"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export type EstadoEquipeTele = { erro?: string; ok?: string };

const esquema = z.object({
  vendedor_codigo: z.coerce.number({ error: "Informe o código do vendedor no Trier." }).int("Código inválido.").positive("Código inválido."),
  nome: z.string().trim().min(2, "Informe o nome.").max(80),
  equipe: z.string().trim().min(2, "Informe a equipe (ex.: Criciúma).").max(40),
  funcao: z.string().trim().max(60).optional(),
});

/** Inclui (ou atualiza) um vendedor na equipe de televendas. Só admin. */
export async function salvarVendedorTele(_prev: EstadoEquipeTele, fd: FormData): Promise<EstadoEquipeTele> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador mexe na equipe de televendas." };
  const r = esquema.safeParse({ vendedor_codigo: fd.get("vendedor_codigo"), nome: fd.get("nome"), equipe: fd.get("equipe"), funcao: fd.get("funcao") || undefined });
  if (!r.success) return { erro: r.error.issues[0]?.message ?? "Confira os campos." };
  const supabase = await createClient();
  const linha = { ...r.data, nome: r.data.nome.toUpperCase(), funcao: r.data.funcao ?? null, atualizado_em: new Date().toISOString(), atualizado_por: sessao.id };
  const { error } = await supabase.from("vendas_televendas_vendedores").upsert(linha, { onConflict: "vendedor_codigo" });
  if (error) return { erro: `Não consegui salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "vendas_televendas_vendedores", novo: linha });
  revalidatePath("/vendas", "layout");
  return { ok: `${linha.nome} (${linha.vendedor_codigo}) está na equipe ${linha.equipe}.` };
}

/** Tira um vendedor da equipe (as vendas dele voltam a contar só na filial). Só admin. */
export async function tirarVendedorTele(fd: FormData) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return;
  const codigo = Number(fd.get("vendedor_codigo"));
  if (!Number.isInteger(codigo)) return;
  const supabase = await createClient();
  const { data: antes } = await supabase.from("vendas_televendas_vendedores").select("*").eq("vendedor_codigo", codigo).maybeSingle();
  const { error } = await supabase.from("vendas_televendas_vendedores").delete().eq("vendedor_codigo", codigo);
  if (error || !antes) return;
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "vendas_televendas_vendedores", anterior: antes });
  revalidatePath("/vendas", "layout");
}

/** Responsável do televendas: as quebras de caixa da equipe nascem com ele como gestor e as sangrias dela aparecem nas
 * pendências dele. Opcionalmente leva junto as quebras em aberto. Só admin. */
export async function salvarResponsavelTele(_prev: EstadoEquipeTele, fd: FormData): Promise<EstadoEquipeTele> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador define o responsável do televendas." };
  const id = String(fd.get("responsavel") ?? "");
  if (id && !ehUuid(id)) return { erro: "Usuário inválido." };
  const mover = fd.get("mover") === "on";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("televendas_definir_responsavel", { p_profile: id || null, p_mover: mover });
  if (error) return { erro: `Não consegui salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "sistema_config", novo: { televendas_responsavel: id || null, quebras_movidas: data ?? 0 } });
  revalidatePath("/vendas", "layout");
  revalidatePath("/caixa");
  return { ok: `${id ? "Responsável salvo" : "Sem responsável: as quebras do tele voltam para o gestor da loja"}${mover ? ` · ${data ?? 0} quebra(s) em aberto da equipe passaram ${id ? "para ele" : "para o gestor da loja"}` : ""}.` };
}
