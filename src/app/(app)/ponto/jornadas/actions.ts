"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { administraPonto, lerUuid } from "@/lib/data/ponto";
import { minutosPrevistos } from "@/lib/ponto/calculo";
import { lerHorario, mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Cria ou altera um modelo de jornada com os dias. Só admin e RH. */
export async function salvarJornada(id: string | null, _prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return { erro: "Só Administrador e RH configuram jornadas." };

  const erros: Record<string, string> = {};
  const nome = texto(fd, "nome") ?? "";
  if (nome.length < 2 || nome.length > 80) erros.nome = "Dê um nome de 2 a 80 letras.";
  const descricao = texto(fd, "descricao") ?? null;
  if (descricao && descricao.length > 300) erros.descricao = "Máximo de 300 caracteres.";
  const tipo = texto(fd, "tipo") === "ciclo" ? "ciclo" : "semanal";
  const branch = lerUuid(texto(fd, "branch_id")) ?? null;
  const tolerancia = Number(texto(fd, "tolerancia_min") ?? "10");
  if (!Number.isInteger(tolerancia) || tolerancia < 0 || tolerancia > 60) erros.tolerancia_min = "De 0 a 60 minutos.";
  const ativo = fd.get("ativo") === "on";
  let cicloDias: number | null = null;
  let dataBase: string | null = null;
  if (tipo === "ciclo") {
    cicloDias = Number(texto(fd, "ciclo_dias"));
    if (!Number.isInteger(cicloDias) || cicloDias < 1 || cicloDias > 62) erros.ciclo_dias = "De 1 a 62 dias.";
    dataBase = texto(fd, "data_base") ?? null;
    if (!dataBase || !DATA_RE.test(dataBase)) erros.data_base = "Informe o 1º dia do ciclo.";
  }
  const qtd = tipo === "semanal" ? 7 : Math.max(0, Math.min(62, cicloDias ?? 0));
  const dias = [];
  for (let pos = 0; pos < qtd; pos++) {
    const folga = fd.get(`d${pos}_folga`) === "on";
    const h = {
      entrada: lerHorario(fd, `d${pos}_entrada`),
      intervalo_inicio: lerHorario(fd, `d${pos}_intervalo_inicio`),
      intervalo_fim: lerHorario(fd, `d${pos}_intervalo_fim`),
      saida: lerHorario(fd, `d${pos}_saida`),
    };
    if (Object.values(h).some((v) => v === undefined)) erros[`d${pos}`] = "Horário inválido (use HH:MM).";
    else if (!folga && (!h.entrada || !h.saida)) erros[`d${pos}`] = "Informe entrada e saída, ou marque folga.";
    else if (!folga && !h.intervalo_inicio !== !h.intervalo_fim) erros[`d${pos}`] = "Informe o início e o fim do intervalo (ou nenhum).";
    else if (!folga && minutosPrevistos(h as never) > 16 * 60) erros[`d${pos}`] = "Mais de 16h no dia: confira os horários.";
    dias.push({
      posicao: pos,
      folga,
      entrada: folga ? null : (h.entrada ?? null),
      intervalo_inicio: folga ? null : (h.intervalo_inicio ?? null),
      intervalo_fim: folga ? null : (h.intervalo_fim ?? null),
      saida: folga ? null : (h.saida ?? null),
    });
  }
  if (dias.length && dias.every((d) => d.folga)) erros.dias = "A jornada precisa de pelo menos um dia de trabalho.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const registro = { nome, descricao, tipo, branch_id: branch, ciclo_dias: cicloDias, data_base: dataBase, tolerancia_min: tolerancia, ativo };
  let jornadaId = id;
  if (id) {
    const { error } = await supabase.from("ponto_jornadas").update(registro).eq("id", id);
    if (error) return { erro: mensagemBanco(error) };
    const { error: e2 } = await supabase.from("ponto_jornada_dias").delete().eq("jornada_id", id);
    if (e2) return { erro: mensagemBanco(e2) };
  } else {
    const { data, error } = await supabase.from("ponto_jornadas").insert({ ...registro, created_by: sessao.id }).select("id").single();
    if (error) return { erro: mensagemBanco(error) };
    jornadaId = data.id;
  }
  const { error: e3 } = await supabase.from("ponto_jornada_dias").insert(dias.map((d) => ({ ...d, jornada_id: jornadaId! })));
  if (e3) return { erro: mensagemBanco(e3, "A jornada foi salva, mas os dias não.") };
  revalidatePath("/ponto", "layout");
  redirect(`/ponto/jornadas?ok=${id ? "atualizada" : "criada"}`);
}

/** Jornada padrão da filial, início do controle e exigência de localização. Só admin e RH. */
export async function salvarConfigFilial(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return { erro: "Só Administrador e RH configuram a filial." };
  const branch = lerUuid(texto(fd, "branch_id"));
  if (!branch) return { erro: "Filial inválida." };
  const jornada = lerUuid(texto(fd, "jornada_padrao_id")) ?? null;
  const inicio = texto(fd, "inicio_controle");
  if (jornada && (!inicio || !DATA_RE.test(inicio))) return { erro: "Informe a partir de quando a jornada padrão vale." };
  const supabase = await createClient();
  const { error } = await supabase.from("ponto_config_filial").upsert({
    branch_id: branch,
    jornada_padrao_id: jornada,
    exige_localizacao: fd.get("exige_localizacao") === "on",
    ...(inicio ? { inicio_controle: inicio } : {}),
    atualizado_por: sessao.id,
    atualizado_em: new Date().toISOString(),
  });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto", "layout");
  return { ok: "Configuração da filial salva." };
}

/** Feriado nacional (sem filial) ou da filial. Só admin e RH. */
export async function salvarFeriado(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return { erro: "Só Administrador e RH cadastram feriados." };
  const data = texto(fd, "data");
  const nome = texto(fd, "nome") ?? "";
  const erros: Record<string, string> = {};
  if (!data || !DATA_RE.test(data)) erros.data = "Informe a data.";
  if (nome.length < 2 || nome.length > 80) erros.nome = "Informe o nome do feriado.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };
  const branch = lerUuid(texto(fd, "branch_id")) ?? null;
  const ab = texto(fd, "abrangencia");
  const abrangencia = branch ? (ab === "estadual" || ab === "empresa" ? ab : "municipal") : ab === "estadual" || ab === "empresa" ? ab : "nacional";
  const supabase = await createClient();
  const { error } = await supabase.from("ponto_feriados").insert({ data: data!, nome, abrangencia, branch_id: branch, created_by: sessao.id });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto", "layout");
  return { ok: `Feriado ${nome} cadastrado.` };
}

export async function removerFeriado(fd: FormData) {
  const sessao = await getSessao();
  if (!administraPonto(sessao)) return;
  const id = lerUuid(texto(fd, "id"));
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("ponto_feriados").delete().eq("id", id);
  revalidatePath("/ponto", "layout");
}
