"use server";

import { revalidatePath } from "next/cache";
import { getSessao } from "@/lib/auth/session";
import { gerePonto, lerUuid } from "@/lib/data/ponto";
import { diaSemana, intervaloDias, minutosPrevistos } from "@/lib/ponto/calculo";
import { lerHorario, mensagemBanco, texto, type EstadoPonto } from "@/lib/ponto/form";
import { createClient } from "@/lib/supabase/server";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function lerDia(fd: FormData) {
  const folga = texto(fd, "folga") === "sim";
  const h = {
    entrada: lerHorario(fd, "entrada"),
    intervalo_inicio: lerHorario(fd, "intervalo_inicio"),
    intervalo_fim: lerHorario(fd, "intervalo_fim"),
    saida: lerHorario(fd, "saida"),
  };
  if (Object.values(h).some((v) => v === undefined)) return { erro: "Horário inválido (use HH:MM)." } as const;
  if (!folga && (!h.entrada || !h.saida)) return { erro: "Informe entrada e saída, ou marque folga." } as const;
  if (!folga && !h.intervalo_inicio !== !h.intervalo_fim) return { erro: "Informe o início e o fim do intervalo (ou nenhum)." } as const;
  if (!folga && minutosPrevistos(h as never) > 16 * 60) return { erro: "Mais de 16h no dia: confira os horários." } as const;
  const motivo = texto(fd, "motivo") ?? null;
  if (motivo && motivo.length > 200) return { erro: "Motivo com no máximo 200 caracteres." } as const;
  return {
    dia: {
      folga,
      entrada: folga ? null : (h.entrada ?? null),
      intervalo_inicio: folga ? null : (h.intervalo_inicio ?? null),
      intervalo_fim: folga ? null : (h.intervalo_fim ?? null),
      saida: folga ? null : (h.saida ?? null),
      motivo,
    },
  } as const;
}

/**
 * Escala de um período: para os funcionários marcados, nos dias da semana escolhidos entre `de` e `ate`, vale o
 * horário (ou folga) informado no lugar da jornada. "Voltar à jornada" apaga a escala desses dias.
 */
export async function programarPeriodo(_prev: EstadoPonto, fd: FormData): Promise<EstadoPonto> {
  const sessao = await getSessao();
  if (!gerePonto(sessao) || sessao.papel === "coordenador") return { erro: "Só Administrador, RH e o gerente da filial montam a escala." };
  const ids = fd.getAll("ids").map((v) => lerUuid(v)).filter(Boolean) as string[];
  const de = texto(fd, "de");
  const ate = texto(fd, "ate");
  const dias = new Set(fd.getAll("dias").map(Number));
  const limpar = texto(fd, "modo") === "limpar";
  if (!ids.length) return { erro: "Marque pelo menos um funcionário na grade." };
  if (!de || !ate || !DATA_RE.test(de) || !DATA_RE.test(ate) || ate < de) return { erro: "Informe o período (de / até)." };
  const datas = intervaloDias(de, ate).filter((d) => dias.has(diaSemana(d)));
  if (!datas.length) return { erro: "Nenhum dia do período cai nos dias da semana marcados." };
  if (datas.length > 62) return { erro: "Período grande demais (máximo de 62 dias por vez)." };
  const supabase = await createClient();

  if (limpar) {
    const { error } = await supabase.from("ponto_programacao").delete().in("employee_id", ids).in("data", datas);
    if (error) return { erro: mensagemBanco(error) };
    revalidatePath("/ponto", "layout");
    return { ok: `Escala removida: ${datas.length} dia(s) de ${ids.length} funcionário(s) voltam à jornada.` };
  }
  const r = lerDia(fd);
  if ("erro" in r) return { erro: r.erro };
  const linhas = ids.flatMap((employee_id) => datas.map((data) => ({ employee_id, data, ...r.dia, definido_por: sessao.id, definido_em: new Date().toISOString() })));
  const { error } = await supabase.from("ponto_programacao").upsert(linhas, { onConflict: "employee_id,data" });
  if (error) return { erro: mensagemBanco(error) };
  revalidatePath("/ponto", "layout");
  return { ok: `Escala salva: ${datas.length} dia(s) para ${ids.length} funcionário(s).` };
}
