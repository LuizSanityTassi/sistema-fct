// Ficha 360° do funcionário (servidor): junta o que os outros módulos sabem da pessoa — documentos, ASO, folha,
// quebras de caixa, equipamentos, usuário do sistema e histórico. Cada leitura passa pela RLS: gerente vê só o que
// a regra dele permite (sem salário, sem folha); admin e RH veem tudo.
import { INICIO_OPERACAO } from "@/lib/operacao";
import type { AppRole } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { listarAsoDoFuncionario, listarDocumentosDoFuncionario } from "./documentos";

export const ITENS_DESLIGAMENTO = [
  { item: "equipamentos", rotulo: "Recolher equipamentos (notebook, celular, crachá)" },
  { item: "acessos", rotulo: "Revogar acessos aos sistemas (Trier, e-mail, Omie…)" },
  { item: "documentos", rotulo: "Conferir documentos da rescisão" },
  { item: "folha", rotulo: "Conferir os lançamentos da folha do mês da saída" },
  { item: "gestor", rotulo: "Avisar o gestor da loja" },
] as const;
export type ItemDesligamento = (typeof ITENS_DESLIGAMENTO)[number]["item"];

export async function carregarFicha360(employeeId: string, papel: AppRole) {
  const supabase = await createClient();
  const rh = papel === "admin" || papel === "rh";
  const vazio = Promise.resolve({ data: null, error: null });
  const [documentos, asos, quebras, ativos, usuario, lancamentos, observacoes, checklist, historico] = await Promise.all([
    listarDocumentosDoFuncionario(employeeId),
    listarAsoDoFuncionario(employeeId),
    supabase
      .from("caixa_diferencas")
      .select("id, dia, numero_caixa, origem, descricao, diferenca, valor_quebra, andamento, competencia, filial:branches!caixa_diferencas_branch_id_fkey(codigo)")
      .eq("employee_id", employeeId)
      .eq("classe", "quebra")
      .gte("dia", INICIO_OPERACAO)
      .order("dia", { ascending: false })
      .limit(100),
    supabase.from("it_assets").select("id, tipo, descricao, patrimonio, numero_serie, status, filial:branches(codigo)").eq("responsavel_employee_id", employeeId).eq("ativo", true),
    supabase.from("profiles").select("id, nome, email, papel, ativo, ultimo_acesso").eq("employee_id", employeeId).maybeSingle(),
    rh
      ? supabase.from("folha_lancamentos").select("competencia, valor, origem, evento:folha_eventos(nome, unidade, ordem)").eq("employee_id", employeeId).order("competencia", { ascending: false }).limit(300)
      : vazio,
    rh ? supabase.from("folha_observacoes").select("competencia, texto, pendente").eq("employee_id", employeeId).order("competencia", { ascending: false }) : vazio,
    rh ? supabase.from("rh_desligamento_checklist").select("item, feito_por_nome, feito_em").eq("employee_id", employeeId) : vazio,
    rh ? supabase.rpc("rh_historico_funcionario", { p_employee: employeeId }) : vazio,
  ]);

  const hoje = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
  const asoAtual = [...asos].filter((a) => a.data_validade).sort((a, b) => (b.data_validade ?? "").localeCompare(a.data_validade ?? ""))[0] ?? null;
  const limite30 = new Date(Date.parse(`${hoje}T12:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const situacaoAso = !asoAtual ? "sem" : (asoAtual.data_validade ?? "") < hoje ? "vencido" : (asoAtual.data_validade ?? "") <= limite30 ? "vencendo" : "valido";

  // lançamentos da folha agrupados por mês
  const porMes = new Map<string, { evento: string; unidade: string; ordem: number; valor: number; origem: string }[]>();
  for (const l of lancamentos.data ?? []) {
    const ev = l.evento as { nome: string; unidade: string; ordem: number } | null;
    const lista = porMes.get(l.competencia) ?? [];
    lista.push({ evento: ev?.nome ?? "Evento", unidade: ev?.unidade ?? "valor", ordem: ev?.ordem ?? 0, valor: Number(l.valor), origem: l.origem });
    porMes.set(l.competencia, lista);
  }
  const obsPorMes = new Map((observacoes.data ?? []).map((o) => [o.competencia, o]));
  const meses = [...new Set([...porMes.keys(), ...obsPorMes.keys()])].sort().reverse();
  const folhaPorMes = meses.map((m) => ({ competencia: m, eventos: (porMes.get(m) ?? []).sort((a, b) => a.ordem - b.ordem), observacao: obsPorMes.get(m) ?? null }));

  const listaQuebras = quebras.data ?? [];
  return {
    rh,
    documentos,
    asos,
    asoAtual,
    situacaoAso,
    quebras: listaQuebras,
    quebrasAbertas: listaQuebras.filter((q) => q.andamento === "pendente" || q.andamento === "justificada").length,
    ativos: ativos.data ?? [],
    usuario: usuario.data,
    folhaPorMes,
    checklist: new Map((checklist.data ?? []).map((c) => [c.item, c])),
    historico: historico.data ?? [],
  };
}
