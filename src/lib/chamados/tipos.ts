// Tipos de chamado (a mesma lista que as lojas já usavam no sistema da Zanini, com "Suporte sistema" no lugar de
// "Suporte Zanini"). Quem abre escolhe o TIPO; o sistema deriva a CATEGORIA, que é o setor que atende e define
// quem vê o chamado (RH só o RH vê; Financeiro, Manutenção, Compras e Marketing veem os seus; a TI vê tudo menos
// RH e fica de reserva). O tipo fica em tickets.subcategoria.
// Módulo puro (servidor e navegador).
import type { CategoriaChamado } from "@/lib/chamados/rotulos";

export type TipoChamado = { valor: string; rotulo: string; categoria: CategoriaChamado; dica: string };

const LISTA: TipoChamado[] = [
  { valor: "admissao", rotulo: "Admissão", categoria: "rh", dica: "Contratação: documentos, exame admissional, cadastro." },
  { valor: "avarias", rotulo: "Avarias (quebras)", categoria: "compras", dica: "Produto danificado, quebrado ou impróprio para venda." },
  { valor: "auditoria_lojas", rotulo: "Auditoria de Lojas", categoria: "financeiro", dica: "Pontos levantados na auditoria da loja." },
  { valor: "boletos_pagar", rotulo: "Boletos a Pagar", categoria: "financeiro", dica: "Boleto recebido na loja, vencimento, segunda via." },
  { valor: "cartao_tef_pos", rotulo: "Cartão TEF e POS", categoria: "ti", dica: "Maquininha, TEF no caixa, POS da tele-entrega." },
  { valor: "cameras", rotulo: "Câmeras", categoria: "ti", dica: "Câmera parada, gravador, acesso às imagens." },
  { valor: "manutencoes", rotulo: "Manutenções", categoria: "manutencao", dica: "Elétrica, ar-condicionado, geladeira, fachada, reparos." },
  { valor: "convenios", rotulo: "Convênios", categoria: "financeiro", dica: "Cadastro e cobrança de empresas conveniadas." },
  { valor: "divergencia_notas", rotulo: "Divergência de notas (produtos)", categoria: "compras", dica: "Produto da nota não bate com o que chegou." },
  { valor: "ferias", rotulo: "Férias", categoria: "rh", dica: "Programação e dúvidas de férias." },
  { valor: "folhas", rotulo: "Folhas", categoria: "rh", dica: "Holerite, descontos, horas." },
  { valor: "importacao_notas", rotulo: "Importação de notas", categoria: "compras", dica: "Nota de compra que não entrou no sistema." },
  { valor: "informatica", rotulo: "Informática", categoria: "ti", dica: "Computador, impressora, internet, rede." },
  { valor: "inventario", rotulo: "Inventário", categoria: "compras", dica: "Contagem de estoque, ajustes, diferenças." },
  { valor: "quebra_caixa", rotulo: "Quebra de Caixa", categoria: "financeiro", dica: "Dúvida sobre diferença de caixa ou desconto." },
  { valor: "rh_dp", rotulo: "RH/DP", categoria: "rh", dica: "Departamento pessoal em geral." },
  { valor: "vencidos", rotulo: "Vencidos", categoria: "compras", dica: "Produtos vencidos ou perto de vencer." },
  { valor: "marketing", rotulo: "Solicitações de Marketing", categoria: "marketing", dica: "Cartaz, encarte, ação na loja, redes sociais." },
  { valor: "advertencia_suspensao", rotulo: "Solicitação advertência / suspensão", categoria: "rh", dica: "Pedido de medida disciplinar." },
  { valor: "uniforme", rotulo: "Uniforme", categoria: "rh", dica: "Pedido, troca ou tamanho de uniforme." },
  { valor: "suporte_sistema", rotulo: "Suporte sistema", categoria: "ti", dica: "Dúvida ou problema no Sistema FCT." },
];

/** Em ordem alfabética, como aparece para quem abre o chamado. */
export const TIPOS_CHAMADO: TipoChamado[] = [...LISTA].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

const POR_VALOR = new Map(LISTA.map((t) => [t.valor, t]));

// tipos gravados por outras telas (não aparecem na lista de abertura)
const OUTROS_TIPOS: Record<string, string> = { acesso: "Acesso a sistema" };

export const ehTipoChamado = (v: unknown): v is string => typeof v === "string" && POR_VALOR.has(v);
export const tipoDoValor = (v: string | null | undefined) => (v ? POR_VALOR.get(v) : undefined);

/** Nome do tipo para mostrar (chamados antigos sem tipo: null; texto livre antigo: o próprio texto). */
export function rotuloTipo(subcategoria: string | null | undefined): string | null {
  if (!subcategoria) return null;
  return POR_VALOR.get(subcategoria)?.rotulo ?? OUTROS_TIPOS[subcategoria] ?? subcategoria;
}

/** Tipo sugerido quando o chamado vem de outra tela com só a categoria (ex.: equipamento de TI). */
export const TIPO_PADRAO_DA_CATEGORIA: Partial<Record<CategoriaChamado, string>> = { ti: "informatica", rh: "rh_dp", manutencao: "manutencoes" };
