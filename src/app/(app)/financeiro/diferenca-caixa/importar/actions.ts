"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { importarPos, previaPos, type PreviaPos, type ResultadoPos } from "@/lib/caixa/importar-pos";
import { createClient } from "@/lib/supabase/server";

export type EstadoPos = { erro?: string; previa?: PreviaPos; resultado?: ResultadoPos; nomeArquivo?: string };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const TAMANHO_MAXIMO = 4 * 1024 * 1024; // a Vercel aceita até 4,5 MB por envio; a planilha tem ~200 KB

async function exigirFinanceiro() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "financeiro" ? sessao : null;
}

async function lerEnvio(fd: FormData) {
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha a planilha (.xlsx)." } as const;
  if (!/\.xlsx?$/i.test(arquivo.name)) return { erro: "Envie a planilha do Excel (.xlsx)." } as const;
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Planilha acima de 4 MB." } as const;
  const comp = fd.get("competencia");
  const competencia = typeof comp === "string" && MES.test(comp) ? comp : undefined;
  return { buf: Buffer.from(await arquivo.arrayBuffer()), nome: arquivo.name, competencia } as const;
}

/** Passo 1: lê a planilha e mostra o que vai virar quebra (e o que fica de fora, com o motivo). Não grava nada. */
export async function conferirPlanilhaPos(_prev: EstadoPos, fd: FormData): Promise<EstadoPos> {
  if (!(await exigirFinanceiro())) return { erro: "Só o financeiro e o administrador importam quebras." };
  const envio = await lerEnvio(fd);
  if ("erro" in envio) return { erro: envio.erro };
  try {
    const previa = await previaPos(await createClient(), envio.buf, envio.competencia);
    if (!previa.abas.length) return { erro: "Não achei os blocos das lojas (linha “F001 | data” e o cabeçalho “DATA | CÓD. VENDA | VALOR…”). É a planilha POS de quebra de caixa?" };
    return { previa, nomeArquivo: envio.nome };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
}

/** Passo 2: lança como quebra o que está "Vai lançar" na conferência (a mesma planilha é lida de novo). */
export async function lancarPlanilhaPos(_prev: EstadoPos, fd: FormData): Promise<EstadoPos> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro e o administrador importam quebras." };
  const envio = await lerEnvio(fd);
  if ("erro" in envio) return { erro: envio.erro };
  if (!envio.competencia) return { erro: "Escolha a competência da folha." };
  const supabase = await createClient();
  try {
    const resultado = await importarPos(supabase, sessao, envio.buf, envio.competencia);
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "importar",
      entidade: "caixa_diferencas",
      novo: { planilha_pos: envio.nome, competencia: envio.competencia, lote: resultado.lote, lancadas: resultado.lancadas, valor: resultado.valor, ignoradas: resultado.ignoradas },
    });
    revalidatePath("/financeiro/diferenca-caixa");
    revalidatePath("/caixa");
    return { resultado, nomeArquivo: envio.nome };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui lançar." };
  }
}

/** Desfaz uma importação: apaga as quebras do lote que ainda estão pendentes (a folha é recalculada pelo gatilho). */
export async function desfazerImportacaoPos(fd: FormData) {
  const sessao = await exigirFinanceiro();
  if (!sessao) return;
  const lote = fd.get("lote");
  if (typeof lote !== "string" || !/^[0-9a-f-]{36}$/i.test(lote)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("caixa_diferencas").delete().eq("lote_importacao", lote).eq("origem", "manual").eq("andamento", "pendente").select("id");
  if (error) redirect(`/financeiro/diferenca-caixa/importar?erro=${encodeURIComponent(error.message)}`);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "caixa_diferencas", novo: { desfez_lote_pos: lote, apagadas: data?.length ?? 0 } });
  revalidatePath("/financeiro/diferenca-caixa");
  revalidatePath("/caixa");
  redirect(`/financeiro/diferenca-caixa/importar?desfeito=${data?.length ?? 0}`);
}
