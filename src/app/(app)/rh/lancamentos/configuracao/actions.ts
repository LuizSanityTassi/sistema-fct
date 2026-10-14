"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { carregarEventos } from "@/lib/data/lancamentos-folha";
import { normalizarNome } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";

export type EstadoConfig = { erro?: string; ok?: string };

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function inteiro(v: string, max: number): number | null | "invalido" {
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "invalido";
  const n = Number(v);
  return n > 0 && n <= max ? n : "invalido";
}

async function exigirRh() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "rh" ? sessao : null;
}

/** Códigos, nomes, ordem e uso na planilha dos eventos; também cria um evento novo. */
export async function salvarEventos(_prev: EstadoConfig, fd: FormData): Promise<EstadoConfig> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Sem permissão." };
  const supabase = await createClient();
  const atuais = await carregarEventos(supabase);

  const propostos = atuais.map((e) => {
    const codigo = inteiro(texto(fd, `codigo_${e.id}`), 99_999);
    const ordem = inteiro(texto(fd, `ordem_${e.id}`), 9_999);
    return {
      atual: e,
      codigo,
      nome: texto(fd, `nome_${e.id}`),
      ordem,
      unidade: texto(fd, `unidade_${e.id}`) === "horas" ? "horas" : "valor",
      naPlanilha: fd.get(`planilha_${e.id}`) === "on",
      ativo: fd.get(`ativo_${e.id}`) === "on",
    };
  });
  const novoNome = texto(fd, "novo_nome");
  const novoCodigo = inteiro(texto(fd, "novo_codigo"), 99_999);
  const novoOrdem = inteiro(texto(fd, "novo_ordem"), 9_999);

  for (const p of propostos) {
    if (!p.nome || p.nome.length > 60) return { erro: `Nome inválido no evento “${p.atual.nome}” (1 a 60 caracteres).` };
    if (p.codigo === "invalido") return { erro: `Código inválido em “${p.nome}” (número inteiro positivo).` };
    if (p.ordem === "invalido") return { erro: `Ordem inválida em “${p.nome}”.` };
    if (p.naPlanilha && p.codigo === null) return { erro: `“${p.nome}” só pode ir para a planilha com o código da Domínio.` };
  }
  if (novoNome && (novoNome.length > 60 || novoCodigo === "invalido" || novoOrdem === "invalido")) return { erro: "Confira o nome, o código e a ordem do evento novo." };
  const codigos = [...propostos.map((p) => p.codigo), novoNome ? novoCodigo : null].filter((c): c is number => typeof c === "number");
  const repetido = codigos.find((c, i) => codigos.indexOf(c) !== i);
  if (repetido) return { erro: `O código ${repetido} está em mais de um evento.` };

  // dois passos para não esbarrar no código único quando dois eventos trocam de código
  const mudados = propostos.filter(
    (p) => p.codigo !== p.atual.codigo || p.nome !== p.atual.nome || (p.ordem ?? 0) !== p.atual.ordem || p.unidade !== p.atual.unidade || p.naPlanilha !== p.atual.naPlanilha || p.ativo !== p.atual.ativo,
  );
  const trocaCodigo = mudados.filter((p) => p.codigo !== p.atual.codigo && p.atual.codigo !== null);
  for (const p of trocaCodigo) {
    const { error } = await supabase.from("folha_eventos").update({ codigo: null, na_planilha: false }).eq("id", p.atual.id);
    if (error) return { erro: error.message };
  }
  for (const p of mudados) {
    const { error } = await supabase
      .from("folha_eventos")
      .update({ codigo: p.codigo as number | null, nome: p.nome, ordem: (p.ordem as number | null) ?? 0, unidade: p.unidade, na_planilha: p.naPlanilha, ativo: p.ativo })
      .eq("id", p.atual.id);
    if (error) return { erro: `Não foi possível salvar “${p.nome}”: ${error.message}` };
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "folha_eventos",
      registroId: p.atual.id,
      anterior: { codigo: p.atual.codigo, nome: p.atual.nome, ordem: p.atual.ordem, unidade: p.atual.unidade, na_planilha: p.atual.naPlanilha, ativo: p.atual.ativo },
      novo: { codigo: p.codigo, nome: p.nome, ordem: p.ordem, unidade: p.unidade, na_planilha: p.naPlanilha, ativo: p.ativo },
    });
  }
  if (novoNome) {
    const base = normalizarNome(novoNome).toLowerCase().replace(/\s+/g, "_").slice(0, 40) || "evento";
    const chave = atuais.some((e) => e.chave === base) ? `${base}_${Date.now().toString(36)}` : base;
    const { data, error } = await supabase
      .from("folha_eventos")
      .insert({ chave, nome: novoNome, codigo: novoCodigo as number | null, ordem: (novoOrdem as number | null) ?? 900, unidade: texto(fd, "novo_unidade") === "horas" ? "horas" : "valor", na_planilha: novoCodigo !== null })
      .select("id")
      .single();
    if (error) return { erro: `Não foi possível criar o evento: ${error.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "folha_eventos", registroId: data.id, novo: { nome: novoNome, codigo: novoCodigo } });
  }
  revalidatePath("/rh/lancamentos", "layout");
  const n = mudados.length + (novoNome ? 1 : 0);
  return { ok: n ? `${n} evento(s) salvo(s).` : "Nada mudou." };
}

/** Código da empresa na Domínio e razão social da planilha, por CNPJ. */
export async function salvarEmpresasDominio(_prev: EstadoConfig, fd: FormData): Promise<EstadoConfig> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Sem permissão." };
  const ids = fd.getAll("branch").map(String);
  if (ids.length > 500) return { erro: "Dados inválidos." };
  const supabase = await createClient();
  const { data: atuais, error } = await supabase.from("folha_empresas_dominio").select("branch_id, codigo_dominio, razao_social").in("branch_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (error) return { erro: error.message };
  const porId = new Map(atuais.map((a) => [a.branch_id, a]));

  const mudancas: { branch_id: string; codigo_dominio: number | null; razao_social: string | null; updated_by: string }[] = [];
  for (const id of ids) {
    const codigo = inteiro(texto(fd, `codigo_${id}`), 9_999_999);
    const razao = texto(fd, `razao_${id}`).toUpperCase() || null;
    if (codigo === "invalido") return { erro: "Código da Domínio inválido: use só números." };
    if (razao && razao.length > 150) return { erro: "Razão social com mais de 150 caracteres." };
    const atual = porId.get(id);
    if ((atual?.codigo_dominio ?? null) === codigo && (atual?.razao_social ?? null) === razao) continue;
    mudancas.push({ branch_id: id, codigo_dominio: codigo, razao_social: razao, updated_by: sessao.id });
  }
  if (!mudancas.length) return { ok: "Nada mudou." };
  const { error: e2 } = await supabase.from("folha_empresas_dominio").upsert(mudancas, { onConflict: "branch_id" });
  if (e2) return { erro: `Não foi possível salvar: ${e2.message}` };
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "folha_empresas_dominio",
    novo: { alteradas: mudancas.map((m) => ({ branch_id: m.branch_id, codigo_dominio: m.codigo_dominio, razao_social: m.razao_social })) },
  });
  revalidatePath("/rh/lancamentos", "layout");
  return { ok: `${mudancas.length} CNPJ(s) salvo(s).` };
}
