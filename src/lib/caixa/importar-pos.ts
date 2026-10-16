// Importação da planilha POS do financeiro (só servidor): lê, liga cada venda à loja e ao funcionário (código de
// vendedor do Trier em caixa_operadores; sem ligação, pelo nome), mostra a prévia e grava como quebra lançada pelo
// financeiro (origem 'manual'), na competência da folha escolhida (a planilha vai de 21 a 20) e num lote que pode ser
// desfeito. A folha recebe pelo gatilho de sempre (farmacêutico não tem quebra; lançamento do RH não é sobrescrito).
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { chaveDaVenda, lerPlanilhaPos, type LinhaPrevia, type PreviaPos, type SituacaoPos } from "./planilha-pos";

export { ROTULO_SITUACAO_POS, type LinhaPrevia, type PreviaPos, type SituacaoPos } from "./planilha-pos";
import { sugerirFuncionario } from "./vinculo";

type Cliente = SupabaseClient<Database>;

const FARMACEUTICO = /FARMAC[EÊ]UTIC/i;

/** Competência sugerida: o mês do corte da planilha (21/08 a 20/09 → setembro). */
export const competenciaDoCorte = (corte: string | null) => (corte ? corte.slice(0, 7) : new Date().toISOString().slice(0, 7));

function lerArquivo(buf: Buffer, ano: number) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const abas = wb.SheetNames.map((nome) => ({ nome, matriz: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true }) }));
  return lerPlanilhaPos(abas, ano);
}

export async function previaPos(supabase: Cliente, buf: Buffer, competenciaPedida?: string): Promise<PreviaPos> {
  const planilha = lerArquivo(buf, competenciaPedida ? Number(competenciaPedida.slice(0, 4)) : new Date().getFullYear());
  const competencia = competenciaPedida ?? competenciaDoCorte(planilha.corte);
  const codigos = [...new Set(planilha.linhas.map((l) => l.vendedor).filter((v): v is number => v !== null))];
  const chaves = planilha.linhas.map(chaveDaVenda);
  const [{ data: lojas }, { data: funcionarios, error: eF }, { data: operadores }, { data: jaTem }] = await Promise.all([
    supabase.from("branches").select("id, codigo"),
    supabase.rpc("caixa_funcionarios"),
    codigos.length
      ? supabase.from("caixa_operadores").select("cod_operador, employee_id").in("cod_operador", codigos)
      : Promise.resolve({ data: [] as { cod_operador: number; employee_id: string | null }[] }),
    chaves.length ? supabase.from("caixa_diferencas").select("chave_importacao").in("chave_importacao", chaves) : Promise.resolve({ data: [] as { chave_importacao: string | null }[] }),
  ]);
  if (eF) throw new Error(eF.message);
  const lojaDe = new Map((lojas ?? []).map((b) => [b.codigo.toUpperCase(), b.id]));
  const func = new Map((funcionarios ?? []).map((f) => [f.id, f]));
  const opDe = new Map((operadores ?? []).map((o) => [o.cod_operador, o.employee_id]));
  const importadas = new Set((jaTem ?? []).map((x) => x.chave_importacao));
  const ativos = (funcionarios ?? []).filter((f) => f.status !== "desligado");

  const linhas: LinhaPrevia[] = planilha.linhas.map((l) => {
    const chave = chaveDaVenda(l);
    const branchId = lojaDe.get(l.filial) ?? null;
    let empId = l.vendedor !== null ? (opDe.get(l.vendedor) ?? null) : null;
    let pelaNome = false;
    if (!empId && l.nome) {
      // sem ligação no Trier: tenta pelo nome, primeiro na loja da venda
      const naLoja = ativos.filter((f) => f.branch_id === branchId);
      const s = sugerirFuncionario(l.nome, naLoja) ?? sugerirFuncionario(l.nome, ativos);
      if (s) {
        empId = s.id;
        pelaNome = true;
      }
    }
    const f = empId ? func.get(empId) : undefined;
    const situacao: SituacaoPos = importadas.has(chave)
      ? "duplicada"
      : !l.dia || l.valor === null || l.valor <= 0
        ? "invalida"
        : !branchId
          ? "sem_loja"
          : !f
            ? "sem_funcionario"
            : FARMACEUTICO.test(f.cargo ?? "")
              ? "farmaceutico"
              : "lancar";
    const codTrier = l.vendedor !== null && opDe.has(l.vendedor) ? l.vendedor : null;
    return { ...l, chave, situacao, branchId, pelaNome, codTrier, folhaTravada: false, funcionario: f ? { id: f.id, nome: f.nome, cargo: f.cargo, filial: f.filial } : null };
  });

  // folha do mês já com quebra digitada/importada pelo RH: o gatilho não sobrescreve
  const ids = [...new Set(linhas.filter((l) => l.situacao === "lancar").map((l) => l.funcionario!.id))];
  if (ids.length) {
    const { data: travadas } = await supabase.rpc("caixa_folha_travada", { p_competencia: `${competencia}-01`, p_employees: ids });
    const t = new Set((travadas ?? []).map((x) => x.employee_id));
    for (const l of linhas) if (l.funcionario && t.has(l.funcionario.id)) l.folhaTravada = true;
  }
  return { linhas, corte: planilha.corte, competencia, abas: planilha.abas };
}

export type ResultadoPos = { lote: string; lancadas: number; valor: number; ignoradas: number };

export async function importarPos(supabase: Cliente, sessao: { id: string; nome: string }, buf: Buffer, competencia: string): Promise<ResultadoPos> {
  const previa = await previaPos(supabase, buf, competencia);
  const lancar = previa.linhas.filter((l) => l.situacao === "lancar");
  const lote = crypto.randomUUID();
  const corte = previa.corte ? previa.corte.split("-").reverse().join("/") : "";
  if (lancar.length) {
    const { error } = await supabase.from("caixa_diferencas").upsert(
      lancar.map((l) => ({
        branch_id: l.branchId!,
        dia: l.dia!,
        nome_operador: (l.nome || l.funcionario!.nome).slice(0, 120),
        cod_operador: l.codTrier,
        employee_id: l.funcionario!.id,
        informado: 0,
        diferenca: l.valor!,
        origem: "manual",
        descricao: `POS · venda ${l.venda}${l.pagamento ? ` · ${l.pagamento}` : ""} · planilha do financeiro${corte ? ` até ${corte}` : ""}`.slice(0, 2000),
        lancada_por: sessao.id,
        lancada_por_nome: sessao.nome,
        competencia_folha: `${competencia}-01`,
        chave_importacao: l.chave,
        lote_importacao: lote,
      })),
      { onConflict: "chave_importacao", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Não consegui lançar: ${error.message}`);
  }
  return { lote, lancadas: lancar.length, valor: Math.round(lancar.reduce((s, l) => s + (l.valor ?? 0), 0) * 100) / 100, ignoradas: previa.linhas.length - lancar.length };
}

/** Lotes já importados (para conferir e desfazer). */
export async function lotesPos(supabase: Cliente) {
  const { data, error } = await supabase
    .from("caixa_diferencas")
    .select("lote_importacao, valor_quebra, andamento, competencia, coletado_em, lancada_por_nome")
    .not("lote_importacao", "is", null)
    .order("coletado_em", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  const lotes = new Map<string, { lote: string; quando: string; por: string | null; competencia: string; qtd: number; valor: number; decididas: number }>();
  for (const r of data) {
    const g = lotes.get(r.lote_importacao!) ?? { lote: r.lote_importacao!, quando: r.coletado_em, por: r.lancada_por_nome, competencia: r.competencia, qtd: 0, valor: 0, decididas: 0 };
    g.qtd += 1;
    g.valor = Math.round((g.valor + Number(r.valor_quebra)) * 100) / 100;
    if (r.andamento !== "pendente") g.decididas += 1;
    lotes.set(g.lote, g);
  }
  return [...lotes.values()].slice(0, 30);
}
