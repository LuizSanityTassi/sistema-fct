// Caixa do Omie dia a dia (pedido do Luiz em 05/11/2026): o Caixa contábil do portal é guardado por mês; o dia a dia vem
// do Omie, movimento a movimento da conta corrente (pagamentos, recebimentos e lançamentos direto no extrato), pela data
// de pagamento. Cada dia de cada empresa é lido inteiro e só então gravado (somado por natureza, categoria e
// departamento); se o número de movimentos lidos não bater com o total que o Omie informa, nada é gravado e o dia volta
// na rodada seguinte. Só leitura no Omie.
import type { SupabaseClient } from "@supabase/supabase-js";
import { EMPRESAS_OMIE, listarCategoriasOmie, listarDepartamentosOmie, movimentosCaixaDoDia, OmieErro, type Chaves, type EmpresaOmie, type MovimentoCaixaOmie } from "@/lib/conciliacao/omie-api";
import { chavesOmieServico } from "@/lib/integracoes/segredos";
import type { Database } from "@/lib/supabase/types";

type Cliente = SupabaseClient<Database>;

/** Primeiro dia buscado no Omie. */
export const INICIO_CAIXA_OMIE = "2026-01-01";
/** Os últimos dias são lidos de novo uma vez por noite (baixa lançada depois com data passada). */
export const DIAS_RELIDOS = 10;
const EMPRESAS: EmpresaOmie[] = ["varela", "nazario"];

const diaBrasil = (agora: Date, diasAtras = 0) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora.getTime() - diasAtras * 86_400_000));
const somarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export class TempoEsgotado extends Error {}

/** Departamento do Omie → filial do portal: CNPJ no nome, "Fxxx", os especiais e o código igual (mesma regra da importação). */
async function resolvedorFilial(admin: Cliente) {
  const { data, error } = await admin.from("branches").select("id, codigo, cnpj");
  if (error) throw new Error(error.message);
  const porCodigo = new Map((data ?? []).map((b) => [b.codigo.toUpperCase(), b.id]));
  const porCnpj = new Map<string, string>();
  for (const b of data ?? []) {
    const c = (b.cnpj ?? "").replace(/\D/g, "");
    if (c.length === 14) porCnpj.set(c, b.id);
  }
  const ESPECIAIS: Record<string, string> = { TERCEIRIZADAS: "TERC", TELEVENDAS: "TLV", "423 - ADMINISTRATIVO 20-82": "F423" };
  return (nome: string): string | null => {
    const t = nome.replace(/\s+/g, " ").trim();
    if (!t) return null;
    const cnpj = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.exec(t)?.[0];
    if (cnpj) {
      const id = porCnpj.get(cnpj.replace(/\D/g, ""));
      if (id) return id;
    }
    const esp = ESPECIAIS[t.toUpperCase()];
    if (esp) return porCodigo.get(esp) ?? null;
    const cod = /\bF\d{3}\b/i.exec(t)?.[0]?.toUpperCase();
    if (cod) return porCodigo.get(cod) ?? null;
    return porCodigo.get(t.toUpperCase()) ?? null;
  };
}

type Cadastros = { categorias: Map<string, string>; departamentos: Map<string, string>; filial: (nome: string) => string | null };
type Linha = { natureza: "P" | "R"; grupo: string; categoria: string; departamento: string; valor: number; movimentos: number };

/** Valor do movimento: o pago/recebido do título (uma baixa em lote repete o valor do extrato em cada título); sem ele,
 * o valor do lançamento no conta corrente. */
export const valorMovimento = (m: MovimentoCaixaOmie) => Number(m.resumo?.nValPago ?? m.detalhes?.nValorMovCC ?? 0) || 0;
/** Identidade do movimento (baixa em lote: mesmo lançamento no extrato, títulos diferentes). */
const idMovimento = (m: MovimentoCaixaOmie) => `${m.detalhes?.nCodMovCC ?? ""}|${m.detalhes?.nCodBaixa ?? ""}|${m.detalhes?.nCodTitulo ?? ""}`;

/** Distribui cada movimento por categoria e departamento (percentuais do Omie, normalizados para somar 100%). */
export function somarMovimentos(movs: MovimentoCaixaOmie[]): Map<string, Linha> {
  const out = new Map<string, Linha>();
  for (const m of movs) {
    const d = m.detalhes ?? {};
    const natureza = d.cNatureza === "R" ? "R" : "P";
    const valor = valorMovimento(m);
    const fatias = <T extends { nDistrPercentual?: number }>(xs: T[] | undefined, chave: (x: T) => string, padrao: string) => {
      const lista = (xs ?? []).map((x) => ({ k: chave(x), p: Math.max(0, Number(x.nDistrPercentual ?? 0)) })).filter((x) => x.p > 0);
      const soma = lista.reduce((s, x) => s + x.p, 0);
      return soma > 0 ? lista.map((x) => ({ k: x.k, p: x.p / soma })) : [{ k: padrao, p: 1 }];
    };
    const cats = fatias(m.categorias, (c) => String(c.cCodCateg ?? ""), String(d.cCodCateg ?? ""));
    const deps = fatias(m.departamentos, (x) => String(x.cCodDepartamento ?? ""), "");
    for (const c of cats)
      for (const dp of deps) {
        const k = `${natureza}|${d.cGrupo ?? ""}|${c.k}|${dp.k}`;
        const l = out.get(k) ?? { natureza, grupo: String(d.cGrupo ?? ""), categoria: c.k, departamento: dp.k, valor: 0, movimentos: 0 };
        l.valor += valor * c.p * dp.p;
        l.movimentos += 1;
        out.set(k, l);
      }
  }
  return out;
}

/** Lê o dia inteiro de uma empresa no Omie e troca o que estava gravado. Devolve quantos movimentos. */
async function coletarDia(admin: Cliente, ch: Chaves, emp: EmpresaOmie, dia: string, cad: Cadastros, prazo: number) {
  const movs: MovimentoCaixaOmie[] = [];
  let total = 0;
  for (let pagina = 1, paginas = 1; pagina <= paginas; pagina++) {
    if (Date.now() > prazo) throw new TempoEsgotado();
    const r = await movimentosCaixaDoDia(ch, emp, br(dia), pagina);
    paginas = r.paginas;
    total = r.total;
    movs.push(...r.movimentos);
  }
  // conferência: o que foi lido tem de ser o total que o Omie diz (alguém excluindo durante a leitura pula registros)
  const ids = new Set(movs.map(idMovimento));
  if (movs.length !== total || ids.size !== movs.length) throw new OmieErro(`${EMPRESAS_OMIE[emp]} ${br(dia)}: li ${movs.length} movimentos (${ids.size} diferentes) e o Omie informa ${total}; o dia fica para a próxima rodada.`);
  const linhas = [...somarMovimentos(movs).values()].filter((l) => Math.abs(l.valor) >= 0.00005);
  const rows = linhas.map((l) => {
    const depNome = cad.departamentos.get(l.departamento) ?? null;
    return {
      empresa: emp,
      data: dia,
      natureza: l.natureza,
      grupo: l.grupo,
      categoria_codigo: l.categoria,
      categoria_nome: cad.categorias.get(l.categoria) ?? null,
      departamento_codigo: l.departamento,
      departamento_nome: depNome,
      branch_id: depNome ? cad.filial(depNome) : null,
      valor: Math.round(l.valor * 10_000) / 10_000,
      movimentos: l.movimentos,
    };
  });
  const pago = movs.filter((m) => m.detalhes?.cNatureza !== "R").reduce((s, m) => s + valorMovimento(m), 0);
  const recebido = movs.filter((m) => m.detalhes?.cNatureza === "R").reduce((s, m) => s + valorMovimento(m), 0);
  const { error: e1 } = await admin.from("fin_caixa_omie").delete().eq("empresa", emp).eq("data", dia);
  if (e1) throw new Error(e1.message);
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await admin.from("fin_caixa_omie").insert(rows.slice(i, i + 500));
    if (error) {
      await admin.from("fin_caixa_omie").delete().eq("empresa", emp).eq("data", dia);
      throw new Error(error.message);
    }
  }
  const { error: e2 } = await admin
    .from("fin_caixa_omie_dias")
    .upsert({ empresa: emp, data: dia, movimentos: movs.length, total_pago: Math.round(pago * 100) / 100, total_recebido: Math.round(recebido * 100) / 100, coletado_em: new Date().toISOString() }, { onConflict: "empresa,data" });
  if (e2) throw new Error(e2.message);
  return movs.length;
}

/** Dias a buscar, em ordem: os últimos dias (uma vez por noite) e depois o histórico que falta, do mais recente para trás. */
export async function diasPendentesCaixaOmie(admin: Cliente, agora = new Date()) {
  const ontem = diaBrasil(agora, 1);
  const feitos = new Map<string, string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from("fin_caixa_omie_dias").select("empresa, data, coletado_em").gte("data", INICIO_CAIXA_OMIE).order("data").range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const d of data ?? []) feitos.set(`${d.empresa}|${d.data}`, d.coletado_em);
    if ((data?.length ?? 0) < 1000) break;
  }
  // começo do dia de hoje no Brasil (UTC−3)
  const inicioHoje = new Date(`${diaBrasil(agora)}T03:00:00Z`).toISOString();
  const out: { empresa: EmpresaOmie; data: string }[] = [];
  for (let d = ontem; d >= INICIO_CAIXA_OMIE; d = somarDias(d, -1)) {
    const recente = d > somarDias(ontem, -DIAS_RELIDOS);
    for (const emp of EMPRESAS) {
      const quando = feitos.get(`${emp}|${d}`);
      if (!quando || (recente && quando < inicioHoje)) out.push({ empresa: emp, data: d });
    }
  }
  return out;
}

/** Uma rodada do robô: busca os dias pendentes enquanto houver tempo. */
export async function coletarCaixaOmie(admin: Cliente, prazoMs: number, agora = new Date()) {
  const prazo = Date.now() + prazoMs;
  const pendentes = await diasPendentesCaixaOmie(admin, agora);
  const chaves = new Map<EmpresaOmie, Chaves | null>();
  const cadastros = new Map<EmpresaOmie, Cadastros>();
  const filial = await resolvedorFilial(admin);
  const feitos: string[] = [];
  const erros: string[] = [];
  const pulada = new Set<EmpresaOmie>();
  for (const p of pendentes) {
    if (Date.now() > prazo - 20_000) break;
    if (pulada.has(p.empresa)) continue;
    try {
      if (!chaves.has(p.empresa)) chaves.set(p.empresa, await chavesOmieServico(admin, p.empresa));
      const ch = chaves.get(p.empresa);
      if (!ch) {
        erros.push(`${EMPRESAS_OMIE[p.empresa]}: chaves da Omie não configuradas`);
        pulada.add(p.empresa);
        continue;
      }
      if (!cadastros.has(p.empresa)) {
        const [cats, deps] = await Promise.all([listarCategoriasOmie(ch, p.empresa), listarDepartamentosOmie(ch, p.empresa, true)]);
        cadastros.set(p.empresa, { categorias: new Map(cats.map((c) => [c.codigo, c.nome])), departamentos: new Map(deps.map((d) => [d.codigo, d.descricao])), filial });
      }
      const n = await coletarDia(admin, ch, p.empresa, p.data, cadastros.get(p.empresa)!, prazo - 15_000);
      feitos.push(`${p.empresa} ${p.data} (${n})`);
    } catch (e) {
      if (e instanceof TempoEsgotado) break;
      const msg = e instanceof Error ? e.message : String(e);
      erros.push(`${EMPRESAS_OMIE[p.empresa]} ${p.data}: ${msg}`);
      // API bloqueada ou sem conexão: não insiste com essa empresa nesta rodada
      if (/bloqueada|conex|consumo/i.test(msg)) pulada.add(p.empresa);
    }
  }
  return { pendentes: pendentes.length, feitos, erros };
}
