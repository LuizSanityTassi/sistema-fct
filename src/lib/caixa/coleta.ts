// Coleta da diferença de caixa (só servidor): pede ao robô do Trier o Relatório de Diferenças de Caixa de cada
// filial × dia, lê o Excel e grava um registro por caixa (caixa_diferencas), o operador visto (caixa_operadores) e
// o resultado da busca (caixa_coletas). O banco cuida do resto: classe (sem diferença / tolerância / quebra) e o
// desconto na folha (gatilho da migração 0028).
import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { buscarDiferencasCaixaTrier, type PedidoCaixaTrier, type RespostaCaixaTrier } from "@/lib/conciliacao/trier-robo";
import type { CredenciaisTrier } from "@/lib/integracoes/segredos";
import type { Database, Json } from "@/lib/supabase/types";
import { lerRelatorioDiferencas, type CaixaTrier } from "./diferencas";

type Cliente = SupabaseClient<Database>;

/** Número da filial no Trier a partir do código do cadastro ("F002" → 2). Outros códigos (ADM, TRIO…) não são lojas do Trier. */
export const filialTrierDoCodigo = (codigo: string) => (/^F(\d+)$/i.test(codigo.trim()) ? Number(codigo.trim().slice(1)) : null);

export type FilialCaixa = { id: string; codigo: string; nome: string; filial: number };

export async function filiaisDoTrier(supabase: Cliente): Promise<FilialCaixa[]> {
  const { data, error } = await supabase.from("branches").select("id, codigo, nome").eq("ativo", true).order("codigo");
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((b) => {
    const filial = filialTrierDoCodigo(b.codigo);
    return filial === null ? [] : [{ ...b, filial }];
  });
}

export function matrizDoXlsx(buf: Buffer) {
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
}

/** Grava os caixas de uma filial: novos entram inteiros; os já gravados só atualizam o que vem do Trier. */
async function gravarCaixas(supabase: Cliente, branchId: string, diaPedido: string, caixas: CaixaTrier[]) {
  if (!caixas.length) return { novos: 0, atualizados: 0 };
  const agora = new Date().toISOString();
  // operadores vistos (sem mexer no funcionário já ligado)
  const ops = [...new Map(caixas.filter((c) => c.codOperador !== null).map((c) => [c.codOperador!, { cod_operador: c.codOperador!, nome_trier: c.nomeOperador, visto_em: agora }])).values()];
  if (ops.length) {
    const { error } = await supabase.from("caixa_operadores").upsert(ops, { onConflict: "cod_operador" });
    if (error) throw new Error(`operadores: ${error.message}`);
  }
  const { data: vinculos } = ops.length ? await supabase.from("caixa_operadores").select("cod_operador, employee_id").in("cod_operador", ops.map((o) => o.cod_operador)) : { data: [] };
  const funcionario = new Map((vinculos ?? []).map((v) => [v.cod_operador, v.employee_id]));

  const { data: existentes, error: e1 } = await supabase
    .from("caixa_diferencas")
    .select("id, numero_caixa, andamento")
    .eq("branch_id", branchId)
    .in("numero_caixa", caixas.map((c) => c.numero));
  if (e1) throw new Error(e1.message);
  const porNumero = new Map((existentes ?? []).map((r) => [r.numero_caixa, r]));

  const doTrier = (c: CaixaTrier) => ({
    dia: c.abertura ?? diaPedido,
    fechamento: c.fechamento,
    cod_operador: c.codOperador,
    nome_operador: c.nomeOperador,
    informado: c.informadoDinheiro,
    diferenca: c.calculadoDinheiro,
    formas: c.formas as unknown as Json,
    coletado_em: agora,
  });
  const novos = caixas.filter((c) => !porNumero.has(c.numero));
  if (novos.length) {
    const { error } = await supabase
      .from("caixa_diferencas")
      .insert(novos.map((c) => ({ ...doTrier(c), branch_id: branchId, numero_caixa: c.numero, employee_id: c.codOperador !== null ? (funcionario.get(c.codOperador) ?? null) : null })));
    if (error) throw new Error(`caixas: ${error.message}`);
  }
  let atualizados = 0;
  for (const c of caixas) {
    const r = porNumero.get(c.numero);
    if (!r) continue;
    // depois que o financeiro decide, o funcionário do registro não muda mais (o desconto já foi para a folha dele)
    const aberto = r.andamento === "pendente" || r.andamento === "justificada";
    const vinculo = aberto && c.codOperador !== null ? { employee_id: funcionario.get(c.codOperador) ?? null } : {};
    const { error } = await supabase.from("caixa_diferencas").update({ ...doTrier(c), ...vinculo }).eq("id", r.id);
    if (error) throw new Error(`caixa ${c.numero}: ${error.message}`);
    atualizados++;
  }
  return { novos: novos.length, atualizados };
}

export type ResultadoColeta = { lidas: number; caixas: number; quebras: number; erros: { filial: string; dia: string; erro: string }[]; restantes: PedidoCaixaTrier[]; ms: number };

/**
 * Roda o robô nos pedidos (filial × dia) e grava tudo. Cada filial é gravada assim que o Trier responde, então
 * uma rodada interrompida não perde o que já veio; os pedidos que sobraram voltam em `restantes`.
 */
export async function coletarDiferencas(supabase: Cliente, cred: CredenciaisTrier, pedidos: PedidoCaixaTrier[], filiais: FilialCaixa[], prazoMs?: number): Promise<ResultadoColeta> {
  const porNumero = new Map(filiais.map((f) => [f.filial, f]));
  const out: ResultadoColeta = { lidas: 0, caixas: 0, quebras: 0, erros: [], restantes: [], ms: 0 };
  const registrar = async (r: RespostaCaixaTrier, status: "ok" | "erro", caixas: number, mensagem: string | null) => {
    const f = porNumero.get(r.filial);
    if (!f) return;
    await supabase.from("caixa_coletas").upsert({ dia: r.dia, branch_id: f.id, status, caixas, mensagem, duracao_ms: r.ms, coletado_em: new Date().toISOString() }, { onConflict: "dia,branch_id" });
  };
  const aoReceber = async (r: RespostaCaixaTrier) => {
    const f = porNumero.get(r.filial);
    const nome = f?.codigo ?? `filial ${r.filial}`;
    try {
      if (r.erro) throw new Error(r.erro);
      if (r.semMovimento || !r.xlsx) {
        await registrar(r, "ok", 0, "sem caixas no dia");
        out.lidas++;
        return;
      }
      if (!f) throw new Error("filial não cadastrada no sistema");
      const rel = lerRelatorioDiferencas(matrizDoXlsx(r.xlsx));
      await gravarCaixas(supabase, f.id, r.dia, rel.caixas);
      await registrar(r, "ok", rel.caixas.length, null);
      out.lidas++;
      out.caixas += rel.caixas.length;
      out.quebras += rel.caixas.filter((c) => Math.abs(c.calculadoDinheiro) > 2).length;
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      out.erros.push({ filial: nome, dia: r.dia, erro });
      await registrar(r, "erro", 0, erro.slice(0, 500));
    }
  };
  const r = await buscarDiferencasCaixaTrier(cred, pedidos, aoReceber, prazoMs);
  out.restantes = r.restantes;
  out.ms = r.ms;
  return out;
}
