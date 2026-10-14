"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
import { mapaFiliais } from "@/lib/data/conciliacao";
import { ehUuid } from "@/lib/data/filiais";
import { listarUnidadesFinanceiro } from "@/lib/data/financeiro";
import { analisarImportacao, executarImportacao, desfazerLote, lerPlanilhaOmie, type Analise, type LeituraArquivo, type ResolverUnidade } from "@/lib/financeiro/importacao-omie";
import { podeExcluirLancamento, podeLancar } from "@/lib/financeiro/permissoes";
import { createClient } from "@/lib/supabase/server";

export type AmostraItem = { unidade: string; tipo: string; grupo: string; categoria: string; valor: number; data: string; situacao: string };
export type EstadoImportacao = {
  erro?: string;
  leituras?: LeituraArquivo[];
  analise?: Omit<Analise, "itens"> & { amostra: AmostraItem[]; porSituacao: Record<string, number> };
};

const MAX_ARQUIVO = 25 * 1024 * 1024;
const ESPECIAIS: Record<string, string> = { TERCEIRIZADAS: "TERC", TELEVENDAS: "TLV", "423 - ADMINISTRATIVO 20-82": "F423" };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Unidade pelo texto do Omie: CNPJ → código Fxxx → nomes especiais. */
async function montarResolvedor(): Promise<{ resolver: ResolverUnidade; rotulo: Map<string, string> }> {
  const [filiais, unidades] = await Promise.all([mapaFiliais(), listarUnidadesFinanceiro()]);
  const porCodigo = new Map(unidades.map((u) => [u.codigo.toUpperCase(), u]));
  const porCnpj = new Map<string, string>();
  for (const [cnpj, n] of filiais.porCnpj) {
    const b = filiais.porFilial.get(n);
    if (b) porCnpj.set(cnpj, b.id);
  }
  const rotulo = new Map(unidades.map((u) => [u.id, `${u.codigo} ${u.nome}`]));
  const resolver: ResolverUnidade = (textoFilial) => {
    const t = textoFilial.replace(/\s+/g, " ").trim();
    const cnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.exec(t)?.[0] ?? (/^\d{14}$/.test(t.replace(/\D/g, "")) ? t.replace(/\D/g, "") : null);
    if (cnpj) {
      const id = porCnpj.get(cnpj.replace(/\D/g, ""));
      if (id) return id;
    }
    const esp = ESPECIAIS[t.toUpperCase()];
    if (esp) return porCodigo.get(esp)?.id ?? null;
    const cod = /\bF\d{3}\b/i.exec(t)?.[0]?.toUpperCase();
    if (cod) return porCodigo.get(cod)?.id ?? null;
    return porCodigo.get(t.toUpperCase())?.id ?? null;
  };
  return { resolver, rotulo };
}

async function lerArquivos(fd: FormData) {
  const arquivos = fd.getAll("arquivos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) throw new Error("Escolha pelo menos um arquivo .xlsx do Omie.");
  if (arquivos.length > 10) throw new Error("Envie até 10 arquivos por vez.");
  const anoTxt = texto(fd, "ano");
  const ano = anoTxt && /^\d{4}$/.test(anoTxt) ? Number(anoTxt) : new Date().getFullYear();
  const ref = texto(fd, "referencia");
  const dataReferencia = ref && /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : new Date().toISOString().slice(0, 10);
  const { resolver, rotulo } = await montarResolvedor();
  const leituras: LeituraArquivo[] = [];
  const itens = [];
  for (const f of arquivos) {
    if (f.size > MAX_ARQUIVO) {
      leituras.push({ nome: f.name, formato: "desconhecido", lidos: 0, avisos: ["maior que 25 MB"], semUnidade: [], usaramReferencia: 0 });
      continue;
    }
    try {
      const r = lerPlanilhaOmie(f.name, Buffer.from(await f.arrayBuffer()), { ano, dataReferencia, resolverUnidade: resolver });
      leituras.push(r.leitura);
      itens.push(...r.itens);
    } catch (e) {
      leituras.push({ nome: f.name, formato: "desconhecido", lidos: 0, avisos: [e instanceof Error ? e.message : "erro ao ler"], semUnidade: [], usaramReferencia: 0 });
    }
  }
  return { leituras, itens, rotulo, nomes: arquivos.map((a) => a.name) };
}

/** Uma ação para as duas etapas: "analisar" mostra a prévia; "importar" grava (os mesmos arquivos vêm de novo). */
export async function importarOmie(_prev: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!podeLancar(sessao.papel)) return { erro: "Só Administrador, Financeiro e Contador importam lançamentos." };
  const etapa = texto(fd, "etapa") === "importar" ? "importar" : "analisar";
  let lidos: Awaited<ReturnType<typeof lerArquivos>>;
  try {
    lidos = await lerArquivos(fd);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível ler os arquivos." };
  }
  const supabase = await createClient();
  const admin = sessao.papel === "admin";
  let analise: Analise;
  try {
    analise = await analisarImportacao(supabase, lidos.itens, admin);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível analisar.", leituras: lidos.leituras };
  }

  if (etapa === "importar") {
    const incluirDuplicados = fd.get("incluir_duplicados") === "on";
    let r: Awaited<ReturnType<typeof executarImportacao>>;
    try {
      r = await executarImportacao(supabase, sessao.id, analise, incluirDuplicados, lidos.nomes);
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível importar.", leituras: lidos.leituras };
    }
    revalidatePath("/financeiro");
    revalidatePath("/financeiro/lancamentos");
    revalidatePath("/financeiro/importar");
    redirect(`/financeiro/importar?lote=${r.loteId}&inseridos=${r.inseridos}&pulados=${r.pulados}`);
  }

  const porSituacao: Record<string, number> = {};
  for (const i of analise.itens) porSituacao[i.situacao] = (porSituacao[i.situacao] ?? 0) + 1;
  const { itens, ...resto } = analise;
  return {
    leituras: lidos.leituras,
    analise: {
      ...resto,
      porSituacao,
      amostra: itens.slice(0, 150).map((i) => ({ unidade: lidos.rotulo.get(i.branchId ?? "") ?? i.filialTexto, tipo: i.tipo, grupo: i.grupoFinal, categoria: i.categoria, valor: i.valor, data: i.data, situacao: i.situacao })),
    },
  };
}

export async function desfazerLoteImportacao(fd: FormData) {
  const sessao = await getSessao();
  const lote = texto(fd, "lote");
  if (!lote || !ehUuid(lote)) return;
  if (!podeExcluirLancamento(sessao.papel)) redirect(`/financeiro/importar?erro=${encodeURIComponent("Só Administrador e Financeiro desfazem importações.")}`);
  const supabase = await createClient();
  let removidos = 0;
  try {
    removidos = await desfazerLote(supabase, sessao.id, lote);
  } catch (e) {
    redirect(`/financeiro/importar?erro=${encodeURIComponent(e instanceof Error ? e.message : "falha")}`);
  }
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/importar");
  redirect(`/financeiro/importar?desfeito=${removidos}`);
}
