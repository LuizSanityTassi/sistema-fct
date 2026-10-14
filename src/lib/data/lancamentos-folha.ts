// Leitura dos lançamentos da folha (eventos variáveis do mês) — só servidor. RLS: admin e RH.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rpcPaginado } from "@/lib/data/dre";
import {
  ativoNaCompetencia,
  competenciaParaData,
  funcaoCurta,
  nomeArquivoDominio,
  nomeEmpresa,
  raizCnpj,
  type EventoFolha,
  type UnidadeEvento,
} from "@/lib/rh/lancamentos";
import type { Database } from "@/lib/supabase/types";

type Cliente = SupabaseClient<Database>;

export type FilialFolha = {
  id: string;
  codigo: string;
  nome: string;
  cnpj: string | null;
  raiz: string;
  empresa: string;
  razaoSocialCadastro: string | null;
  codigoDominio: number | null;
  razaoSocialPlanilha: string | null;
  ativo: boolean;
};

export type FuncionarioFolha = {
  id: string;
  nome: string;
  matricula: string | null;
  cargo: string | null;
  funcao: string;
  /** CNPJ em que o funcionário está registrado hoje */
  branchId: string;
  /** CNPJ da planilha do mês: o dos lançamentos já gravados, senão o atual */
  branchPlanilha: string;
  ativoNoMes: boolean;
};

export type DadosCompetencia = {
  competencia: string;
  eventos: EventoFolha[];
  filiais: FilialFolha[];
  /** ativos no mês ou com lançamento/observação no mês */
  funcionarios: FuncionarioFolha[];
  /** employeeId → eventoId → valor */
  valores: Map<string, Record<string, number>>;
  observacoes: Map<string, { texto: string; pendente: boolean }>;
};

export async function carregarEventos(supabase: Cliente): Promise<EventoFolha[]> {
  const { data, error } = await supabase.from("folha_eventos").select("*").order("ordem").order("nome");
  if (error) throw new Error(error.message);
  return data.map((e) => ({
    id: e.id,
    chave: e.chave,
    codigo: e.codigo,
    nome: e.nome,
    unidade: e.unidade as UnidadeEvento,
    ordem: e.ordem,
    naPlanilha: e.na_planilha,
    ativo: e.ativo,
  }));
}

export async function carregarFiliais(supabase: Cliente): Promise<FilialFolha[]> {
  const [{ data: branches, error }, { data: cfg, error: e2 }] = await Promise.all([
    supabase.from("branches").select("id, codigo, nome, cnpj, razao_social, ativo").order("codigo"),
    supabase.from("folha_empresas_dominio").select("branch_id, codigo_dominio, razao_social"),
  ]);
  if (error) throw new Error(error.message);
  if (e2) throw new Error(e2.message);
  const porBranch = new Map(cfg.map((c) => [c.branch_id, c]));
  // nome da empresa pela raiz do CNPJ (a razão social de qualquer filial da mesma raiz serve)
  const razaoPorRaiz = new Map<string, string>();
  for (const b of branches) {
    const r = raizCnpj(b.cnpj);
    if (r && b.razao_social && !razaoPorRaiz.has(r)) razaoPorRaiz.set(r, b.razao_social);
  }
  return branches.map((b) => {
    const raiz = raizCnpj(b.cnpj);
    const c = porBranch.get(b.id);
    return {
      id: b.id,
      codigo: b.codigo,
      nome: b.nome,
      cnpj: b.cnpj,
      raiz,
      empresa: nomeEmpresa(razaoPorRaiz.get(raiz) ?? null),
      razaoSocialCadastro: b.razao_social ?? razaoPorRaiz.get(raiz) ?? null,
      codigoDominio: c?.codigo_dominio ?? null,
      razaoSocialPlanilha: c?.razao_social ?? null,
      ativo: b.ativo,
    };
  });
}

/** Razão social que sai no cabeçalho da planilha. */
export const razaoSocialDaPlanilha = (f: FilialFolha) => (f.razaoSocialPlanilha || f.razaoSocialCadastro || f.nome).toUpperCase();

export const arquivoDaFilial = (f: FilialFolha, competencia: string) => nomeArquivoDominio(f.cnpj, competencia, f.codigo);

export async function carregarCompetencia(supabase: Cliente, competencia: string): Promise<DadosCompetencia> {
  const data = competenciaParaData(competencia);
  const [eventos, filiais, funcionarios, lancamentos, obs] = await Promise.all([
    carregarEventos(supabase),
    carregarFiliais(supabase),
    rpcPaginado((a, b) =>
      supabase
        .from("employees")
        .select("id, nome, matricula, cargo, branch_id, status, data_admissao, data_desligamento")
        .order("nome")
        .order("id")
        .range(a, b),
    ),
    rpcPaginado((a, b) =>
      supabase.from("folha_lancamentos").select("employee_id, evento_id, branch_id, valor").eq("competencia", data).order("id").range(a, b),
    ),
    rpcPaginado((a, b) =>
      supabase.from("folha_observacoes").select("employee_id, texto, pendente").eq("competencia", data).order("employee_id").range(a, b),
    ),
  ]);

  const valores = new Map<string, Record<string, number>>();
  const branchLanc = new Map<string, string>();
  for (const l of lancamentos) {
    const m = valores.get(l.employee_id) ?? {};
    m[l.evento_id] = Number(l.valor);
    valores.set(l.employee_id, m);
    branchLanc.set(l.employee_id, l.branch_id);
  }
  const observacoes = new Map(obs.map((o) => [o.employee_id, { texto: o.texto, pendente: o.pendente }]));

  const lista: FuncionarioFolha[] = [];
  for (const e of funcionarios) {
    if (!e.branch_id) continue;
    const ativoNoMes = ativoNaCompetencia({ status: String(e.status), data_admissao: e.data_admissao, data_desligamento: e.data_desligamento }, competencia);
    if (!ativoNoMes && !valores.has(e.id) && !observacoes.has(e.id)) continue;
    lista.push({
      id: e.id,
      nome: e.nome,
      matricula: e.matricula,
      cargo: e.cargo,
      funcao: funcaoCurta(e.cargo),
      branchId: e.branch_id,
      branchPlanilha: branchLanc.get(e.id) ?? e.branch_id,
      ativoNoMes,
    });
  }
  return { competencia, eventos, filiais, funcionarios: lista, valores, observacoes };
}
