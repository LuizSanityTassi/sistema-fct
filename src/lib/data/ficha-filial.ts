// Filial 360° (servidor): o que cada módulo sabe da loja — pessoas, financeiro, caixa, folha, conciliação e TI.
// Cada parte só é consultada para quem pode abrir o módulo e passa pela RLS (gerente vê a própria loja).
import { desdeOInicio, INICIO_OPERACAO } from "@/lib/operacao";
import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";

const vazio = Promise.resolve({ data: null, error: null });
const isoBrasil = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 10);

/** Competência anterior a "aaaa-mm". */
export function competenciaAnterior(c: string) {
  const [a, m] = c.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export async function carregarFicha360Filial(branchId: string, papel: AppRole) {
  const supabase = await createClient();
  const ve = {
    pessoas: ["admin", "rh", "gerente"].includes(papel),
    financeiro: ["admin", "financeiro", "contador"].includes(papel),
    conciliacao: ["admin", "financeiro", "contador"].includes(papel),
    caixa: ["admin", "financeiro", "rh", "coordenador", "gerente"].includes(papel),
    caixaTudo: papel === "admin" || papel === "financeiro",
    folha: papel === "admin" || papel === "rh",
  };
  const agora = Date.now();
  const hoje = isoBrasil(agora);
  const ha30 = isoBrasil(agora - 30 * 86_400_000);
  const em30 = isoBrasil(agora + 30 * 86_400_000);
  const compAtual = hoje.slice(0, 7);

  const [funcionarios, asos, lancamentos, categorias, caixas, pendencias, folha, dominio, ativos, chamados, gestor, usuarios] = await Promise.all([
    ve.pessoas ? supabase.from("employees").select("id, matricula, nome, cargo, data_admissao, status").eq("branch_id", branchId).order("nome") : vazio,
    ve.pessoas ? supabase.from("employee_aso").select("employee_id, data_validade, employees!inner(branch_id, status)").eq("ativo", true).eq("employees.branch_id", branchId).neq("employees.status", "desligado") : vazio,
    ve.financeiro ? supabase.from("fin_lancamentos").select("tipo, valor, competencia, categoria_id").eq("branch_id", branchId).order("competencia", { ascending: false }).limit(3000) : vazio,
    ve.financeiro ? supabase.from("fin_categorias").select("id, nome, grupo") : vazio,
    ve.caixa
      ? supabase.from("caixa_diferencas").select("id, dia, numero_caixa, origem, nome_operador, diferenca, valor_quebra, classe, andamento").eq("branch_id", branchId).gte("dia", desdeOInicio(ha30)).order("dia", { ascending: false }).limit(1000)
      : vazio,
    ve.conciliacao ? supabase.from("conc_pendencias").select("chave, problema, beneficiario, valor, vencimento, status").eq("branch_id", branchId).in("status", ["pendente", "em_analise"]).gte("vencimento", INICIO_OPERACAO).order("vencimento").limit(200) : vazio,
    ve.folha ? supabase.from("folha_lancamentos").select("competencia, employee_id, valor, evento:folha_eventos(nome, unidade, ordem)").eq("branch_id", branchId).in("competencia", [`${compAtual}-01`, `${competenciaAnterior(compAtual)}-01`]) : vazio,
    ve.folha ? supabase.from("folha_empresas_dominio").select("codigo_dominio").eq("branch_id", branchId).maybeSingle() : vazio,
    supabase.from("it_assets").select("id, tipo, descricao, patrimonio, status, responsavel:employees(nome)").eq("branch_id", branchId).eq("ativo", true).order("tipo"),
    supabase.from("tickets").select("id, numero, titulo, categoria, prioridade, status, created_at").eq("branch_id", branchId).not("status", "in", "(resolvido,cancelado)").order("created_at", { ascending: false }).limit(50),
    ve.caixaTudo ? supabase.from("caixa_gestores").select("profile_id").eq("branch_id", branchId).maybeSingle() : vazio,
    ve.caixaTudo ? supabase.rpc("caixa_usuarios") : papel === "rh" || papel === "ti" ? supabase.from("profiles").select("id, nome, papel, branch_id").eq("ativo", true) : vazio,
  ]);

  // pessoas
  const listaFuncionarios = funcionarios.data ?? [];
  const porStatus = { ativo: 0, afastado: 0, ferias: 0, desligado: 0 } as Record<string, number>;
  for (const f of listaFuncionarios) porStatus[f.status] = (porStatus[f.status] ?? 0) + 1;
  const asoPorFuncionario = new Map<string, string>();
  for (const a of asos.data ?? []) if (a.data_validade && (asoPorFuncionario.get(a.employee_id) ?? "") < a.data_validade) asoPorFuncionario.set(a.employee_id, a.data_validade);
  const situacaoAso = (id: string) => {
    const v = asoPorFuncionario.get(id);
    return !v ? "sem" : v < hoje ? "vencido" : v <= em30 ? "vencendo" : "valido";
  };
  const ativosNaLoja = listaFuncionarios.filter((f) => f.status !== "desligado");
  const aso = { vencidos: 0, vencendo: 0, sem: 0 };
  for (const f of ativosNaLoja) {
    const s = situacaoAso(f.id);
    if (s === "vencido") aso.vencidos++;
    else if (s === "vencendo") aso.vencendo++;
    else if (s === "sem") aso.sem++;
  }

  // financeiro: últimos meses com lançamento (receber × pagar), com variação contra o mês anterior
  const nomeCategoria = new Map((categorias.data ?? []).map((c) => [c.id, c.nome]));
  const porComp = new Map<string, { receitas: number; despesas: number }>();
  const despesasPorCategoria = new Map<string, Map<string, number>>();
  for (const l of lancamentos.data ?? []) {
    const x = porComp.get(l.competencia) ?? { receitas: 0, despesas: 0 };
    if (l.tipo === "receber") x.receitas += Number(l.valor);
    else {
      x.despesas += Number(l.valor);
      const mapa = despesasPorCategoria.get(l.competencia) ?? new Map<string, number>();
      const nome = (l.categoria_id && nomeCategoria.get(l.categoria_id)) || "Sem categoria";
      mapa.set(nome, (mapa.get(nome) ?? 0) + Number(l.valor));
      despesasPorCategoria.set(l.competencia, mapa);
    }
    porComp.set(l.competencia, x);
  }
  const meses = [...porComp.keys()].sort().reverse().slice(0, 6);
  const financeiro = meses.map((c) => ({ competencia: c, ...porComp.get(c)!, resultado: porComp.get(c)!.receitas - porComp.get(c)!.despesas }));
  const ultimoMes = financeiro[0] ?? null;
  const topDespesas = ultimoMes ? [...(despesasPorCategoria.get(ultimoMes.competencia) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6) : [];

  // caixa (últimos 30 dias)
  const listaCaixas = caixas.data ?? [];
  const quebras = listaCaixas.filter((c) => c.classe === "quebra");
  const caixa = {
    caixas: ve.caixaTudo ? listaCaixas.length : null,
    tolerancia: ve.caixaTudo ? listaCaixas.filter((c) => c.classe === "tolerancia").length : null,
    quebras: quebras.length,
    abertas: quebras.filter((q) => q.andamento === "pendente" || q.andamento === "justificada").length,
    faltas: quebras.filter((q) => Number(q.diferenca) > 0 && q.andamento !== "abonada").reduce((s, q) => s + Number(q.valor_quebra), 0),
    sobras: quebras.filter((q) => Number(q.diferenca) < 0 && q.andamento !== "abonada").reduce((s, q) => s + Number(q.valor_quebra), 0),
    ultimas: quebras.slice(0, 10),
  };

  // conciliação
  const listaPendencias = pendencias.data ?? [];
  const conciliacao = {
    abertas: listaPendencias.length,
    vencidas: listaPendencias.filter((p) => p.vencimento && p.vencimento < hoje).length,
    valor: listaPendencias.reduce((s, p) => s + Number(p.valor ?? 0), 0),
    proximas: listaPendencias.slice(0, 8),
  };

  // folha (mês atual e anterior): soma por evento e quantos funcionários com lançamento
  const resumoFolha = (comp: string) => {
    const linhas = (folha.data ?? []).filter((l) => l.competencia === `${comp}-01`);
    const porEvento = new Map<string, { nome: string; unidade: string; ordem: number; total: number }>();
    for (const l of linhas) {
      const ev = l.evento as { nome: string; unidade: string; ordem: number } | null;
      const k = ev?.nome ?? "Evento";
      const x = porEvento.get(k) ?? { nome: k, unidade: ev?.unidade ?? "valor", ordem: ev?.ordem ?? 0, total: 0 };
      x.total += Number(l.valor);
      porEvento.set(k, x);
    }
    return { competencia: comp, funcionarios: new Set(linhas.map((l) => l.employee_id)).size, eventos: [...porEvento.values()].sort((a, b) => a.ordem - b.ordem) };
  };

  // gestão: gestor das quebras e gerentes da loja
  const listaUsuarios = (usuarios.data ?? []) as { id: string; nome: string; papel: string; branch_id: string | null }[];
  const gestorId = (gestor.data as { profile_id: string } | null)?.profile_id ?? null;
  // gerentes primeiro, depois os líderes de loja (um nível abaixo)
  const gerentes = [
    ...listaUsuarios.filter((u) => u.papel === "gerente" && u.branch_id === branchId).map((u) => u.nome),
    ...listaUsuarios.filter((u) => u.papel === "lider_loja" && u.branch_id === branchId).map((u) => `${u.nome} (líder de loja)`),
  ];

  const listaChamados = chamados.data ?? [];
  return {
    ve,
    hoje,
    pessoas: { lista: listaFuncionarios, porStatus, aso, situacaoAso },
    financeiro,
    ultimoMes,
    topDespesas,
    caixa,
    conciliacao,
    folha: ve.folha ? { atual: resumoFolha(compAtual), anterior: resumoFolha(competenciaAnterior(compAtual)), codigoDominio: (dominio.data as { codigo_dominio: number | null } | null)?.codigo_dominio ?? null } : null,
    ativos: ativos.data ?? [],
    chamados: listaChamados,
    gestorNome: gestorId ? (listaUsuarios.find((u) => u.id === gestorId)?.nome ?? "usuário inativo") : null,
    gerentes,
    leGestao: ve.caixaTudo || papel === "rh" || papel === "ti",
  };
}
