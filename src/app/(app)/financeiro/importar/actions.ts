"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessao } from "@/lib/auth/session";
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
  /** "importar novo mês": meses que o arquivo trazia e quantas linhas de outros meses ficaram de fora */
  meses?: { mes: string; qtd: number }[];
  foraDoMes?: number;
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Telas que usam esta importação e para onde ela volta depois de gravar. */
const VOLTAS = new Set(["/financeiro/importar", "/financeiro/caixa-contabil/importar"]);

const MAX_ARQUIVO = 25 * 1024 * 1024;
const ESPECIAIS: Record<string, string> = { TERCEIRIZADAS: "TERC", TELEVENDAS: "TLV", "423 - ADMINISTRATIVO 20-82": "F423" };

function texto(fd: FormData, nome: string) {
  const v = fd.get(nome);
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/**
 * Unidade pelo texto do Omie: CNPJ → código Fxxx → nomes especiais. O CNPJ vale para TODAS as unidades, inclusive as
 * de código sem número (terceirizadas como CIRLEI, JERIVA, RFA, ELEGANCE e a TRIO), que o departamento do Omie traz
 * pelo CNPJ.
 */
async function montarResolvedor(): Promise<{ resolver: ResolverUnidade; rotulo: Map<string, string> }> {
  const supabase = await createClient();
  const [{ data: comCnpj, error }, unidades] = await Promise.all([supabase.from("branches").select("id, cnpj").not("cnpj", "is", null), listarUnidadesFinanceiro()]);
  if (error) throw new Error(error.message);
  const porCodigo = new Map(unidades.map((u) => [u.codigo.toUpperCase(), u]));
  const porCnpj = new Map<string, string>();
  for (const b of comCnpj ?? []) {
    const cnpj = (b.cnpj ?? "").replace(/\D/g, "");
    if (cnpj.length === 14) porCnpj.set(cnpj, b.id);
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
  const mesTxt = texto(fd, "mes");
  const mes = mesTxt && MES.test(mesTxt) ? mesTxt : null; // relatório em tabela (sem data) entra neste mês
  const { resolver, rotulo } = await montarResolvedor();
  const leituras: LeituraArquivo[] = [];
  const itens = [];
  for (const f of arquivos) {
    if (f.size > MAX_ARQUIVO) {
      leituras.push({ nome: f.name, formato: "desconhecido", lidos: 0, avisos: ["maior que 25 MB"], semUnidade: [], usaramReferencia: 0 });
      continue;
    }
    try {
      const r = lerPlanilhaOmie(f.name, Buffer.from(await f.arrayBuffer()), { ano, dataReferencia, resolverUnidade: resolver, mes });
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
  // "importar novo mês" (aba do Caixa contábil): só as linhas do mês escolhido entram; as dos outros meses ficam de fora
  const mesTxt = texto(fd, "mes");
  const mes = mesTxt && MES.test(mesTxt) ? mesTxt : null;
  const porMes = new Map<string, number>();
  for (const i of lidos.itens) porMes.set(i.data.slice(0, 7), (porMes.get(i.data.slice(0, 7)) ?? 0) + 1);
  const meses = [...porMes].map(([m, qtd]) => ({ mes: m, qtd })).sort((a, b) => a.mes.localeCompare(b.mes));
  const itensDoMes = mes ? lidos.itens.filter((i) => i.data.startsWith(mes)) : lidos.itens;
  const foraDoMes = lidos.itens.length - itensDoMes.length;
  if (mes && lidos.itens.length && !itensDoMes.length) {
    const tem = meses.map((m) => `${m.mes.slice(5)}/${m.mes.slice(0, 4)} (${m.qtd})`).join(", ");
    return { erro: `O arquivo não tem lançamentos de ${mes.slice(5)}/${mes.slice(0, 4)}. Meses no arquivo: ${tem}.`, leituras: lidos.leituras, meses, foraDoMes };
  }

  const supabase = await createClient();
  const admin = sessao.papel === "admin";
  let analise: Analise;
  try {
    analise = await analisarImportacao(supabase, itensDoMes, admin);
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
    revalidatePath("/financeiro/caixa-contabil");
    const voltar = texto(fd, "voltar");
    const destino = voltar && VOLTAS.has(voltar) ? voltar : "/financeiro/importar";
    redirect(`${destino}?lote=${r.loteId}&inseridos=${r.inseridos}&pulados=${r.pulados}${mes ? `&mes=${mes}` : ""}`);
  }

  const porSituacao: Record<string, number> = {};
  for (const i of analise.itens) porSituacao[i.situacao] = (porSituacao[i.situacao] ?? 0) + 1;
  const { itens, ...resto } = analise;
  return {
    leituras: lidos.leituras,
    meses,
    foraDoMes,
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
  const voltar = texto(fd, "voltar");
  const tela = voltar && VOLTAS.has(voltar) ? voltar : "/financeiro/importar";
  if (!podeExcluirLancamento(sessao.papel)) redirect(`${tela}?erro=${encodeURIComponent("Só Administrador e Financeiro desfazem importações.")}`);
  const supabase = await createClient();
  let removidos = 0;
  try {
    removidos = await desfazerLote(supabase, sessao.id, lote);
  } catch (e) {
    redirect(`${tela}?erro=${encodeURIComponent(e instanceof Error ? e.message : "falha")}`);
  }
  revalidatePath("/financeiro");
  revalidatePath("/financeiro/lancamentos");
  revalidatePath("/financeiro/importar");
  revalidatePath("/financeiro/caixa-contabil");
  redirect(`${tela}?desfeito=${removidos}`);
}
