// Importação da planilha "DRE POR FILIAIS" do contador (só servidor): lê o Excel, liga cada aba à filial do cadastro
// (aba "CHAPECÓ 302" → F302, "TRIO" → TRIO), descobre a empresa pelas filiais e grava pela função do banco, que
// substitui os meses do arquivo de uma vez (tudo ou nada).
import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import type { Database, Json } from "@/lib/supabase/types";
import { montarImportacao, type Importacao } from "./dre-contabil";

type Cliente = SupabaseClient<Database>;

export type PreviaDre = Omit<Importacao, "valores" | "filiais"> & {
  empresa: string | null;
  filiais: { aba: string; codigo: string; nome: string | null; empresa: string | null }[];
  /** abas de filial cujo código não existe no cadastro (não dá para importar) */
  semCadastro: string[];
  valores: number;
  /** meses do arquivo que já estão no sistema (serão substituídos) */
  substitui: string[];
  erro?: string;
};

function abasDoArquivo(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  return wb.SheetNames.map((nome) => ({ nome, matriz: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true }) }));
}

async function prepararDre(supabase: Cliente, buf: Buffer) {
  const imp = montarImportacao(abasDoArquivo(buf));
  const codigos = imp.filiais.map((f) => f.codigo);
  const { data: lojas, error } = codigos.length
    ? await supabase.from("branches").select("id, codigo, nome, organizacao:organizations(nome_fantasia)").in("codigo", codigos)
    : { data: [], error: null };
  if (error) throw new Error(error.message);
  const porCodigo = new Map((lojas ?? []).map((l) => [l.codigo, { id: l.id, nome: l.nome, empresa: (l.organizacao as { nome_fantasia: string | null } | null)?.nome_fantasia ?? null }]));
  const filiais = imp.filiais.map((f) => ({ ...f, nome: porCodigo.get(f.codigo)?.nome ?? null, empresa: porCodigo.get(f.codigo)?.empresa ?? null }));
  const empresas = [...new Set(filiais.map((f) => f.empresa).filter((e): e is string => !!e))];
  return { imp, porCodigo, filiais, empresas };
}

/** Passo 1: confere a planilha (não grava nada). */
export async function previaDre(supabase: Cliente, buf: Buffer): Promise<PreviaDre> {
  const { imp, filiais, empresas } = await prepararDre(supabase, buf);
  const empresa = empresas.length === 1 ? empresas[0] : null;
  let substitui: string[] = [];
  if (empresa && imp.meses.length) {
    const { data } = await supabase.from("dre_contabil_importacoes").select("meses").eq("empresa", empresa);
    const ja = new Set((data ?? []).flatMap((r) => r.meses.map((m) => m.slice(0, 7))));
    substitui = imp.meses.filter((m) => ja.has(m));
  }
  const erro = !imp.filiais.length
    ? "Não achei as abas das filiais (“CHAPECÓ 302”, “TRIO”…) com os meses no cabeçalho. É a planilha DRE POR FILIAIS do contador?"
    : !imp.meses.length
      ? "Nenhum mês com vendas na planilha."
      : empresas.length > 1
        ? `A planilha mistura filiais de empresas diferentes (${empresas.join(", ")}): mande uma planilha por empresa.`
        : !empresa
          ? "Nenhuma aba corresponde a uma filial do cadastro."
          : undefined;
  return {
    ...imp,
    empresa,
    filiais,
    semCadastro: filiais.filter((f) => !f.nome).map((f) => f.aba),
    valores: imp.valores.length,
    substitui,
    erro,
  };
}

/**
 * Passo 2: grava. `somenteMeses` (aaaa-mm) limita a gravação a esses meses ("importar novo mês": a planilha do
 * contador traz o ano todo, mas só o mês escolhido entra); sem ele, todos os meses do arquivo. Os meses gravados
 * substituem os mesmos meses já importados daquela empresa; os outros não mudam.
 */
export async function importarDre(supabase: Cliente, buf: Buffer, arquivo: string, somenteMeses?: string[]) {
  const { imp, porCodigo, filiais, empresas } = await prepararDre(supabase, buf);
  if (empresas.length !== 1) throw new Error("Confira a planilha de novo: não deu para saber de qual empresa ela é.");
  const semCadastro = filiais.filter((f) => !f.nome);
  if (semCadastro.length) throw new Error(`Abas sem filial no cadastro: ${semCadastro.map((f) => f.aba).join(", ")}.`);
  if (!imp.meses.length) throw new Error("Nenhum mês com vendas na planilha.");
  const meses = somenteMeses ? imp.meses.filter((m) => somenteMeses.includes(m)) : imp.meses;
  if (!meses.length) throw new Error("O mês escolhido não está na planilha (ou ainda não tem vendas nela).");
  const valores = imp.valores
    .filter((v) => meses.includes(v.mes))
    .map((v) => ({ branch_id: v.codigo ? porCodigo.get(v.codigo)!.id : null, competencia: `${v.mes}-01`, linha: v.linha, valor: v.valor }));
  const avisos = { mesesSemVendas: imp.mesesSemVendas, diferencas: imp.diferencas, abasIgnoradas: imp.abasIgnoradas };
  const { data, error } = await supabase.rpc("dre_contabil_importar", {
    p_empresa: empresas[0],
    p_arquivo: arquivo,
    p_meses: meses.map((m) => `${m}-01`),
    p_valores: valores as unknown as Json,
    p_avisos: avisos as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return { id: data, empresa: empresas[0], meses, filiais: filiais.length, valores: valores.length };
}
