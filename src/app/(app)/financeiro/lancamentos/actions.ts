"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { mesFechado } from "@/lib/data/financeiro";
import { podeExcluirLancamento, podeFecharMes, podeLancar, podeReabrirMes } from "@/lib/financeiro/permissoes";
import { TIPO_FIN_LABEL } from "@/lib/financeiro/rotulos";
import { lerDecimal } from "@/lib/formatos";
import { competenciaValida } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";

export type EstadoLancamento = { erro?: string; erros?: Record<string, string> };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
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

const esquema = z.object({
  branch_id: z.uuid({ error: "Selecione a unidade." }),
  tipo: z.enum(Constants.public.Enums.fin_tipo, { error: "Escolha entre receber e pagar." }),
  categoria_id: z.uuid({ error: "Selecione a categoria." }),
  valor: z.preprocess(
    (v) => (typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: "Informe o valor." }).gt(0, "O valor precisa ser maior que zero.").max(100_000_000, "Valor muito alto."),
  ),
  data: z.iso.date({ error: "Informe uma data válida." }),
  descricao: z.string().trim().max(300, "Máximo de 300 caracteres.").optional(),
});

const CAMPOS = ["branch_id", "tipo", "categoria_id", "valor", "data", "descricao"] as const;

function revalidar() {
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
}

const mensagemFechado = (competencia: string) => `A competência ${competencia} está fechada. Peça ao administrador para reabrir.`;

export async function salvarLancamento(id: string | null, _prev: EstadoLancamento, fd: FormData): Promise<EstadoLancamento> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador lançam no financeiro." };

  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;
  const competencia = d.data.slice(0, 7);
  const admin = sessao.papel === "admin";
  if (!admin && (await mesFechado(competencia))) return { erro: mensagemFechado(competencia), erros: { data: "Mês fechado." } };

  const supabase = await createClient();
  const { data: categoria } = await supabase.from("fin_categorias").select("id, tipo, ativo").eq("id", d.categoria_id).maybeSingle();
  if (!categoria) return { erro: "Categoria não encontrada.", erros: { categoria_id: "Selecione uma categoria válida." } };
  if (categoria.tipo !== d.tipo) {
    return { erro: "A categoria não é do mesmo tipo do lançamento.", erros: { categoria_id: `Escolha uma categoria de "${TIPO_FIN_LABEL[d.tipo]}".` } };
  }

  const registro = {
    branch_id: d.branch_id,
    tipo: d.tipo,
    categoria_id: d.categoria_id,
    valor: Math.round(d.valor * 100) / 100,
    data: d.data,
    competencia,
    descricao: d.descricao ?? null,
  };

  if (id) {
    const { data: atual } = await supabase.from("fin_lancamentos").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Lançamento não encontrado." };
    if (!admin && (await mesFechado(atual.competencia.trim()))) return { erro: mensagemFechado(atual.competencia.trim()) };
    const { error } = await supabase.from("fin_lancamentos").update(registro).eq("id", id);
    if (error) return { erro: `Não foi possível salvar: ${error.message}` };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "fin_lancamentos", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    if (!categoria.ativo) return { erro: "Essa categoria está inativa.", erros: { categoria_id: "Escolha uma categoria ativa." } };
    const { data: criado, error } = await supabase
      .from("fin_lancamentos")
      .insert({ ...registro, origem: "manual", created_by: sessao.id })
      .select("id")
      .single();
    if (error) return { erro: `Não foi possível salvar: ${error.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "fin_lancamentos", registroId: criado.id, novo: registro });
  }

  revalidar();
  redirect(`/financeiro/lancamentos?competencia=${competencia}&salvo=1`);
}

/** Exclusão definitiva (há auditoria com o registro anterior). Só Administrador e Financeiro. */
export async function excluirLancamento(fd: FormData) {
  const sessao = await getSessao();
  if (!podeExcluirLancamento(sessao.papel)) return;
  const id = texto(fd, "id");
  if (!id) return;

  const supabase = await createClient();
  const { data: atual } = await supabase.from("fin_lancamentos").select("*").eq("id", id).maybeSingle();
  if (!atual) return;
  const competencia = atual.competencia.trim();
  if (sessao.papel !== "admin" && (await mesFechado(competencia))) {
    redirect(`/financeiro/lancamentos/${id}/editar?erro=${encodeURIComponent(mensagemFechado(competencia))}`);
  }
  const { error } = await supabase.from("fin_lancamentos").delete().eq("id", id);
  if (error) redirect(`/financeiro/lancamentos/${id}/editar?erro=${encodeURIComponent(error.message)}`);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "fin_lancamentos", registroId: id, anterior: atual });
  revalidar();
  redirect(`/financeiro/lancamentos?competencia=${competencia}&excluido=1`);
}

/** Fecha (admin/financeiro) ou reabre (admin) uma competência. Mês fechado bloqueia inclusão, edição e exclusão. */
export async function alterarFechamentoMes(fd: FormData) {
  const sessao = await getSessao();
  const competencia = texto(fd, "competencia");
  const acao = texto(fd, "acao");
  if (!competenciaValida(competencia) || (acao !== "fechar" && acao !== "reabrir")) return;
  if (acao === "fechar" && !podeFecharMes(sessao.papel)) return;
  if (acao === "reabrir" && !podeReabrirMes(sessao.papel)) return;

  const supabase = await createClient();
  const { error } =
    acao === "fechar"
      ? await supabase
          .from("fin_meses_fechados")
          .upsert({ competencia, fechado_por: sessao.id, fechado_em: new Date().toISOString() }, { onConflict: "competencia" })
      : await supabase.from("fin_meses_fechados").delete().eq("competencia", competencia);
  if (error) redirect(`/financeiro/lancamentos?competencia=${competencia}&erro=${encodeURIComponent(error.message)}`);

  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "fin_meses_fechados",
    anterior: { competencia, fechado: acao === "reabrir" },
    novo: { competencia, fechado: acao === "fechar" },
  });
  revalidar();
  redirect(`/financeiro/lancamentos?competencia=${competencia}&fechamento=${acao === "fechar" ? "fechado" : "reaberto"}`);
}
