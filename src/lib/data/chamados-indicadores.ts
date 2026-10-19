// Indicadores dos chamados (servidor): tempos de primeira resposta e de resolução, SLA, por loja, por categoria e
// os assuntos que se repetem. Tudo pela RLS (cada atendente vê os chamados que atende).
import type { CategoriaChamado, PrioridadeChamado, StatusChamado } from "@/lib/chamados/rotulos";
import { situacaoSla } from "@/lib/chamados/sla";
import { rotuloTipo } from "@/lib/chamados/tipos";
import { normalizarNome } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";

type Linha = {
  id: string;
  numero: number;
  titulo: string;
  categoria: CategoriaChamado;
  subcategoria: string | null;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  created_at: string;
  resolved_at: string | null;
  primeira_resposta_em: string | null;
  unidade: { id: string; codigo: string; nome: string } | null;
};

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const minutos = (de: string, ate: string) => (Date.parse(ate) - Date.parse(de)) / 60_000;

/** Assunto do chamado para achar repetição: o tipo (Câmeras, Férias…) ou, sem tipo, as 3 primeiras palavras do título. */
const assunto = (t: Linha) => (t.subcategoria?.trim() ? normalizarNome(t.subcategoria) : normalizarNome(t.titulo).split(" ").filter((p) => p.length > 2).slice(0, 3).join(" "));

export async function carregarIndicadoresChamados(dias: number) {
  const supabase = await createClient();
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  const linhas: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, numero, titulo, categoria, subcategoria, prioridade, status, created_at, resolved_at, primeira_resposta_em, unidade:branches(id, codigo, nome)")
      .gte("created_at", desde)
      .order("created_at")
      .range(de, de + 999);
    if (error) throw error;
    linhas.push(...((data ?? []) as Linha[]));
    if ((data ?? []).length < 1000) break;
  }

  const resumir = (lista: Linha[]) => {
    const respostas = lista.filter((t) => t.primeira_resposta_em).map((t) => minutos(t.created_at, t.primeira_resposta_em!));
    const resolucoes = lista.filter((t) => t.status === "resolvido" && t.resolved_at).map((t) => minutos(t.created_at, t.resolved_at!));
    const avaliados = lista.map((t) => situacaoSla(t).estado).filter((e) => e === "respondido" || e === "respondido_atrasado" || e === "estourado");
    const noPrazo = avaliados.filter((e) => e === "respondido").length;
    return {
      total: lista.length,
      resolvidos: lista.filter((t) => t.status === "resolvido").length,
      emAberto: lista.filter((t) => t.status !== "resolvido" && t.status !== "cancelado").length,
      mediaResposta: media(respostas),
      mediaResolucao: media(resolucoes),
      slaPct: avaliados.length ? (noPrazo / avaliados.length) * 100 : null,
      slaEstourados: lista.filter((t) => situacaoSla(t).estado === "estourado").length,
    };
  };

  const agrupar = <K extends string>(chave: (t: Linha) => K) => {
    const m = new Map<K, Linha[]>();
    for (const t of linhas) m.set(chave(t), [...(m.get(chave(t)) ?? []), t]);
    return m;
  };
  const porLoja = [...agrupar((t) => t.unidade?.codigo ?? "Sem unidade").entries()]
    .map(([loja, lista]) => ({ loja, nome: lista[0].unidade?.nome ?? "", id: lista[0].unidade?.id ?? null, ...resumir(lista) }))
    .sort((a, b) => b.total - a.total);
  const porCategoria = [...agrupar((t) => t.categoria).entries()].map(([categoria, lista]) => ({ categoria, ...resumir(lista) })).sort((a, b) => b.total - a.total);
  // o mesmo assunto, na mesma loja, 3 vezes ou mais no período
  const recorrentes = [...agrupar((t) => `${t.unidade?.codigo ?? "-"}|${t.categoria}|${assunto(t)}`).entries()]
    .filter(([, lista]) => lista.length >= 3)
    .map(([, lista]) => ({ loja: lista[0].unidade?.codigo ?? "Sem unidade", categoria: lista[0].categoria, assunto: rotuloTipo(lista[lista.length - 1].subcategoria) || lista[lista.length - 1].titulo, total: lista.length, ultimos: lista.slice(-3).reverse() }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  return { geral: resumir(linhas), porLoja, porCategoria, recorrentes };
}
