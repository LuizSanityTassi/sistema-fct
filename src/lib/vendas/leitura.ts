// Leitura das coletas (só servidor): abre o Excel guardado em vendas_coletas, passa pelo leitor do relatório e troca
// os números daquele dia (ou mês, no caso dos vendedores por grupo) nas tabelas de vendas. Ler de novo a mesma
// coleta dá o mesmo resultado; a coleta mais nova de um período é a que vale.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import type { RelatorioVendas } from "@/lib/conciliacao/trier-robo";
import type { Database } from "@/lib/supabase/types";
import { lerCmvAgrupado, lerReceitaPorFilial, lerVendasEcommerce, lerVendasPorData, lerVendasPorVendedor, lerVendedorGrupo, LeituraErro, type Matriz } from "./leitores";

type Cliente = SupabaseClient<Database>;

/** Laboratórios guardados dia a dia (os outros só entram no total): a marca própria Fortvigor. */
export const LABORATORIOS_ACOMPANHADOS = /FORTVIGOR/i;

export type ColetaParaLer = { id: string; relatorio: string; de: string; ate: string; arquivo_b64: string | null };
export type ResultadoLeitura = { linhas: number; filiaisDesconhecidas: number[] };

/** Número da filial no Trier → branch_id (F002 → 2). */
export async function mapaFiliaisTrier(client: Cliente) {
  const { data, error } = await client.from("branches").select("id, codigo");
  if (error) throw new Error(error.message);
  const mapa = new Map<number, string>();
  for (const b of data ?? []) {
    const m = /^F(\d+)$/i.exec(b.codigo.trim());
    if (m) mapa.set(Number(m[1]), b.id);
  }
  return mapa;
}

function matrizDe(b64: string): Matriz {
  const wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: false });
}

const cent = (v: number) => Math.round(v * 100) / 100;

/** Soma as linhas com a mesma chave (o Trier às vezes repete um grupo ou vendedor dentro da filial). */
function somar<T extends Record<string, unknown>>(linhas: T[], chave: (l: T) => string, campos: (keyof T)[]) {
  const mapa = new Map<string, T>();
  for (const l of linhas) {
    const k = chave(l);
    const ja = mapa.get(k);
    if (!ja) mapa.set(k, { ...l });
    else for (const c of campos) (ja[c] as number) = cent((ja[c] as number) + (l[c] as number));
  }
  return [...mapa.values()];
}

async function emLotes<T>(linhas: T[], gravar: (lote: T[]) => PromiseLike<{ error: { message: string } | null }>) {
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await gravar(linhas.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
}

const checar = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

/** Filiais que ficam fora da receita da DRE em um mês (mesma regra das outras contas daquele mês). */
const FORA_DA_DRE: Record<string, (filial: number) => boolean> = { "2026-09": (f) => (f >= 200 && f < 300) || (f >= 500 && f < 600) };

const DIARIOS: RelatorioVendas[] =["filiais", "grupos", "laboratorios", "atendimentos", "tele_entrega", "ecommerce"];

/** Lê uma coleta e grava os números. Lança LeituraErro quando o Excel não tem o formato esperado. */
export async function lerColeta(client: Cliente, coleta: ColetaParaLer, filiais: Map<number, string>): Promise<ResultadoLeitura> {
  if (!coleta.arquivo_b64) throw new LeituraErro("o Excel desta busca já foi apagado");
  const rel = coleta.relatorio as RelatorioVendas;
  if (DIARIOS.includes(rel) && coleta.de !== coleta.ate) throw new LeituraErro("relatório diário com período de mais de um dia");
  const m = matrizDe(coleta.arquivo_b64);
  const desconhecidas = new Set<number>();
  const branch = (filial: number) => {
    const id = filiais.get(filial);
    if (!id) desconhecidas.add(filial);
    return id;
  };
  const data = coleta.de;
  let linhas = 0;

  if (rel === "filiais") {
    const rows = lerVendasPorData(m).flatMap((f) => {
      const branch_id = branch(f.filial);
      return branch_id ? [{ branch_id, data, atendimentos: f.atendimentos, itens: f.itens, unidades: f.unidades, valor_bruto: f.valorBruto, desconto: f.desconto, venda: f.venda, coleta_id: coleta.id }] : [];
    });
    checar(await client.from("vendas_filial_dia").delete().eq("data", data));
    await emLotes(rows, (l) => client.from("vendas_filial_dia").insert(l));
    linhas = rows.length;
  } else if (rel === "grupos" || rel === "laboratorios") {
    const lidas = lerCmvAgrupado(m).filter((l) => rel === "grupos" || LABORATORIOS_ACOMPANHADOS.test(l.nome));
    const rows = somar(
      lidas.flatMap((l) => {
        const branch_id = branch(l.filial);
        return branch_id ? [{ branch_id, codigo: l.codigo, nome: l.nome, quantidade: l.quantidade, venda: l.venda, custo: l.custo }] : [];
      }),
      (l) => `${l.branch_id}|${l.codigo}`,
      ["quantidade", "venda", "custo"],
    );
    if (rel === "grupos") {
      checar(await client.from("vendas_grupo_dia").delete().eq("data", data));
      await emLotes(rows, (l) => client.from("vendas_grupo_dia").insert(l.map((r) => ({ branch_id: r.branch_id, data, grupo_codigo: r.codigo, grupo_nome: r.nome, quantidade: r.quantidade, venda: r.venda, custo: r.custo, coleta_id: coleta.id }))));
    } else {
      checar(await client.from("vendas_laboratorio_dia").delete().eq("data", data));
      await emLotes(rows, (l) => client.from("vendas_laboratorio_dia").insert(l.map((r) => ({ branch_id: r.branch_id, data, laboratorio_codigo: r.codigo, laboratorio_nome: r.nome, quantidade: r.quantidade, venda: r.venda, custo: r.custo, coleta_id: coleta.id }))));
    }
    linhas = rows.length;
  } else if (rel === "atendimentos" || rel === "tele_entrega") {
    const rows = somar(
      lerVendasPorVendedor(m).flatMap((v) => {
        const branch_id = branch(v.filial);
        return branch_id ? [{ branch_id, vendedor: v.vendedor, nome: v.vendedorNome, atendimentos: v.atendimentos, venda: v.venda, custo: v.custo }] : [];
      }),
      (l) => `${l.branch_id}|${l.vendedor}`,
      ["atendimentos", "venda", "custo"],
    );
    const tele = rel === "tele_entrega";
    // zera a parte deste relatório no dia e grava por cima; a outra parte (geral × tele) fica como está
    checar(await client.from("vendas_vendedor_dia").update(tele ? { tele_atendimentos: 0, tele_venda: 0, tele_custo: 0 } : { atendimentos: 0, venda: 0, custo: 0 }).eq("data", data));
    await emLotes(rows, (l) =>
      client.from("vendas_vendedor_dia").upsert(
        l.map((r) => ({ branch_id: r.branch_id, data, vendedor_codigo: r.vendedor, vendedor_nome: r.nome, ...(tele ? { tele_atendimentos: r.atendimentos, tele_venda: r.venda, tele_custo: r.custo } : { atendimentos: r.atendimentos, venda: r.venda, custo: r.custo }), coleta_id: coleta.id })),
        { onConflict: "branch_id,data,vendedor_codigo" },
      ),
    );
    checar(await client.from("vendas_vendedor_dia").delete().eq("data", data).eq("atendimentos", 0).eq("venda", 0).eq("tele_atendimentos", 0).eq("tele_venda", 0).eq("ecom_venda", 0));
    linhas = rows.length;
  } else if (rel === "vendedores") {
    if (!coleta.de.endsWith("-01") || coleta.ate.slice(0, 7) !== coleta.de.slice(0, 7)) throw new LeituraErro("o relatório de vendedores por grupo precisa ir do dia 1 até um dia do mesmo mês");
    const rows = somar(
      lerVendedorGrupo(m).flatMap((v) => {
        const branch_id = branch(v.filial);
        return branch_id ? [{ ...v, branch_id }] : [];
      }),
      (l) => `${l.branch_id}|${l.vendedor}|${l.grupo}`,
      ["quantidade", "desconto", "custo", "venda"],
    );
    checar(await client.from("vendas_vendedor_grupo_mes").delete().eq("mes", coleta.de));
    await emLotes(rows, (l) =>
      client.from("vendas_vendedor_grupo_mes").insert(
        l.map((r) => ({ branch_id: r.branch_id, mes: coleta.de, vendedor_codigo: r.vendedor, vendedor_nome: r.vendedorNome, grupo_codigo: r.grupo, grupo_nome: r.grupoNome, quantidade: r.quantidade, desconto: r.desconto, custo: r.custo, venda: r.venda, lido_ate: coleta.ate, coleta_id: coleta.id })),
      ),
    );
    linhas = rows.length;
  } else if (rel === "ecommerce") {
    // venda e-commerce de cada vendedor no dia (sai do televendas): zera a parte e-commerce do dia e grava por cima
    const rows = somar(
      lerVendasEcommerce(m).flatMap((v) => {
        const branch_id = branch(v.filial);
        return branch_id ? [{ branch_id, vendedor: v.vendedor, venda: v.venda, atendimentos: v.atendimentos }] : [];
      }),
      (l) => `${l.branch_id}|${l.vendedor}`,
      ["venda", "atendimentos"],
    );
    checar(await client.from("vendas_vendedor_dia").update({ ecom_venda: 0, ecom_atendimentos: 0 }).eq("data", data).neq("ecom_venda", 0));
    for (const r of rows) {
      // a linha do vendedor no dia vem do relatório por vendedor (que traz o nome); só completa a parte e-commerce
      const { data: feitas, error } = await client
        .from("vendas_vendedor_dia")
        .update({ ecom_venda: r.venda, ecom_atendimentos: r.atendimentos })
        .eq("branch_id", r.branch_id)
        .eq("data", data)
        .eq("vendedor_codigo", r.vendedor)
        .select("vendedor_codigo");
      if (error) throw new Error(error.message);
      if (!feitas?.length) checar(await client.from("vendas_vendedor_dia").insert({ branch_id: r.branch_id, data, vendedor_codigo: r.vendedor, vendedor_nome: `VENDEDOR ${r.vendedor}`, ecom_venda: r.venda, ecom_atendimentos: r.atendimentos, coleta_id: coleta.id }));
    }
    linhas = rows.length;
  } else if (rel === "receita") {
    // receita do mês fechado → "Vendas de mercadorias" da DRE, uma linha por filial, na empresa de cada filial. Só grava
    // se o mês for inteiro, as contas do relatório baterem e toda filial do Trier existir no portal (nada pela metade).
    const [a, mm] = coleta.de.split("-").map(Number);
    const fimMes = new Date(Date.UTC(a, mm, 0)).toISOString().slice(0, 10);
    if (!coleta.de.endsWith("-01") || coleta.ate !== fimMes) throw new LeituraErro("a receita da DRE precisa ser do mês inteiro (dia 1 ao último dia)");
    const { filiais: lidas, totalGeral } = lerReceitaPorFilial(m);
    const semCadastro = lidas.filter((f) => !filiais.get(f.filial));
    if (semCadastro.length) throw new LeituraErro(`filial do Trier sem cadastro no portal: ${semCadastro.map((f) => `${f.filial} ${f.nome}`).join(", ")}; nada foi gravado na DRE`);
    // set/2026 ficou sem Itajaí (F2xx) e Blumenau (F5xx) na DRE, a pedido do Luiz (migração 0110): a receita segue igual
    const fora = FORA_DA_DRE[coleta.de.slice(0, 7)];
    const valores = lidas.filter((f) => !fora?.(f.filial)).map((f) => ({ branch_id: filiais.get(f.filial)!, valor: f.venda }));
    const { error } = await client.rpc("dre_receita_trier_gravar", { p_competencia: coleta.de, p_valores: valores, p_arquivo: `Trier: Vendas Produtos ${coleta.de.slice(0, 7)} (robô, total ${totalGeral.toFixed(2)})` });
    if (error) throw new LeituraErro(`DRE: ${error.message}`);
    linhas = valores.length;
  } else throw new LeituraErro(`relatório desconhecido: ${coleta.relatorio}`);

  checar(await client.from("vendas_coletas").update({ lido_em: new Date().toISOString(), linhas, erro: null }).eq("id", coleta.id));
  return { linhas, filiaisDesconhecidas: [...desconhecidas].sort((a, b) => a - b) };
}

/** Lê a coleta e, se der erro, anota na própria coleta (o Excel continua guardado para ler de novo). */
export async function lerColetaAnotando(client: Cliente, coleta: ColetaParaLer, filiais: Map<number, string>) {
  try {
    return { ...(await lerColeta(client, coleta, filiais)), erro: null };
  } catch (e) {
    const erro = `leitura: ${e instanceof Error ? e.message : String(e)}`;
    await client.from("vendas_coletas").update({ erro, lido_em: null }).eq("id", coleta.id);
    return { linhas: 0, filiaisDesconhecidas: [], erro };
  }
}

/** Lê de novo as coletas guardadas (mais antiga primeiro: a mais nova de cada período fica valendo). */
export async function relerColetas(client: Cliente, opcoes: { soNaoLidas: boolean; prazoMs: number }) {
  const comeco = Date.now();
  const filiais = await mapaFiliaisTrier(client);
  let q = client.from("vendas_coletas").select("id, relatorio, de, ate").eq("status", "ok").not("arquivo_b64", "is", null).order("coletado_em").limit(2000);
  if (opcoes.soNaoLidas) q = q.is("lido_em", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  let lidas = 0;
  const erros: string[] = [];
  for (const c of data ?? []) {
    if (Date.now() - comeco > opcoes.prazoMs) break;
    const { data: arq } = await client.from("vendas_coletas").select("arquivo_b64").eq("id", c.id).single();
    const r = await lerColetaAnotando(client, { ...c, arquivo_b64: arq?.arquivo_b64 ?? null }, filiais);
    if (r.erro) erros.push(`${c.relatorio} ${c.de}: ${r.erro}`);
    else lidas++;
  }
  return { total: data?.length ?? 0, lidas, erros };
}
