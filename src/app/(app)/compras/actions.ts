"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { importarEspelhoPdf } from "@/lib/compras/importar-espelho";
import { podeEscreverCompras } from "@/lib/compras/permissao";
import { lerPrePedido, type PedidoLido } from "@/lib/compras/pre-pedido";
import { caminhoDeEspelho } from "@/lib/compras/rotulos";
import { buscarEspelhoNotasTrier } from "@/lib/conciliacao/trier-robo";
import { credenciaisTrier, credenciaisTrierServico } from "@/lib/integracoes/segredos";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type EstadoImportacao = { erro?: string; ok?: string; avisos?: string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET = "compras";
const MAX_AVISOS = 40;
const podeImportar = podeEscreverCompras;
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
  if (!(await podeImportar(sessao.papel))) return { erro: "Só o Compras e o administrador importam pré-pedidos." };
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
  // o pré-pedido é o número + a filial (o Trier numera por empresa: o mesmo número aparece em filiais de redes diferentes)
  const chaveDe = (numero: number, filial: string) => `${numero}|${filial.toUpperCase()}`;
  const vistos = new Set<string>();
  const unicos = lidos.filter(({ pedido, arquivo }) => {
    const k = chaveDe(pedido.numero, pedido.filialCodigo);
    if (vistos.has(k)) {
      avisos.push(`${arquivo}: pré-pedido ${pedido.numero} da ${pedido.filialCodigo} repetido no envio — entrou uma vez só.`);
      return false;
    }
    vistos.add(k);
    return true;
  });

  const supabase = await createClient();
  const filiais = await mapaFiliais(supabase);
  const existentes = new Set<string>();
  const numeros = [...new Set(unicos.map((l) => l.pedido.numero))];
  for (let i = 0; i < numeros.length; i += 300) {
    const { data: ja } = await supabase.from("cmp_pedidos").select("numero, filial_codigo").in("numero", numeros.slice(i, i + 300));
    for (const p of ja ?? []) existentes.add(chaveDe(Number(p.numero), p.filial_codigo));
  }
  const novos = unicos.filter((l) => !existentes.has(chaveDe(l.pedido.numero, l.pedido.filialCodigo)));
  const semFilial = [...new Set(novos.filter((l) => !filiais.has(l.pedido.filialCodigo.toUpperCase())).map((l) => l.pedido.filialCodigo))];
  if (semFilial.length) avisos.push(`Filiais que não estão no cadastro (o pedido entra, mas sem ligar à filial): ${semFilial.join(", ")}.`);
  const jaEstavam = unicos.filter((l) => existentes.has(chaveDe(l.pedido.numero, l.pedido.filialCodigo)));
  if (jaEstavam.length)
    avisos.push(
      `${jaEstavam.length} pré-pedido(s) já estavam no portal e não entraram de novo: ${jaEstavam
        .slice(0, 15)
        .map((l) => `${l.pedido.numero} (${l.pedido.filialCodigo})`)
        .join(", ")}${jaEstavam.length > 15 ? "…" : ""}.`,
    );
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
      .select("id, numero, filial_codigo");
    if (error) {
      await desfazer();
      return { erro: `Não consegui gravar os pré-pedidos: ${error.message}` };
    }
    const idDe = new Map((gravados ?? []).map((g) => [chaveDe(Number(g.numero), g.filial_codigo), g.id]));
    const linhas = lote.flatMap(({ pedido: p }) =>
      p.itens.map((x) => ({ pedido_id: idDe.get(chaveDe(p.numero, p.filialCodigo))!, produto_codigo: x.produtoCodigo, produto: x.produto, barras: x.barras || null, laboratorio: x.laboratorio || null, quantidade: x.quantidade })),
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
  const resumo = { data_pedido: data, arquivos: arquivos.map((a) => a.name), pedidos: novos.length, ja_existiam: jaEstavam.length, itens, quantidade, laboratorios: [...new Set(novos.map((l) => l.pedido.laboratorio))], avisos: avisos.slice(0, MAX_AVISOS) };
  await supabase.from("cmp_importacoes").update({ resumo }).eq("id", imp.id);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "cmp_pedidos", registroId: imp.id, novo: { ...resumo, avisos: undefined } });
  revalidar();
  return { ok: `${novos.length} pré-pedido(s) importado(s) com ${itens} itens (${quantidade} unidades), data do pedido ${data.split("-").reverse().join("/")}.`, avisos: avisos.slice(0, MAX_AVISOS) };
}

/**
 * Espelho das notas de entrada (PDF Rel_0005 do Trier). O navegador já mandou o PDF para o Storage (passa do limite de
 * 4,5 MB por envio da Vercel); aqui ele é lido e gravado (nada duplica) e depois apagado do Storage.
 */
export async function processarEspelho(caminho: string, nomeArquivo: string): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!(await podeImportar(sessao.papel))) return { erro: "Só o Compras e o administrador importam o espelho das notas." };
  if (typeof caminho !== "string" || !caminhoDeEspelho(caminho)) return { erro: "Arquivo inválido." };
  const nome = String(nomeArquivo ?? "espelho.pdf").slice(0, 200);
  const supabase = await createClient();
  const { data: blob, error: eBaixar } = await supabase.storage.from(BUCKET).download(caminho);
  if (eBaixar || !blob) return { erro: `Não consegui abrir o arquivo enviado: ${eBaixar?.message ?? "vazio"}` };
  const r = await importarEspelhoPdf(supabase, new Uint8Array(await blob.arrayBuffer()), nome, sessao.nome, "manual");
  await supabase.storage.from(BUCKET).remove([caminho]);
  if (r.erro) return { erro: r.erro, avisos: r.avisos };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "cmp_notas", registroId: r.importacaoId, novo: { ...r.resumo, avisos: undefined } });
  revalidar();
  return { ok: r.ok, avisos: r.avisos };
}

/** Máximo de dias por busca na tela (o Trier leva mais para gerar muitos dias e a função tem 5 minutos). */
const MAX_DIAS_BUSCA = 3;

/**
 * "Buscar no Trier agora": o robô entra no Trier com o usuário das integrações, gera o espelho das notas do período
 * (todas as filiais) e importa, como se o PDF tivesse sido enviado à mão.
 */
export async function buscarEspelhoNoTrier(_prev: EstadoImportacao, fd: FormData): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!(await podeImportar(sessao.papel))) return { erro: "Só o Compras e o administrador buscam as notas no Trier." };
  const de = String(fd.get("de") ?? "").trim();
  const ate = String(fd.get("ate") ?? "").trim();
  if (!DATA.test(de) || !DATA.test(ate)) return { erro: "Informe o período (de e até)." };
  if (de > ate) return { erro: "O primeiro dia não pode ser depois do último." };
  if (ate > hojeBrasil()) return { erro: "O período não pode passar de hoje." };
  const dias = Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000) + 1;
  if (dias > MAX_DIAS_BUSCA) return { erro: `No máximo ${MAX_DIAS_BUSCA} dias por busca (o Trier demora para gerar muitos dias). Para mais, busque em partes.` };

  const supabase = await createClient();
  // a senha do robô é lida com a chave de serviço (o Compras não lê os segredos); nunca sai do servidor
  const admin = createAdminClient();
  const cred = admin ? await credenciaisTrierServico(admin) : await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return { erro: "O robô do Trier não tem usuário e senha: o administrador configura em Administração → Integrações." };
  let gerado: Awaited<ReturnType<typeof buscarEspelhoNotasTrier>>;
  try {
    gerado = await buscarEspelhoNotasTrier(cred, de, ate, 200_000);
  } catch (e) {
    return { erro: `Trier: ${e instanceof Error ? e.message : String(e)}` };
  }
  if ("semMovimento" in gerado) return { ok: "O Trier não tem notas de entrada nesse período." };
  const nome = `Trier espelho notas ${de.split("-").reverse().join("-")} a ${ate.split("-").reverse().join("-")}.pdf`;
  const r = await importarEspelhoPdf(supabase, new Uint8Array(gerado.pdf), nome, `${sessao.nome} (robô do Trier)`, "robo");
  if (r.erro) return { erro: r.erro, avisos: r.avisos };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "cmp_notas", registroId: r.importacaoId, novo: { ...r.resumo, avisos: undefined, trier_ms: gerado.ms } });
  revalidar();
  return { ok: `Buscado no Trier em ${Math.round(gerado.ms / 1000)} s. ${r.ok}`, avisos: r.avisos };
}

/** Desfaz uma importação de pré-pedidos (apaga os pré-pedidos dela). O registro da importação fica, marcado como desfeito. */
export async function desfazerImportacao(id: string): Promise<EstadoImportacao> {
  const sessao = await getSessao();
  if (!(await podeImportar(sessao.papel))) return { erro: "Só o Compras e o administrador desfazem importações." };
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
