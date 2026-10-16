"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { diferencas, registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerDecimal } from "@/lib/formatos";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/types";
import { EVENTOS_MANUAIS, prefixoPatrimonio, proximoPatrimonio, TIPOS_ATIVO, type TipoEventoAtivo } from "@/lib/ti/rotulos";

export type EstadoAtivo = { erro?: string; erros?: Record<string, string> };

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

async function exigirTi() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "ti" ? sessao : null;
}

const CODIGOS_TIPO = TIPOS_ATIVO.map((t) => t.codigo) as [string, ...string[]];

const esquema = z.object({
  branch_id: z.uuid({ error: "Selecione a unidade." }),
  tipo: z.enum(CODIGOS_TIPO, { error: "Escolha o tipo." }),
  descricao: z.string({ error: "Informe marca/modelo." }).trim().min(2, "Mínimo de 2 caracteres.").max(120, "Máximo de 120 caracteres."),
  patrimonio: z.string().trim().max(40, "Máximo de 40 caracteres.").optional(),
  numero_serie: z.string().trim().max(80, "Máximo de 80 caracteres.").optional(),
  status: z.enum(Constants.public.Enums.it_asset_status, { error: "Situação inválida." }),
  responsavel_employee_id: z.uuid({ error: "Responsável inválido." }).optional(),
  data_aquisicao: z.iso.date({ error: "Data inválida." }).optional(),
  valor: z.preprocess(
    (v) => (v === undefined ? undefined : typeof v === "string" ? (lerDecimal(v) ?? Number.NaN) : v),
    z.number({ error: "Valor inválido." }).min(0, "Não pode ser negativo.").max(10_000_000, "Valor muito alto.").optional(),
  ),
  fornecedor: z.string().trim().max(80, "Máximo de 80 caracteres.").optional(),
  observacoes: z.string().trim().max(1000, "Máximo de 1000 caracteres.").optional(),
  setor: z.string().trim().max(60, "Máximo de 60 caracteres.").optional(),
  hostname: z.string().trim().max(60, "Máximo de 60 caracteres.").optional(),
  ip: z.string().trim().max(45, "Máximo de 45 caracteres.").regex(/^[0-9a-fA-F.:/]+$/, "IP inválido (ex.: 192.168.0.10).").optional(),
  anydesk: z.string().trim().max(30, "Máximo de 30 caracteres.").optional(),
  garantia_ate: z.iso.date({ error: "Data inválida." }).optional(),
});

const CAMPOS = ["branch_id", "tipo", "descricao", "patrimonio", "numero_serie", "status", "responsavel_employee_id", "data_aquisicao", "valor", "fornecedor", "observacoes", "setor", "hostname", "ip", "anydesk", "garantia_ate"] as const;

/** Código patrimonial livre para a loja e o tipo (TI-F009-PC-003). */
async function gerarPatrimonio(supabase: Awaited<ReturnType<typeof createClient>>, branchId: string, tipo: string) {
  const { data: loja } = await supabase.from("branches").select("codigo").eq("id", branchId).maybeSingle();
  const prefixo = prefixoPatrimonio(loja?.codigo ?? "LOJA", tipo);
  const { data: usados } = await supabase.from("it_assets").select("patrimonio").like("patrimonio", `${prefixo}%`);
  return proximoPatrimonio(prefixo, (usados ?? []).map((u) => u.patrimonio));
}

export async function salvarAtivo(id: string | null, _prev: EstadoAtivo, fd: FormData): Promise<EstadoAtivo> {
  const sessao = await exigirTi();
  if (!sessao) return { erro: "Só Administrador e TI alteram o inventário." };

  const r = esquema.safeParse(Object.fromEntries(CAMPOS.map((c) => [c, texto(fd, c)])));
  if (!r.success) return { erro: "Confira os campos destacados.", erros: errosDoZod(r.error) };
  const d = r.data;
  const registro = {
    branch_id: d.branch_id,
    tipo: d.tipo,
    descricao: d.descricao,
    patrimonio: d.patrimonio ?? null,
    numero_serie: d.numero_serie ?? null,
    status: d.status,
    responsavel_employee_id: d.responsavel_employee_id ?? null,
    data_aquisicao: d.data_aquisicao ?? null,
    valor: d.valor ?? null,
    fornecedor: d.fornecedor ?? null,
    observacoes: d.observacoes ?? null,
    setor: d.setor ?? null,
    hostname: d.hostname ?? null,
    ip: d.ip ?? null,
    anydesk: d.anydesk ?? null,
    garantia_ate: d.garantia_ate ?? null,
  };

  const supabase = await createClient();
  // patrimônio em branco: o sistema gera o código da etiqueta (TI-loja-tipo-número)
  if (!registro.patrimonio) registro.patrimonio = await gerarPatrimonio(supabase, registro.branch_id, registro.tipo);
  let destino = id;
  if (id) {
    const { data: atual } = await supabase.from("it_assets").select("*").eq("id", id).maybeSingle();
    if (!atual) return { erro: "Ativo não encontrado." };
    const { error } = await supabase.from("it_assets").update(registro).eq("id", id);
    if (error) return { erro: error.code === "23505" ? "Já existe um ativo com esse patrimônio." : `Não foi possível salvar: ${error.message}` };
    const dif = diferencas(atual, registro);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "it_assets", registroId: id, anterior: dif.anterior, novo: dif.novo });
  } else {
    const { data: criado, error } = await supabase.from("it_assets").insert(registro).select("id").single();
    if (error) return { erro: error.code === "23505" ? "Já existe um ativo com esse patrimônio." : `Não foi possível salvar: ${error.message}` };
    destino = criado.id;
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "it_assets", registroId: destino, novo: registro });
  }
  revalidatePath("/ti");
  revalidatePath("/ti/ativos");
  revalidatePath(`/ti/ativos/${destino}`);
  redirect(`/ti/ativos/${destino}?salvo=1`);
}

/** Muda a situação do ativo (uso / estoque / manutenção / baixado). Só admin/TI. */
export async function alterarStatusAtivo(fd: FormData) {
  const sessao = await exigirTi();
  if (!sessao) return;
  const id = String(fd.get("id") ?? "");
  const parse = z.enum(Constants.public.Enums.it_asset_status).safeParse(fd.get("status"));
  if (!parse.success) return;
  const supabase = await createClient();
  const { data: atual } = await supabase.from("it_assets").select("id, status, branch_id").eq("id", id).maybeSingle();
  if (!atual || atual.status === parse.data) return;
  const { error } = await supabase.from("it_assets").update({ status: parse.data }).eq("id", id);
  if (error) return;
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: parse.data === "baixado" ? "inativar" : "editar",
    entidade: "it_assets",
    registroId: id,
    anterior: { status: atual.status },
    novo: { status: parse.data },
  });
  revalidatePath("/ti");
  revalidatePath("/ti/ativos");
  revalidatePath(`/ti/ativos/${id}`);
}

export type EstadoEvento = { erro?: string; ok?: string };

/** Registro manual no histórico do equipamento (manutenção, troca de peça, anotação). */
export async function registrarEventoAtivo(assetId: string, _prev: EstadoEvento, fd: FormData): Promise<EstadoEvento> {
  const sessao = await exigirTi();
  if (!sessao) return { erro: "Só Administrador e TI registram no histórico." };
  const tipo = texto(fd, "tipo") as TipoEventoAtivo | undefined;
  const descricao = (texto(fd, "descricao") ?? "").slice(0, 1000);
  const data = texto(fd, "data");
  if (!tipo || !EVENTOS_MANUAIS.includes(tipo)) return { erro: "Escolha o tipo." };
  if (descricao.length < 2) return { erro: "Descreva o que foi feito." };
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." };
  const supabase = await createClient();
  const { error } = await supabase.from("it_asset_eventos").insert({ asset_id: assetId, tipo, descricao, autor_nome: sessao.nome, ...(data ? { data } : {}) });
  if (error) return { erro: `Não foi possível registrar: ${error.message}` };
  revalidatePath(`/ti/ativos/${assetId}`);
  return { ok: "Registrado no histórico." };
}
