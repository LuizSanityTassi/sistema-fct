// Auditoria de lojas: perguntas do "CHECKLIST — Verificação do cumprimento das normas das farmácias" (o papel do
// auditor) e utilidades puras (sem acesso ao banco: pode ser usado em componente client).

export const RESPOSTAS = ["sim", "nao", "regular", "nao_utilizar"] as const;
export type Resposta = (typeof RESPOSTAS)[number];

export const ROTULO_RESPOSTA: Record<Resposta, string> = { sim: "Sim", nao: "Não", regular: "Regular", nao_utilizar: "Não utilizar" };
export const ROTULO_CURTO: Record<Resposta, string> = { sim: "Sim", nao: "Não", regular: "Regular", nao_utilizar: "N/U" };

export const ehResposta = (v: unknown): v is Resposta => typeof v === "string" && (RESPOSTAS as readonly string[]).includes(v);

/** Pergunta sem subitens: uma resposta só (no papel aparece "R:"). */
export const SO_RESPOSTA = "R:";

export type PerguntaChecklist = { n: number; pergunta: string; itens: string[] };

export const PERGUNTAS_CHECKLIST: PerguntaChecklist[] = [
  { n: 1, pergunta: "A farmácia está toda reposta de mercadorias?", itens: ["Caixotes", "Gôndolas", "Outros", "Prateleiras"] },
  { n: 2, pergunta: "A farmácia tem um espaço específico para os prestes a vencer?", itens: ["Caixote", "Gôndola", "Outros", "Prateleira"] },
  {
    n: 3,
    pergunta: "A loja como um todo está limpa e organizada?",
    itens: ["Balcões de atendimento (em cima e embaixo)", "Banheiros", "Caixotes", "Frente de loja", "Gôndolas", "Prateleiras"],
  },
  { n: 4, pergunta: "Algum login aberto sem o funcionário ou gerente presente na farmácia?", itens: ["PDV", "Usuário retaguarda"] },
  {
    n: 5,
    pergunta: "Alinhamento dos processos de padronização das farmácias e serviços nos sistemas estão sendo cumpridos?",
    itens: ["Confirmação de estoque de mercadorias e transferências", "Entrada de mercadoria feita corretamente e com verificação do fator de mercadoria"],
  },
  { n: 6, pergunta: "As cestas estão disponíveis para os clientes?", itens: ["Bom estado de uso", "Contém", "Limpas"] },
  { n: 7, pergunta: "Caixas", itens: ["Cadastro cliente", "Estão conferindo os medicamentos que estão bipando?", "Estão entregando o cupom fiscal?"] },
  { n: 8, pergunta: "Cozinha está limpa e organizada?", itens: ["Cafeteira", "Geladeira", "Mesa", "Micro-ondas", "Pia"] },
  { n: 9, pergunta: "Crachás deixados no balcão sem o funcionário presente no ambiente de trabalho?", itens: ["Função", "Nome funcionário"] },
  { n: 10, pergunta: "Documentações (certificados, alvarás e outros) estão atualizadas e em locais visíveis?", itens: [SO_RESPOSTA] },
  { n: 11, pergunta: "Estoque está em ordem, sem excesso e com a identificação nas caixas?", itens: [SO_RESPOSTA] },
  { n: 12, pergunta: "Existe quadro de metas na loja?", itens: [SO_RESPOSTA] },
  { n: 13, pergunta: "Extintores estão com a validade correta?", itens: [SO_RESPOSTA] },
  {
    n: 14,
    pergunta: "Geladeira de medicamentos",
    itens: ["Contém", "Preenchimento do serviço farmacêutico (planilha de temperatura)", "Relógio de temperatura e umidade em ordem"],
  },
  {
    n: 15,
    pergunta: "Materiais de limpeza e consumo têm quantidade em excesso?",
    itens: ["Café", "Copos", "Filtro", "Outros", "Papel higiênico", "Papel toalha", "Produto de limpeza", "Sacos de lixo", "Vassoura"],
  },
  {
    n: 16,
    pergunta: "Os produtos estão devidamente precificados?",
    itens: ["Etiquetas de preços estão em bom estado?", "Placas de oferta padrão", "Preços nos produtos (conforme tabela atualizada)"],
  },
  { n: 17, pergunta: "Os produtos prestes a vencer estão devidamente marcados (com etiquetas amarelas de bolinhas)?", itens: ["3 meses de antecedência (no mínimo)"] },
  { n: 18, pergunta: "Produtos pessoais sinalizados com cupom fiscal de compra?", itens: ["Medicamentos", "Outros"] },
  { n: 19, pergunta: "Todos estão uniformizados e com crachá?", itens: ["Crachá em ordem", "Uniforme está limpo e em bom estado de uso"] },
];

/** Nome do campo do formulário de cada subitem. */
export const campoItem = (n: number, i: number) => `r_${n}_${i}`;
export const campoComentario = (n: number) => `c_${n}`;

export type RespostaGravada = { n: number; pergunta: string; comentario?: string; itens: { item: string; resposta: Resposta }[] };

/** Lê o jsonb gravado (o texto das perguntas vai junto; mudar a lista não muda o histórico). */
export function lerRespostas(json: unknown): RespostaGravada[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((q) => {
    if (!q || typeof q !== "object") return [];
    const o = q as Record<string, unknown>;
    const itens = Array.isArray(o.itens)
      ? o.itens.flatMap((i) => {
          const x = i as Record<string, unknown>;
          return x && typeof x.item === "string" && ehResposta(x.resposta) ? [{ item: x.item, resposta: x.resposta }] : [];
        })
      : [];
    return typeof o.pergunta === "string" ? [{ n: Number(o.n) || 0, pergunta: o.pergunta, comentario: typeof o.comentario === "string" && o.comentario ? o.comentario : undefined, itens }] : [];
  });
}

/** Quantas respostas de cada tipo. */
export function contarRespostas(respostas: RespostaGravada[]) {
  const c: Record<Resposta, number> = { sim: 0, nao: 0, regular: 0, nao_utilizar: 0 };
  for (const q of respostas) for (const i of q.itens) c[i.resposta]++;
  return c;
}

export const SITUACOES_CHECKLIST_AUD = { finalizado: "Finalizado", cancelado: "Cancelado" } as const;
export const SITUACOES_PRECIFICACAO = { em_andamento: "Em andamento", finalizada: "Finalizada", cancelada: "Cancelada" } as const;
export type SituacaoPrecificacao = keyof typeof SITUACOES_PRECIFICACAO;

/** Número do documento com 5 dígitos, como no papel (00021). */
export const numeroDoc = (n: number | null | undefined) => (n ? String(n).padStart(5, "0") : "—");

/** Data (dd/mm/aaaa) e hora no horário de Brasília. */
const fmtData = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const dataBrasil = (iso: string | null | undefined) => (iso ? fmtData.format(new Date(iso)) : "—");
export const dataHoraBrasil = (iso: string | null | undefined) => (iso ? `${fmtData.format(new Date(iso))} às ${fmtHora.format(new Date(iso))}` : "—");

/** Taxa de divergência em %. */
export const taxaDivergencia = (divergentes: number | null | undefined, verificados: number | null | undefined) =>
  verificados && verificados > 0 ? ((divergentes ?? 0) / verificados) * 100 : null;
export const formatarTaxa = (t: number | null) => (t === null ? "—" : `${t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`);

/** "AAAA-MM-DD" de hoje (Brasília) e de N dias atrás. */
export function diaBrasil(deslocamentoDias = 0) {
  const d = new Date(Date.now() + deslocamentoDias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}
