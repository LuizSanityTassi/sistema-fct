"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { podeEditarCategorias } from "@/lib/financeiro/permissoes";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";

export type EstadoCategoria = { erro?: string; erros?: Record<string, string> };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t;
}

function errosDoZod(e: z.ZodError) {
  const { fieldErrors } = z.flattenError(e);
  const erros: Record<string, string> = {};
  for (const [campo, mensagens] of Object.entries(fieldErrors)) {
    const primeira = (mensagens as string[] | undefined)?.[0];
    if (primeira) erros[campo] = primeira;
  }
  return erros;
}

const rotulo = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres.`).optional();

const esquema = z.object({
  tipo: z.enum(Constants.public.Enums.fin_tipo, { error: "Escolha entre receber e pagar." }),
  grupo: z.string({ error: "Informe o grupo." }).trim().min(2, "Mínimo de 2 caracteres.").max(60, "Máximo de 60 caracteres."),
  nome: z.string({ error: "Informe o nome." }).trim().min(2, "Mínimo de 2 caracteres.").max(80, "Máximo de 80 caracteres."),
  dre_familia: rotulo(60),
  dre_grupo: rotulo(60),
  dre_sinal: z.enum(["1", "-1"], { error: "Sinal inválido." }).optional(),
  fin_familia: rotulo(60),
  fin_grupo: rotulo(60),
});

const CAMPOS = ["tipo", "grupo", "nome", "dre_familia", "dre_grupo", "dre_sinal", "fin_familia", "fin_grupo"] as const;

export async function salvarCategoria(id: string | null, _prev: EstadoCategoria, fd: FormData): Promise<EstadoCategoria> {
  const sessao = await getSessao();
  if (!podeEditarCategorias(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador alteram categorias." };

  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;
  const registro = {
    tipo: d.tipo,
    grupo: d.grupo,
    nome: d.nome,
    dre_familia: d.dre_familia ?? null,
    dre_grupo: d.dre_grupo ?? null,
    dre_sinal: d.dre_sinal ? Number(d.dre_sinal) : null,
    fin_familia: d.fin_familia ?? null,
    fin_grupo: d.fin_grupo ?? null,
    ativo: id ? fd.get("ativo") === "on" : true,
  };

  const supabase = await createClient();
  const duplicada = (codigo?: string) => codigo === "23505";
  if (id) {
    const { data: atual } = await supabase.from("fin_categorias").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Categoria não encontrada." };
    const { error } = await supabase.from("fin_categorias").update(registro).eq("id", id);
    if (error) return { erro: duplicada(error.code) ? "Já existe uma categoria com esse nome nesse grupo." : `Não foi possível salvar: ${error.message}` };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_categorias", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criada, error } = await supabase.from("fin_categorias").insert(registro).select("id").single();
    if (error) return { erro: duplicada(error.code) ? "Já existe uma categoria com esse nome nesse grupo." : `Não foi possível salvar: ${error.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "fin_categorias", registroId: criada.id, novo: registro });
  }

  revalidatePath("/financeiro/categorias");
  revalidatePath("/financeiro/lancamentos");
  redirect("/financeiro/categorias?salvo=1");
}
