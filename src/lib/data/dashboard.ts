import { resumoAso } from "@/lib/data/documentos";
import { hojeIso } from "@/lib/formatos";
import { competenciaAtual } from "@/lib/rh/competencia";
import { createClient } from "@/lib/supabase/server";

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Números do painel. Tudo passa pelo RLS: cada papel vê só o que pode
 * (gerente/usuário enxergam a própria unidade; folha e salários só admin/RH).
 */
export async function carregarDashboard(opcoes: { incluirFolha: boolean }) {
  const supabase = await createClient();
  const hoje = hojeIso();
  const competencia = competenciaAtual();

  const [funcionarios, unidades, chamados, aso, asoVencendo, chamadosUrgentes, porRegional, folha] = await Promise.all([
    supabase.from("employees").select("status"),
    supabase.from("branches").select("id, ativo"),
    supabase.from("tickets").select("status, responsavel, prioridade").not("status", "in", "(resolvido,cancelado)"),
    resumoAso(),
    supabase
      .from("employee_aso")
      .select("id, data_validade, tipo, employees!inner(id, nome, status)")
      .eq("ativo", true)
      .neq("employees.status", "desligado")
      .lte("data_validade", somarDias(hoje, 30))
      .order("data_validade", { ascending: true })
      .limit(6),
    supabase
      .from("tickets")
      .select("id, numero, titulo, prioridade, status, created_at, unidade:branches(codigo)")
      .not("status", "in", "(resolvido,cancelado)")
      .in("prioridade", ["alta", "critica"])
      .order("created_at", { ascending: true })
      .limit(6),
    supabase
      .from("employees")
      .select("id, branches!employees_branch_id_fkey(regional)")
      .neq("status", "desligado"),
    opcoes.incluirFolha
      ? supabase.from("payroll_records").select("status, valor_liquido").eq("competencia", competencia)
      : Promise.resolve({ data: null, error: null }),
  ]);

  const statusFunc = { ativo: 0, afastado: 0, ferias: 0, desligado: 0 };
  for (const f of funcionarios.data ?? []) statusFunc[f.status] += 1;

  const unidadesAtivas = (unidades.data ?? []).filter((u) => u.ativo).length;

  const chamadosAbertos = chamados.data ?? [];
  const chamadosSemResponsavel = chamadosAbertos.filter((c) => !c.responsavel).length;
  const chamadosUrgentesQtd = chamadosAbertos.filter((c) => c.prioridade === "alta" || c.prioridade === "critica").length;

  const regionais = new Map<string, number>();
  for (const e of porRegional.data ?? []) {
    const r = e.branches?.regional ?? "Sem regional";
    regionais.set(r, (regionais.get(r) ?? 0) + 1);
  }

  let resumoFolha: { total: number; rascunho: number; fechada: number; paga: number; liquido: number } | null = null;
  if (opcoes.incluirFolha && folha.data) {
    resumoFolha = { total: folha.data.length, rascunho: 0, fechada: 0, paga: 0, liquido: 0 };
    for (const r of folha.data) {
      resumoFolha[r.status] += 1;
      resumoFolha.liquido += Number(r.valor_liquido);
    }
  }

  return {
    competencia,
    funcionarios: statusFunc,
    unidadesAtivas,
    chamados: { abertos: chamadosAbertos.length, semResponsavel: chamadosSemResponsavel, urgentes: chamadosUrgentesQtd },
    aso,
    asoVencendo: asoVencendo.data ?? [],
    chamadosUrgentes: chamadosUrgentes.data ?? [],
    regionais: [...regionais.entries()].sort((a, b) => b[1] - a[1]),
    folha: resumoFolha,
  };
}
