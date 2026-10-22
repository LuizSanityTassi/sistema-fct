"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { podeConciliar } from "@/lib/conciliacao/permissoes";
import { cnpjValido, limparCnpj } from "@/lib/validacao/cnpj";
import { createClient } from "@/lib/supabase/server";

export type EstadoFilialGi = { erro?: string; erros?: Record<string, string> };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
};

const esquema = z.object({
  codigo: z.coerce.number({ error: "Informe o número da filial no Trier." }).int("Só números.").min(1, "De 1 a 9999.").max(9999, "De 1 a 9999."),
  nome: z.string().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  // o banco manda o CNPJ do pagador só com números: o cadastro também
  cnpj: z.string().refine((v) => !v || (/^\d{14}$/.test(limparCnpj(v)) && cnpjValido(v)), "CNPJ inválido."),
  departamento_omie: z.string().max(120, "Máximo de 120 caracteres."),
});

/**
 * Cadastra ou altera uma filial da GI (chave = número da filial no Trier). Na edição, `codigo_original` diz qual
 * registro trocar (o número pode mudar).
 */
export async function salvarFilialGi(_prev: EstadoFilialGi, fd: FormData): Promise<EstadoFilialGi> {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram as filiais da GI." };
  const r = esquema.safeParse({ codigo: texto(fd, "codigo"), nome: texto(fd, "nome"), cnpj: texto(fd, "cnpj"), departamento_omie: texto(fd, "departamento_omie") });
  if (!r.success) {
    const { fieldErrors } = z.flattenError(r.error);
    return { erro: "Confira os campos destacados.", erros: Object.fromEntries(Object.entries(fieldErrors).map(([k, v]) => [k, (v as string[] | undefined)?.[0] ?? ""])) };
  }
  const original = Number.parseInt(texto(fd, "codigo_original"), 10);
  const registro = {
    codigo: r.data.codigo,
    nome: r.data.nome.toUpperCase(),
    cnpj: r.data.cnpj ? limparCnpj(r.data.cnpj) : null,
    departamento_omie: r.data.departamento_omie || null,
    ativo: fd.get("ativo") === "on",
    atualizado_por: sessao.id,
    atualizado_em: new Date().toISOString(),
  };
  const supabase = await createClient();
  const duplicado = (msg: string) => (/gi_conc_filiais_cnpj_uk/.test(msg) ? "Esse CNPJ já está em outra filial da GI." : /gi_conc_filiais_pkey|duplicate key/.test(msg) ? `Já existe a filial ${registro.codigo} na GI.` : msg);
  if (Number.isFinite(original)) {
    const { data: atual } = await supabase.from("gi_conc_filiais").select("*").eq("codigo", original).maybeSingle();
    if (!atual) return { erro: "Filial não encontrada (alguém pode ter excluído)." };
    const { error } = await supabase.from("gi_conc_filiais").update(registro).eq("codigo", original);
    if (error) return { erro: duplicado(error.message) };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "gi_conc_filiais", novo: { codigo: registro.codigo, ...dif.novo }, anterior: dif.anterior });
  } else {
    const { error } = await supabase.from("gi_conc_filiais").insert(registro);
    if (error) return { erro: duplicado(error.message) };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "gi_conc_filiais", novo: registro });
  }
  revalidatePath("/conciliacao-gi/filiais");
  revalidatePath("/conciliacao-gi");
  redirect("/conciliacao-gi/filiais?ok=1");
}

export async function excluirFilialGi(fd: FormData) {
  const sessao = await getSessao();
  if (!podeConciliar(sessao.papel)) return;
  const codigo = Number.parseInt(texto(fd, "codigo"), 10);
  if (!Number.isFinite(codigo)) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("gi_conc_filiais").delete().eq("codigo", codigo).select("*").maybeSingle();
  if (atual) await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "gi_conc_filiais", anterior: atual });
  revalidatePath("/conciliacao-gi/filiais");
  revalidatePath("/conciliacao-gi");
  redirect("/conciliacao-gi/filiais?ok=1");
}
