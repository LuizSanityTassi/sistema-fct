"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { importarDre, previaDre, type PreviaDre } from "@/lib/financeiro/dre-contabil-importar";
import { createClient } from "@/lib/supabase/server";

export type ResultadoDre = { empresa: string; meses: string[]; filiais: number; valores: number };
export type EstadoDre = { erro?: string; previa?: PreviaDre; resultado?: ResultadoDre; nomeArquivo?: string };

const TAMANHO_MAXIMO = 4 * 1024 * 1024; // a Vercel aceita até 4,5 MB por envio; a planilha tem ~300 KB
const podeImportar = (papel: string) => papel === "admin" || papel === "financeiro" || papel === "contador";

async function lerEnvio(fd: FormData) {
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha a planilha (.xlsx)." } as const;
  if (!/\.xlsx?$/i.test(arquivo.name)) return { erro: "Envie a planilha do Excel (.xlsx)." } as const;
  if (arquivo.size > TAMANHO_MAXIMO) return { erro: "Planilha acima de 4 MB." } as const;
  return { buf: Buffer.from(await arquivo.arrayBuffer()), nome: arquivo.name } as const;
}

/** Passo 1: lê a planilha e mostra o que vai entrar (filiais, meses, conferência com o lucro da planilha). Não grava. */
export async function conferirPlanilhaDre(_prev: EstadoDre, fd: FormData): Promise<EstadoDre> {
  const sessao = await getSessao();
  if (!podeImportar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador importam a DRE." };
  const envio = await lerEnvio(fd);
  if ("erro" in envio) return { erro: envio.erro };
  try {
    const previa = await previaDre(await createClient(), envio.buf);
    return { previa, nomeArquivo: envio.nome };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler a planilha." };
  }
}

/** Passo 2: grava. Os meses do arquivo substituem os mesmos meses já importados daquela empresa. */
export async function importarPlanilhaDre(_prev: EstadoDre, fd: FormData): Promise<EstadoDre> {
  const sessao = await getSessao();
  if (!podeImportar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador importam a DRE." };
  const envio = await lerEnvio(fd);
  if ("erro" in envio) return { erro: envio.erro };
  const supabase = await createClient();
  try {
    const r = await importarDre(supabase, envio.buf, envio.nome);
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "dre_contabil", registroId: r.id, novo: { arquivo: envio.nome, empresa: r.empresa, meses: r.meses, filiais: r.filiais, valores: r.valores } });
    revalidatePath("/financeiro/dre");
    return { resultado: { empresa: r.empresa, meses: r.meses, filiais: r.filiais, valores: r.valores } };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui importar." };
  }
}
