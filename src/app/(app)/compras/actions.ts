"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerEspelhoTrier } from "@/lib/compras/espelho-trier";
import { lerPrePedido, type PedidoLido } from "@/lib/compras/pre-pedido";
import { caminhoDeEspelho } from "@/lib/compras/rotulos";
import { createClient } from "@/lib/supabase/server";

export type EstadoImportacao = { erro?: string; ok?: string; avisos?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET = "compras";
const MAX_AVISOS = 40;
const podeImportar = (papel: string) => papel === "admin" || papel === "compras";
const revalidar = () => {
  revalidatePath("/compras");
  revalidatePath("/compras/notas");
  revalidatePath("/compras/importar");
};
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

type Cliente = Awaited<ReturnType<typeof createClient>>;

async function mapaFiliais(supabase: Cliente) {
  const { data } = await supabase.from("branches").select("id, codigo");
  return new Map((data ?? []).map((b) => [b.codigo.toUpperCase(), b.id]));
}

/** Pré-pedidos do Trier (Excel Con_0018): grava cada pré-pedido (um por filial) com a data informada. Número que já está no portal não entra de novo. */
export async function importarPrePedidos(_prev: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!podeImportar(sessao.papel)) return { erro: "Só o Compras e o administrador importam pré-pedidos." };
  const data = String(fd.get("data_pedido") ?? "").trim();
  if (!DATA.test(data)) return { erro: "Informe a data do pedido." };
  if (data > hojeBrasil()) return { erro: "A data do pedido não pode ser no futuro." };
  const arquivos = fd.getAll("arquivos").filter((a): a is File => a instanceof File && a.size > 0);
  if (!arquivos.length) return { erro: "Escolha o arquivo do pré-pedido (Excel do Trier)." };
  if (arquivos.length > 30) return { erro: "No máximo 30 arquivos por vez." };

  const avisos: string[] = [];
  const lidos: { arquivo: string; pedido: PedidoLido }[] = [];
  for (const a of arquivos) {
    if (a.size > 10 * 1024 * 1024) return { erro: `${a.name}: arquivo maior que 10 MB.` };
    try {
      const r = lerPrePedido(a.name, new Uint8Array(await a.arrayBuffer()));
      avisos.push(...r.avisos);
      for (const p of r.pedidos) if (p.itens.length) lidos.push({ arquivo: a.name, pedido: p });
    } catch (e) {
      return { erro: e instanceof Error ? e.message : `${a.name}: não consegui ler.` };
    }
  }
  if (!lidos.length) return { erro: "Nenhum pré-pedido com itens nos arquivos.", avisos: avisos.slice(0, MAX_AVISOS) };
  // o mesmo número em dois arquivos do mesmo envio
  const vistos = new Set<number>();
  const unicos = lidos.filter(({ pedido, arquivo }) => {
    if (vistos.has(pedido.numero)) {
      avisos.push(`${arquivo}: pré-pedido ${pedido.numero} repetido no envio — entrou uma vez só.`);
      return false;
    }
    vistos.add(pedido.numero);
    return true;
  });

  const supabase = await createClient();
  const filiais = await mapaFiliais(supabase);
  const existentes = new Set<number>();
  const numeros = unicos.map((l) => l.pedido.numero);
  for (let i = 0; i < numeros.length; i += 300) {
    const { data: ja } = await supabase.from("cmp_pedidos").select("numero").in("numero", numeros.slice(i, i + 300));
    for (const p of ja ?? []) existentes.add(Number(p.numero));
  }
  const novos = unicos.filter((l) => !existentes.has(l.pedido.numero));
  const semFilial = [...new Set(novos.filter((l) => !filiais.has(l.pedido.filialCodigo.toUpperCase())).map((l) => l.pedido.filialCodigo))];
  if (semFilial.length) avisos.push(`Filiais que não estão no cadastro (o pedido entra, mas sem ligar à filial): ${semFilial.join(", ")}.`);
  if (existentes.size) avisos.push(`${existentes.size} pré-pedido(s) já estavam no portal e não entraram de novo: ${[...existentes].slice(0, 15).join(", ")}${existentes.size > 15 ? "…" : ""}.`);
  if (!novos.length) return { erro: "Todos esses pré-pedidos já estavam no portal.", avisos: avisos.slice(0, MAX_AVISOS) };

  const { data: imp, error: eImp } = await supabase
    .from("cmp_importacoes")
    .insert({ tipo: "pedidos", arquivo: arquivos.map((a) => a.name).join(", ").slice(0, 300), criado_por_nome: sessao.nome, resumo: {} })
    .select("id")
    .single();
  if (eImp) return { erro: `Não consegui registrar a importação: ${eImp.message}` };

  const desfazer = async () => {
    await supabase.from("cmp_pedidos").delete().eq("importacao_id", imp.id);
    await supabase.from("cmp_importacoes").delete().eq("id", imp.id);
  };
  let itens = 0;
  let quantidade = 0;
  for (let i = 0; i < novos.length; i += 100) {
    const lote = novos.slice(i, i + 100);
    const { data: gravados, error } = await supabase
      .from("cmp_pedidos")
      .insert(
        lote.map(({ arquivo, pedido: p }) => ({
          numero: p.numero,
          filial_codigo: p.filialCodigo,
          branch_id: filiais.get(p.filialCodigo.toUpperCase()) ?? null,
          laboratorio: p.laboratorio || null,
          data_pedido: data,
          qtd_itens: p.itens.length,
          qtd_total: p.itens.reduce((s, x) => s + x.quantidade, 0),
          arquivo: arquivo.slice(0, 300),
          importacao_id: imp.id,
        })),
      )
      .select("id, numero");
    if (error) {
      await desfazer();
      return { erro: `Não consegui gravar os pré-pedidos: ${error.message}` };
    }
    const idDe = new Map((gravados ?? []).map((g) => [Number(g.numero), g.id]));
    const linhas = lote.flatMap(({ pedido: p }) =>
      p.itens.map((x) => ({ pedido_id: idDe.get(p.numero)!, produto_codigo: x.produtoCodigo, produto: x.produto, barras: x.barras || null, laboratorio: x.laboratorio || null, quantidade: x.quantidade })),
    );
    for (let k = 0; k < linhas.length; k += 1000) {
      const { error: eItens } = await supabase.from("cmp_pedido_itens").insert(linhas.slice(k, k + 1000));
      if (eItens) {
        await desfazer();
        return { erro: `Não consegui gravar os itens: ${eItens.message}` };
      }
    }
    itens += linhas.length;
    quantidade += linhas.reduce((s, x) => s + x.quantidade, 0);
  }
  const resumo = { data_pedido: data, arquivos: arquivos.map((a) => a.name), pedidos: novos.length, ja_existiam: existentes.size, itens, quantidade, laboratorios: [...new Set(novos.map((l) => l.pedido.laboratorio))], avisos: avisos.slice(0, MAX_AVISOS) };
  await supabase.from("cmp_importacoes").update({ resumo }).eq("id", imp.id);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "cmp_pedidos", registroId: imp.id, novo: { ...resumo, avisos: undefined } });
  revalidar();
  return { ok: `${novos.length} pré-pedido(s) importado(s) com ${itens} itens (${quantidade} unidades), data do pedido ${data.split("-").reverse().join("/")}.`, avisos: avisos.slice(0, MAX_AVISOS) };
}

/**
 * Espelho das notas de entrada (PDF Rel_0005 do Trier). O navegador já mandou o PDF para o Storage (passa do limite de
 * 4,5 MB por envio da Vercel); aqui ele é lido e cada nota entra ou é atualizada (filial + fornecedor + número + série),
 * com os itens trocados pelos do arquivo. Depois o PDF é apagado do Storage.
 */
export async function processarEspelho(caminho: string, nomeArquivo: string): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!podeImportar(sessao.papel)) return { erro: "Só o Compras e o administrador importam o espelho das notas." };
  if (typeof caminho !== "string" || !caminhoDeEspelho(caminho)) return { erro: "Arquivo inválido." };
  const nome = String(nomeArquivo ?? "espelho.pdf").slice(0, 200);
  const supabase = await createClient();
  const apagarArquivo = () => supabase.storage.from(BUCKET).remove([caminho]);

  const { data: blob, error: eBaixar } = await supabase.storage.from(BUCKET).download(caminho);
  if (eBaixar || !blob) return { erro: `Não consegui abrir o arquivo enviado: ${eBaixar?.message ?? "vazio"}` };
  let lido;
  try {
    lido = await lerEspelhoTrier(new Uint8Array(await blob.arrayBuffer()));
  } catch (e) {
    await apagarArquivo();
    return { erro: `${nome}: não consegui ler o PDF (${e instanceof Error ? e.message : "erro"}). Confira se é o "Espelho Nota Fiscal Entrada" (Rel_0005).` };
  }
  if (!lido.notas.length) {
    await apagarArquivo();
    return { erro: `${nome}: nenhuma nota encontrada. Confira se é o "Espelho Nota Fiscal Entrada" (Rel_0005) do Trier.`, avisos: lido.avisos.slice(0, MAX_AVISOS) };
  }

  const avisos = [...lido.avisos];
  const filiais = await mapaFiliais(supabase);
  const semFilial = [...new Set(lido.notas.filter((n) => !filiais.has(n.filialCodigo.toUpperCase())).map((n) => n.filialCodigo))];
  if (semFilial.length) avisos.push(`Filiais que não estão no cadastro (as notas entram, mas sem ligar à filial): ${semFilial.join(", ")}.`);
  // a mesma nota duas vezes no arquivo (não deveria): fica a última
  const porChave = new Map(lido.notas.map((n) => [`${n.filialCodigo}|${n.fornecedorCodigo}|${n.numero}|${n.serie}`, n]));
  if (porChave.size < lido.notas.length) avisos.push(`${lido.notas.length - porChave.size} nota(s) repetida(s) no arquivo — ficou a última.`);
  const notas = [...porChave.values()];

  const { data: imp, error: eImp } = await supabase
    .from("cmp_importacoes")
    .insert({ tipo: "notas", arquivo: nome, criado_por_nome: sessao.nome, resumo: {} })
    .select("id")
    .single();
  if (eImp) return { erro: `Não consegui registrar a importação: ${eImp.message}` };

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
      await supabase.from("cmp_importacoes").update({ resumo: { erro: error.message, notas_gravadas: novas + atualizadas } }).eq("id", imp.id);
      return { erro: `Parei na nota ${i + 1} de ${notas.length}: ${error.message}. As anteriores ficaram gravadas; envie o arquivo de novo (nada duplica).` };
    }
    const idDe = new Map((gravadas ?? []).map((g) => [`${g.filial_codigo}|${g.fornecedor_codigo}|${g.numero}|${g.serie}`, g.id]));
    for (const n of lote) {
      if (existentes.has(`${n.filialCodigo}|${n.fornecedorCodigo}|${n.numero}|${n.serie}`)) atualizadas++;
      else novas++;
    }
    // itens: troca os da nota pelos do arquivo
    const ids = [...idDe.values()];
    const { error: eDel } = await supabase.from("cmp_nota_itens").delete().in("nota_id", ids);
    if (eDel) return { erro: `Não consegui atualizar os itens: ${eDel.message}. Envie o arquivo de novo (nada duplica).` };
    const linhas = lote.flatMap((n) =>
      n.itens.map((x) => ({
        nota_id: idDe.get(`${n.filialCodigo}|${n.fornecedorCodigo}|${n.numero}|${n.serie}`)!,
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
      if (eIns) return { erro: `Não consegui gravar os itens: ${eIns.message}. Envie o arquivo de novo (nada duplica).` };
    }
    itens += linhas.length;
  }
  await apagarArquivo();
  const entradas = notas.map((n) => n.dataEntrada).filter((d): d is string => !!d).sort();
  const resumo = {
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
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "cmp_notas", registroId: imp.id, novo: { ...resumo, avisos: undefined } });
  revalidar();
  return {
    ok: `${notas.length} notas lidas (${novas} novas, ${atualizadas} atualizadas), ${itens} itens${resumo.transferencias ? `; ${resumo.transferencias} são transferências entre lojas e ficam fora do cruzamento` : ""}.`,
    avisos: avisos.slice(0, MAX_AVISOS),
  };
}

/** Desfaz uma importação de pré-pedidos (apaga os pré-pedidos dela). O registro da importação fica, marcado como desfeito. */
export async function desfazerImportacao(id: string): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!podeImportar(sessao.papel)) return { erro: "Só o Compras e o administrador desfazem importações." };
  if (!UUID.test(id)) return { erro: "Importação inválida." };
  const supabase = await createClient();
  const { data: imp } = await supabase.from("cmp_importacoes").select("id, tipo, resumo").eq("id", id).maybeSingle();
  if (!imp) return { erro: "Importação não encontrada." };
  if (imp.tipo !== "pedidos") return { erro: "Só a importação de pré-pedidos pode ser desfeita (as notas são atualizadas a cada espelho enviado)." };
  const { count, error } = await supabase.from("cmp_pedidos").delete({ count: "exact" }).eq("importacao_id", id);
  if (error) return { erro: error.message };
  const resumo = { ...((imp.resumo as Record<string, unknown>) ?? {}), desfeita_em: new Date().toISOString(), desfeita_por: sessao.nome };
  await supabase.from("cmp_importacoes").update({ resumo }).eq("id", id);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "cmp_pedidos", registroId: id, anterior: { importacao: id, pedidos: count ?? 0 } });
  revalidar();
  return { ok: `Importação desfeita: ${count ?? 0} pré-pedido(s) apagado(s).` };
}
