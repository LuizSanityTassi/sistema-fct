import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";
import { tipoAtivoValido, type StatusAtivo } from "@/lib/ti/rotulos";

export const TAMANHO_PAGINA = 25;

// ---------- fila de TI (chamados da categoria "ti") ----------

export async function resumoFilaTi() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("status, prioridade, responsavel, subcategoria, created_at, resolved_at")
    .eq("categoria", "ti");
  if (error) throw error;
  const limite = Date.now() - 30 * 86_400_000;
  const r = { abertos: 0, semResponsavel: 0, urgentes: 0, aguardando: 0, acessosPendentes: 0, resolvidos30: 0, horasMedias: null as number | null };
  let somaHoras = 0;
  for (const t of data) {
    const encerrado = t.status === "resolvido" || t.status === "cancelado";
    if (!encerrado) {
      r.abertos += 1;
      if (!t.responsavel) r.semResponsavel += 1;
      if (t.prioridade === "alta" || t.prioridade === "critica") r.urgentes += 1;
      if (t.status === "aguardando_usuario" || t.status === "aguardando_terceiro") r.aguardando += 1;
      if (t.subcategoria === "acesso") r.acessosPendentes += 1;
    }
    if (t.status === "resolvido" && t.resolved_at && Date.parse(t.resolved_at) >= limite) {
      r.resolvidos30 += 1;
      somaHoras += (Date.parse(t.resolved_at) - Date.parse(t.created_at)) / 3_600_000;
    }
  }
  if (r.resolvidos30 > 0) r.horasMedias = Math.round(somaHoras / r.resolvidos30);
  return r;
}

export async function filaTi(limite = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tickets")
    .select("id, numero, titulo, prioridade, status, subcategoria, created_at, unidade:branches(codigo), quem_atende:profiles!tickets_responsavel_fkey(nome)")
    .eq("categoria", "ti")
    .not("status", "in", "(resolvido,cancelado)")
    .order("prioridade", { ascending: false }) // enum: baixa < normal < alta < critica
    .order("created_at", { ascending: true })
    .limit(limite);
  if (error) throw error;
  return data;
}

// ---------- ativos ----------

export type FiltrosAtivos = { q?: string; filial?: string; tipo?: string; status: StatusAtivo | "ativos" | "todos"; pagina: number };

export function lerFiltrosAtivos(sp: Record<string, string | string[] | undefined>): FiltrosAtivos {
  const s = (k: string) => (typeof sp[k] === "string" ? sp[k].trim() : "");
  const pagina = Number.parseInt(s("pagina"), 10);
  const status = s("status");
  const tipo = s("tipo");
  return {
    q: s("q") || undefined,
    filial: ehUuid(s("filial")) ? s("filial") : undefined,
    tipo: tipoAtivoValido(tipo) ? tipo : undefined,
    status:
      status === "todos" || status === "em_uso" || status === "estoque" || status === "manutencao" || status === "baixado"
        ? status
        : "ativos",
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export async function listarAtivos(f: FiltrosAtivos) {
  const supabase = await createClient();
  const de = (f.pagina - 1) * TAMANHO_PAGINA;
  let consulta = supabase
    .from("it_assets")
    .select(
      "id, tipo, descricao, patrimonio, numero_serie, status, valor, data_aquisicao, branch_id, unidade:branches(id, codigo, nome), responsavel:employees!it_assets_responsavel_employee_id_fkey(id, nome)",
      { count: "exact" },
    )
    .eq("ativo", true);
  if (f.status === "ativos") consulta = consulta.neq("status", "baixado");
  else if (f.status !== "todos") consulta = consulta.eq("status", f.status);
  if (f.filial) consulta = consulta.eq("branch_id", f.filial);
  if (f.tipo) consulta = consulta.eq("tipo", f.tipo);
  if (f.q) {
    const termo = f.q.replace(/[%_,().]/g, " ").trim();
    if (termo) {
      const like = `%${termo}%`;
      consulta = consulta.or(`descricao.ilike.${like},patrimonio.ilike.${like},numero_serie.ilike.${like}`);
    }
  }
  const { data, error, count } = await consulta
    .order("branch_id")
    .order("tipo")
    .order("descricao")
    .range(de, de + TAMANHO_PAGINA - 1);
  if (error) throw error;
  const total = count ?? 0;
  return { itens: data, total, pagina: f.pagina, paginas: Math.max(1, Math.ceil(total / TAMANHO_PAGINA)) };
}

export async function resumoAtivos() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("it_assets").select("tipo, status, valor, branch_id").eq("ativo", true);
  if (error) throw error;
  const porStatus: Record<StatusAtivo, number> = { em_uso: 0, estoque: 0, manutencao: 0, baixado: 0 };
  const porTipo = new Map<string, number>();
  const unidades = new Set<string>();
  let valorTotal = 0;
  for (const a of data) {
    porStatus[a.status] += 1;
    if (a.status !== "baixado") {
      porTipo.set(a.tipo, (porTipo.get(a.tipo) ?? 0) + 1);
      valorTotal += Number(a.valor ?? 0);
      unidades.add(a.branch_id);
    }
  }
  return {
    total: data.length,
    porStatus,
    porTipo: [...porTipo.entries()].sort((a, b) => b[1] - a[1]),
    valorTotal,
    unidadesComAtivos: unidades.size,
  };
}

export async function obterAtivo(id: string) {
  if (!ehUuid(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("it_assets")
    .select("*, unidade:branches(id, codigo, nome), responsavel:employees!it_assets_responsavel_employee_id_fkey(id, nome, cargo)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Histórico do equipamento (eventos automáticos e registros da TI), do mais novo para o mais antigo. */
export async function listarEventosDoAtivo(assetId: string) {
  if (!ehUuid(assetId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("it_asset_eventos").select("id, data, tipo, descricao, autor_nome, created_at").eq("asset_id", assetId).order("data", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
