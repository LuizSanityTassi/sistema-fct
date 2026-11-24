// Grava no portal as notas lidas do espelho do Trier (Rel_0005). Usado pelo envio manual do PDF (cliente do usuário,
// com RLS) e pelo robô (cliente de serviço). Cada nota entra ou é atualizada (filial + fornecedor + número + série) e os
// itens são trocados pelos do arquivo: reenviar o mesmo período nunca duplica.
import type { SupabaseClient } from "@supabase/supabase-js";
import { lerEspelhoTrier, type ResultadoEspelho } from "@/lib/compras/espelho-trier";
import type { Database } from "@/lib/supabase/types";

type Cliente = SupabaseClient<Database>;
export type ResultadoImportacaoEspelho = { erro?: string; ok?: string; avisos: string[]; importacaoId?: string; resumo?: Record<string, unknown> };

const MAX_AVISOS = 40;
const chave = (n: { filialCodigo: string; fornecedorCodigo: string; numero: string; serie: string }) => `${n.filialCodigo}|${n.fornecedorCodigo}|${n.numero}|${n.serie}`;

/** Lê o PDF e grava. `quem` = nome de quem importou (ou "Robô do Trier"). */
export async function importarEspelhoPdf(supabase: Cliente, pdf: Uint8Array, nome: string, quem: string, origem: "manual" | "robo"): Promise<ResultadoImportacaoEspelho> {
  let lido: ResultadoEspelho;
  try {
    lido = await lerEspelhoTrier(pdf);
  } catch (e) {
    return { erro: `${nome}: não consegui ler o PDF (${e instanceof Error ? e.message : "erro"}). Confira se é o "Espelho Nota Fiscal Entrada" (Rel_0005).`, avisos: [] };
  }
  if (!lido.notas.length) return { erro: `${nome}: nenhuma nota encontrada. Confira se é o "Espelho Nota Fiscal Entrada" (Rel_0005) do Trier.`, avisos: lido.avisos.slice(0, MAX_AVISOS) };
  return gravarEspelho(supabase, lido, nome, quem, origem);
}

export async function gravarEspelho(supabase: Cliente, lido: ResultadoEspelho, nome: string, quem: string, origem: "manual" | "robo"): Promise<ResultadoImportacaoEspelho> {
  const avisos = [...lido.avisos];
  const { data: branches } = await supabase.from("branches").select("id, codigo");
  const filiais = new Map((branches ?? []).map((b) => [b.codigo.toUpperCase(), b.id]));
  const semFilial = [...new Set(lido.notas.filter((n) => !filiais.has(n.filialCodigo.toUpperCase())).map((n) => n.filialCodigo))];
  if (semFilial.length) avisos.push(`Filiais que não estão no cadastro (as notas entram, mas sem ligar à filial): ${semFilial.join(", ")}.`);
  // a mesma nota duas vezes no arquivo (não deveria): fica a última
  const porChave = new Map(lido.notas.map((n) => [chave(n), n]));
  if (porChave.size < lido.notas.length) avisos.push(`${lido.notas.length - porChave.size} nota(s) repetida(s) no arquivo — ficou a última.`);
  const notas = [...porChave.values()];

  const { data: imp, error: eImp } = await supabase
    .from("cmp_importacoes")
    .insert({ tipo: "notas", arquivo: nome.slice(0, 300), criado_por_nome: quem, resumo: { origem } })
    .select("id")
    .single();
  if (eImp) return { erro: `Não consegui registrar a importação: ${eImp.message}`, avisos };

  let novas = 0;
  let atualizadas = 0;
  let itens = 0;
  for (let i = 0; i < notas.length; i += 250) {
    const lote = notas.slice(i, i + 250);
    // quais já estavam no portal (para contar novas × atualizadas)
    const { data: ja } = await supabase
      .from("cmp_notas")
      .select("filial_codigo, fornecedor_codigo, numero, serie")
      .in("numero", [...new Set(lote.map((n) => n.numero))]);
    const existentes = new Set((ja ?? []).map((n) => `${n.filial_codigo}|${n.fornecedor_codigo}|${n.numero}|${n.serie}`));
    const { data: gravadas, error } = await supabase
      .from("cmp_notas")
      .upsert(
        lote.map((n) => ({
          filial_codigo: n.filialCodigo,
          branch_id: filiais.get(n.filialCodigo.toUpperCase()) ?? null,
          fornecedor_codigo: n.fornecedorCodigo,
          fornecedor_nome: n.fornecedorNome || null,
          transferencia: n.transferencia,
          numero: n.numero,
          serie: n.serie,
          data_entrada: n.dataEntrada,
          data_emissao: n.dataEmissao,
          estoque_atualizado: n.estoqueAtualizado,
          total_mercadorias: n.totalMercadorias,
          total_descontos: n.totalDescontos,
          total_nota: n.totalNota,
          qtd_itens: n.itens.length,
          importacao_id: imp.id,
          atualizado_em: new Date().toISOString(),
        })),
        { onConflict: "filial_codigo,fornecedor_codigo,numero,serie" },
      )
      .select("id, filial_codigo, fornecedor_codigo, numero, serie");
    if (error) {
      await supabase.from("cmp_importacoes").update({ resumo: { origem, erro: error.message, notas_gravadas: novas + atualizadas } }).eq("id", imp.id);
      return { erro: `Parei na nota ${i + 1} de ${notas.length}: ${error.message}. As anteriores ficaram gravadas; importe de novo (nada duplica).`, avisos };
    }
    const idDe = new Map((gravadas ?? []).map((g) => [`${g.filial_codigo}|${g.fornecedor_codigo}|${g.numero}|${g.serie}`, g.id]));
    for (const n of lote) {
      if (existentes.has(chave(n))) atualizadas++;
      else novas++;
    }
    // itens: troca os da nota pelos do arquivo
    const { error: eDel } = await supabase.from("cmp_nota_itens").delete().in("nota_id", [...idDe.values()]);
    if (eDel) return { erro: `Não consegui atualizar os itens: ${eDel.message}. Importe de novo (nada duplica).`, avisos };
    const linhas = lote.flatMap((n) =>
      n.itens.map((x) => ({
        nota_id: idDe.get(chave(n))!,
        produto_codigo: x.produtoCodigo,
        produto: x.produto || null,
        laboratorio: x.laboratorio || null,
        barras_final: x.barrasFinal || null,
        quantidade: x.quantidade,
        valor_unitario: x.valorUnitario,
        desconto_pct: x.descontoPct,
        valor_liquido: x.valorLiquido,
        valor_total: x.valorTotal,
      })),
    );
    for (let k = 0; k < linhas.length; k += 1000) {
      const { error: eIns } = await supabase.from("cmp_nota_itens").insert(linhas.slice(k, k + 1000));
      if (eIns) return { erro: `Não consegui gravar os itens: ${eIns.message}. Importe de novo (nada duplica).`, avisos };
    }
    itens += linhas.length;
  }
  const entradas = notas.map((n) => n.dataEntrada).filter((d): d is string => !!d).sort();
  const resumo = {
    origem,
    periodo: lido.periodo,
    paginas: lido.paginas,
    notas: notas.length,
    novas,
    atualizadas,
    itens,
    transferencias: notas.filter((n) => n.transferencia).length,
    entrada_de: entradas[0] ?? null,
    entrada_ate: entradas.at(-1) ?? null,
    avisos: avisos.slice(0, MAX_AVISOS),
  };
  await supabase.from("cmp_importacoes").update({ resumo }).eq("id", imp.id);
  return {
    ok: `${notas.length} notas lidas (${novas} novas, ${atualizadas} atualizadas), ${itens} itens${resumo.transferencias ? `; ${resumo.transferencias} são transferências entre lojas e ficam fora do cruzamento` : ""}.`,
    avisos: avisos.slice(0, MAX_AVISOS),
    importacaoId: imp.id,
    resumo,
  };
}
