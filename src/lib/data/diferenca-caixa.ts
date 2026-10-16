// Leituras da diferença de caixa (servidor). A RLS decide o que cada um vê: financeiro/admin tudo; colaborador,
// responsável e gerente só as quebras do seu caixa ou da sua filial.
import { createClient } from "@/lib/supabase/server";

export const TAMANHO_PAGINA_CAIXA = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export type FiltrosCaixa = { de: string; ate: string; filial: string | null; situacao: string; q: string | null; pagina: number };

const isoDe = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Ontem no horário de Brasília (UTC−3). */
export const ontemNoBrasil = () => isoDe(Date.now() - 27 * 3_600_000);

export function lerFiltrosCaixa(sp: Record<string, string | string[] | undefined>): FiltrosCaixa {
  const t = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const ate = DIA.test(t("ate")) ? t("ate") : ontemNoBrasil();
  const de = DIA.test(t("de")) && t("de") <= ate ? t("de") : isoDe(Date.parse(`${ate}T12:00:00Z`) - 6 * 86_400_000);
  const pagina = Math.max(1, Number.parseInt(t("pagina"), 10) || 1);
  return { de, ate, filial: UUID.test(t("filial")) ? t("filial") : null, situacao: t("situacao"), q: t("q") || null, pagina };
}

// o financeiro não lê employees (RLS do RH): o nome do funcionário vem de funcionariosDoCaixa()
const COLUNAS =
  "id, dia, numero_caixa, cod_operador, nome_operador, informado, diferenca, classe, andamento, valor_quebra, employee_id, gestor_id, origem, descricao, justificada_em, filial:branches!caixa_diferencas_branch_id_fkey(id, codigo, nome)";

function aplicarSituacao<Q extends { eq: (c: string, v: string) => Q }>(consulta: Q, situacao: string): Q {
  if (situacao === "quebras") return consulta.eq("classe", "quebra");
  if (["pendente", "justificada", "mantida", "abonada"].includes(situacao)) return consulta.eq("classe", "quebra").eq("andamento", situacao);
  if (situacao === "tolerancia" || situacao === "sem_diferenca") return consulta.eq("classe", situacao);
  return consulta;
}

export async function listarCaixas(f: FiltrosCaixa) {
  const supabase = await createClient();
  let consulta = supabase.from("caixa_diferencas").select(COLUNAS, { count: "exact" }).gte("dia", f.de).lte("dia", f.ate);
  if (f.filial) consulta = consulta.eq("branch_id", f.filial);
  consulta = aplicarSituacao(consulta, f.situacao);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (/^\d+$/.test(termo)) consulta = consulta.or(`numero_caixa.eq.${termo},cod_operador.eq.${termo}`);
    else if (termo) consulta = consulta.ilike("nome_operador", `%${termo}%`);
  }
  const de = (f.pagina - 1) * TAMANHO_PAGINA_CAIXA;
  const { data, error, count } = await consulta
    .order("dia", { ascending: false })
    .order("branch_id")
    .order("numero_caixa", { ascending: false })
    .range(de, de + TAMANHO_PAGINA_CAIXA - 1);
  if (error) throw new Error(error.message);
  const total = count ?? 0;
  return { itens: data ?? [], total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA_CAIXA)) };
}

/** Números do período (filial opcional), sem o filtro de situação: caixas, quebras por andamento, faltas e sobras. */
export async function resumoCaixas(f: Pick<FiltrosCaixa, "de" | "ate" | "filial">) {
  const supabase = await createClient();
  const r = { caixas: 0, semDiferenca: 0, tolerancia: 0, quebras: 0, pendentes: 0, justificadas: 0, mantidas: 0, abonadas: 0, totalFalta: 0, totalSobra: 0, semFuncionario: 0 };
  for (let de = 0; ; de += 1000) {
    let q = supabase.from("caixa_diferencas").select("classe, andamento, diferenca, valor_quebra, employee_id").gte("dia", f.de).lte("dia", f.ate);
    if (f.filial) q = q.eq("branch_id", f.filial);
    const { data, error } = await q.order("id").range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const c of data ?? []) {
      r.caixas++;
      if (c.classe === "sem_diferenca") r.semDiferenca++;
      else if (c.classe === "tolerancia") r.tolerancia++;
      else {
        r.quebras++;
        if (c.andamento === "pendente") r.pendentes++;
        else if (c.andamento === "justificada") r.justificadas++;
        else if (c.andamento === "mantida") r.mantidas++;
        else if (c.andamento === "abonada") r.abonadas++;
        if (!c.employee_id) r.semFuncionario++;
        if (Number(c.diferenca) > 0) r.totalFalta += Number(c.valor_quebra);
        else r.totalSobra += Number(c.valor_quebra);
      }
    }
    if ((data ?? []).length < 1000) break;
  }
  r.totalFalta = Math.round(r.totalFalta * 100) / 100;
  r.totalSobra = Math.round(r.totalSobra * 100) / 100;
  return r;
}

/** Buscas do robô no período: quantas filiais foram lidas e quais deram erro. */
export async function coletasDoPeriodo(de: string, ate: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_coletas")
    .select("dia, status, caixas, mensagem, duracao_ms, coletado_em, filial:branches!caixa_coletas_branch_id_fkey(codigo)")
    .gte("dia", de)
    .lte("dia", ate)
    .order("dia", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function obterCaixa(id: string) {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("caixa_diferencas")
    .select(
      "*, filial:branches!caixa_diferencas_branch_id_fkey(id, codigo, nome)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarOperadores() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("caixa_operadores_resumo").select("*").order("quebras_sem_funcionario", { ascending: false }).order("nome_trier");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Quebras que a pessoa logada vê: as que ela justifica como gestor e, se for colaborador de caixa, as dela (só ver). */
export async function minhasQuebras(abertas: boolean) {
  const supabase = await createClient();
  let q = supabase.from("caixa_diferencas").select(`${COLUNAS}, justificativa, decisao_obs`).eq("classe", "quebra");
  if (abertas) q = q.in("andamento", ["pendente", "justificada"]);
  const { data, error } = await q.order("dia", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Aviso do painel: para o financeiro, as justificadas esperando decisão; para os outros, as quebras a justificar. */
export async function contarQuebrasDoPainel(papel: string, userId: string) {
  const supabase = await createClient();
  const contar = async (filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => (await filtro(base())).count ?? 0;
  function base() {
    return supabase.from("caixa_diferencas").select("id", { count: "exact", head: true }).eq("classe", "quebra");
  }
  if (papel === "admin" || papel === "financeiro") {
    const n = await contar((q) => q.eq("andamento", "justificada"));
    return { quantidade: n, href: "/financeiro/diferenca-caixa?situacao=justificada", titulo: `${n} quebra(s) de caixa justificada(s)`, texto: "esperando a decisão do financeiro (manter o desconto ou abonar)." };
  }
  // gestor: as que ele justifica (sem gestor definido, o gerente da loja); a RLS já limita às lojas dele
  const comoGestor = await contar((q) => (papel === "gerente" ? q.eq("andamento", "pendente").or(`gestor_id.eq.${userId},gestor_id.is.null`) : q.eq("andamento", "pendente").eq("gestor_id", userId)));
  if (comoGestor > 0) return { quantidade: comoGestor, href: "/caixa", titulo: `${comoGestor} quebra(s) de caixa para justificar.`, texto: "Registre o que aconteceu antes do fechamento da folha." };
  // colaborador: só vê as dele
  const minhas = await contar((q) => q.eq("andamento", "pendente"));
  return { quantidade: minhas, href: "/caixa", titulo: `Você tem ${minhas} quebra(s) de caixa.`, texto: "Justifique para o seu gestor: é ele quem registra no sistema." };
}

export type FuncionarioCaixa = { id: string; nome: string; cargo: string | null; matricula: string | null; branch_id: string; filial: string; status: string };

/** Funcionários (nome, cargo, matrícula, loja) para o financeiro ligar operadores e ver de quem é a quebra. */
export async function funcionariosDoCaixa(): Promise<FuncionarioCaixa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("caixa_funcionarios");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type UsuarioCaixa = { id: string; nome: string; papel: string; branch_id: string | null; filial: string | null };

/** Usuários ativos que o financeiro pode escolher como gestor (nome, papel e loja). */
export async function usuariosDoCaixa(): Promise<UsuarioCaixa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("caixa_usuarios");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Gestor das quebras de cada loja (definido pelo financeiro). */
export async function gestoresDasLojas() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("caixa_gestores").select("branch_id, profile_id, definido_em");
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((g) => [g.branch_id, g]));
}

/** Quebras em aberto (aguardando justificativa ou decisão) por loja e quantas estão sem gestor. */
export async function quebrasAbertasPorLoja() {
  const supabase = await createClient();
  const porLoja = new Map<string, { abertas: number; semGestor: number }>();
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("caixa_diferencas")
      .select("branch_id, gestor_id")
      .eq("classe", "quebra")
      .in("andamento", ["pendente", "justificada"])
      .order("id")
      .range(de, de + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const x = porLoja.get(r.branch_id) ?? { abertas: 0, semGestor: 0 };
      x.abertas++;
      if (!r.gestor_id) x.semGestor++;
      porLoja.set(r.branch_id, x);
    }
    if ((data ?? []).length < 1000) break;
  }
  return porLoja;
}
