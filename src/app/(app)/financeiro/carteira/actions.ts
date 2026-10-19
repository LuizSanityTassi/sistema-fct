"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehTipoConta } from "@/lib/financeiro/carteira";
import { ehGrupoFinanceiro } from "@/lib/financeiro/rotulos";
import { createClient } from "@/lib/supabase/server";

export type EstadoConta = { erro?: string; erros?: Record<string, string> };

const ROTA = "/financeiro/carteira";
const podeEditar = (papel: string) => papel === "admin" || papel === "financeiro";

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? undefined : t;
}

const esquema = z.object({
  apelido: z.string({ error: "Informe o apelido." }).trim().min(2, "Mínimo de 2 caracteres.").max(60, "Máximo de 60 caracteres."),
  banco: z.string().regex(/^\d{3}$/, "Código do banco com 3 números (ex.: 341).").optional(),
  agencia: z.string().max(20, "Máximo de 20 caracteres.").optional(),
  conta: z.string().max(30, "Máximo de 30 caracteres.").optional(),
  tipo: z.string().refine(ehTipoConta, "Escolha o tipo."),
  grupo: z.string().refine(ehGrupoFinanceiro, "Empresa inválida.").optional(),
  observacao: z.string().max(500, "Máximo de 500 caracteres.").optional(),
});
const CAMPOS = ["apelido", "banco", "agencia", "conta", "tipo", "grupo", "observacao"] as const;

/** Cadastra (id null) ou altera uma conta da carteira. */
export async function salvarConta(id: string | null, _prev: EstadoConta, fd: FormData): Promise<EstadoConta> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só Administrador e Financeiro alteram a carteira." };
  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) {
    const erros: Record<string, string> = {};
    for (const [campo, msgs] of Object.entries(z.flattenError(r.error).fieldErrors)) if ((msgs as string[] | undefined)?.[0]) erros[campo] = (msgs as string[])[0];
    return { erro: "Confira os campos destacados.", erros };
  }
  const d = r.data;
  const registro = {
    apelido: d.apelido.toUpperCase(),
    banco: d.banco ?? null,
    agencia: d.agencia ?? null,
    conta: d.conta ?? null,
    tipo: d.tipo,
    grupo: d.grupo ?? null,
    observacao: d.observacao ?? null,
    ativa: id ? fd.get("ativa") === "on" : true,
  };

  const supabase = await createClient();
  const repetido = (codigo?: string) => (codigo === "23505" ? "Já existe uma conta com esse apelido." : null);
  if (id) {
    const { data: atual } = await supabase.from("fin_contas_bancarias").select("apelido, banco, agencia, conta, tipo, grupo, observacao, ativa").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Conta não encontrada." };
    const { error } = await supabase.from("fin_contas_bancarias").update(registro).eq("id", id);
    if (error) return { erro: repetido(error.code) ?? `Não foi possível salvar: ${error.message}` };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: atual.ativa && !registro.ativa ? "inativar" : !atual.ativa && registro.ativa ? "reativar" : "editar", entidade: "fin_contas_bancarias", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criada, error } = await supabase.from("fin_contas_bancarias").insert(registro).select("id").single();
    if (error) return { erro: repetido(error.code) ?? `Não foi possível salvar: ${error.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "fin_contas_bancarias", registroId: criada.id, novo: registro });
  }
  revalidatePath(ROTA);
  redirect(`${ROTA}?salvo=1`);
}
