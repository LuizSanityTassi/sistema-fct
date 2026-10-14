"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { executarMigracao, lerLegado, planejarMigracao, type Legado, type Plano, type ResultadoMigracao, type Seeds } from "@/lib/financeiro/migracao-legado";
import { createClient } from "@/lib/supabase/server";

export type EstadoMigracao = { erro?: string; plano?: Plano; resultado?: ResultadoMigracao; arquivos?: string[] };

async function lerArquivos(fd: FormData): Promise<{ legado: Legado; seeds: Seeds; nomes: string[] }> {
  const arquivos = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  const db = arquivos.find((f) => /\.db$|\.sqlite3?$/i.test(f.name));
  if (!db) throw new Error("Envie o arquivo fluxo-caixa.db (banco do sistema anterior).");
  if (db.size > 60 * 1024 * 1024) throw new Error("O banco é maior que 60 MB.");
  const seeds: Seeds = {};
  for (const f of arquivos) {
    if (!/\.json$/i.test(f.name)) continue;
    try {
      const j = JSON.parse(await f.text()) as Seeds;
      if (j.cat2cls) seeds.cat2cls = j.cat2cls;
      if (j.cat2fin) seeds.cat2fin = j.cat2fin;
      if (j.familias && j.cat2cls) seeds.familias = j.familias; // só o seed da DRE tem famílias com sinal
    } catch {
      throw new Error(`${f.name}: JSON inválido.`);
    }
  }
  const legado = await lerLegado(Buffer.from(await db.arrayBuffer()));
  return { legado, seeds, nomes: arquivos.map((a) => a.name) };
}

/** Etapa "analisar" mostra o plano; "executar" grava (os arquivos vêm de novo). Só administrador. */
export async function migrarLegado(_prev: EstadoMigracao, fd: FormData): Promise<EstadoMigracao> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador migra o sistema anterior." };
  const etapa = fd.get("etapa") === "executar" ? "executar" : "analisar";
  let lidos: Awaited<ReturnType<typeof lerArquivos>>;
  try {
    lidos = await lerArquivos(fd);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler os arquivos." };
  }
  const supabase = await createClient();
  try {
    if (etapa === "analisar") {
      const plano = await planejarMigracao(supabase, lidos.legado, lidos.seeds);
      return { plano, arquivos: lidos.nomes };
    }
    const resultado = await executarMigracao(supabase, sessao.id, lidos.legado, lidos.seeds);
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/categorias");
    revalidatePath("/filiais");
    redirect(`/financeiro/migrar?ok=1&inseridos=${resultado.inseridos}&ja=${resultado.jaExistiam}&unidades=${resultado.unidadesCriadas.length}&categorias=${resultado.categorias}`);
  } catch (e) {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
    if (typeof e === "object" && e && "digest" in e && String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    return { erro: e instanceof Error ? e.message : "Falha na migração.", arquivos: lidos.nomes };
  }
}
