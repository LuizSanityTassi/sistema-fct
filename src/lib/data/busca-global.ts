// Busca global (Ctrl+K), só servidor: uma chamada a busca_global (RLS de quem busca) + fornecedores da conciliação,
// com nomes de situação em português e o link de cada resultado. Resultado de tela que o papel não abre é descartado.
import type { Sessao } from "@/lib/auth/session";
import { GRUPOS_BUSCA, type GrupoBusca, type ItemBusca, type TipoBusca } from "@/lib/busca";
import { ROTULO_SITUACAO, situacaoDoCaixa } from "@/lib/caixa/rotulos";
import { CATEGORIA_CHAMADO_LABEL, STATUS_CHAMADO_LABEL } from "@/lib/chamados/rotulos";
import { PROBLEMA_LABEL, STATUS_PENDENCIA_LABEL, type Problema, type StatusPendencia } from "@/lib/conciliacao/rotulos";
import { formatarData, formatarMoeda } from "@/lib/formatos";
import { podeAcessar } from "@/lib/nav";
import { STATUS_LABEL } from "@/lib/rh/rotulos";
import { PAPEL_LABEL } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { STATUS_ATIVO_LABEL, TIPO_ATIVO_LABEL } from "@/lib/ti/rotulos";

const LIMITE = 6;
const juntar = (...partes: (string | null | undefined | false)[]) => partes.filter(Boolean).join(" · ");
const de = <T extends string>(mapa: Record<T, string>, v: string | null) => (v && v in mapa ? mapa[v as T] : v);

type Linha = { tipo: string; id: string; titulo: string; detalhe: string | null; extra: string | null; situacao: string | null; valor: number | null; data: string | null };

function item(l: Linha, papel: Sessao["papel"]): ItemBusca | null {
  const valor = l.valor == null ? null : Number(l.valor);
  switch (l.tipo) {
    case "funcionario":
      return { tipo: "funcionario", id: l.id, titulo: l.titulo, detalhe: l.detalhe ?? "", situacao: de(STATUS_LABEL, l.situacao), href: `/rh/funcionarios/${l.id}` };
    case "filial":
      return { tipo: "filial", id: l.id, titulo: l.titulo, detalhe: l.detalhe ?? "", situacao: l.situacao === "inativa" ? "Inativa" : null, href: `/filiais/${l.id}` };
    case "chamado":
      return {
        tipo: "chamado",
        id: l.id,
        titulo: l.titulo,
        detalhe: juntar(de(CATEGORIA_CHAMADO_LABEL, l.extra), l.detalhe, l.data && `aberto em ${formatarData(l.data)}`),
        situacao: de(STATUS_CHAMADO_LABEL, l.situacao),
        href: `/chamados/${l.id}`,
      };
    case "ativo":
      return {
        tipo: "ativo",
        id: l.id,
        titulo: l.titulo,
        detalhe: juntar(l.extra && (TIPO_ATIVO_LABEL[l.extra] ?? l.extra), l.detalhe),
        situacao: de(STATUS_ATIVO_LABEL, l.situacao),
        href: `/ti/ativos/${l.id}`,
      };
    case "pendencia":
      return {
        tipo: "pendencia",
        id: l.id,
        titulo: l.titulo,
        detalhe: juntar(l.extra && (PROBLEMA_LABEL[l.extra as Problema] ?? l.extra), l.detalhe, valor != null && formatarMoeda(valor), l.data && `vence ${formatarData(l.data)}`),
        situacao: de(STATUS_PENDENCIA_LABEL as Record<StatusPendencia, string>, l.situacao),
        href: `/conciliacao/pendencias?status=todas&q=${encodeURIComponent(l.titulo.slice(0, 60))}`,
      };
    case "caixa": {
      const financeiro = podeAcessar(papel, "/financeiro/diferenca-caixa");
      return {
        tipo: "caixa",
        id: l.id,
        titulo: l.titulo,
        detalhe: juntar(l.detalhe, l.data && formatarData(l.data), valor != null && `diferença ${formatarMoeda(valor)}`),
        situacao: ROTULO_SITUACAO[situacaoDoCaixa(l.extra ?? "", l.situacao ?? "")],
        href: financeiro ? `/financeiro/diferenca-caixa/${l.id}` : "/caixa",
      };
    }
    case "usuario":
      return {
        tipo: "usuario",
        id: l.id,
        titulo: l.titulo,
        detalhe: juntar(l.detalhe, de(PAPEL_LABEL, l.extra)),
        situacao: l.situacao === "inativo" ? "Inativo" : null,
        href: `/configuracoes/usuarios/${l.id}/editar`,
      };
    default:
      return null;
  }
}

export async function buscarTudo(sessao: Sessao, termo: string): Promise<GrupoBusca[]> {
  const q = termo.trim().slice(0, 80);
  const supabase = await createClient();
  const comFornecedores = q.length >= 3 && podeAcessar(sessao.papel, "/conciliacao/fornecedores", sessao.telasExtras, sessao.bloqueios);
  const [{ data, error }, fornecedores] = await Promise.all([
    supabase.rpc("busca_global", { p_q: q, p_limite: LIMITE }),
    comFornecedores ? supabase.rpc("conc_fornecedores_lista", { p_q: q, p_limite: 5 }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (error) throw new Error(error.message);

  const porTipo = new Map<TipoBusca, ItemBusca[]>();
  const somar = (i: ItemBusca | null) => {
    if (!i || !podeAcessar(sessao.papel, i.href.split("?")[0], sessao.telasExtras, sessao.bloqueios)) return;
    porTipo.set(i.tipo, [...(porTipo.get(i.tipo) ?? []), i]);
  };
  for (const l of (data ?? []) as Linha[]) somar(item(l, sessao.papel));
  for (const f of fornecedores.data ?? []) {
    somar({
      tipo: "fornecedor",
      id: f.raiz,
      titulo: f.nome ?? f.raiz,
      detalhe: juntar(`CNPJ ${f.raiz.trim().replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2.$3")}`, `${f.qtd} boleto(s)`, f.ultimo_venc && `último vencimento ${formatarData(f.ultimo_venc)}`),
      situacao: Number(f.fora_padrao) > 0 ? "Fora do padrão" : null,
      href: `/conciliacao/fornecedores/${encodeURIComponent(f.raiz.trim())}`,
    });
  }
  return GRUPOS_BUSCA.filter((g) => porTipo.has(g.tipo)).map((g) => ({ ...g, itens: porTipo.get(g.tipo)! }));
}
