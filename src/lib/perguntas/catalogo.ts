// Perguntas prontas: as consultas que o dia a dia mais pede, respondidas na hora com os dados do sistema (sem IA).
// Módulo puro (tela, Ctrl+K e servidor). Cada pergunta vale para quem abre a tela da área dela (`rota`); o que cada
// um enxerga nos dados continua sendo o RLS.
import { podeAcessar } from "@/lib/nav";
import type { AppRole } from "@/lib/roles";

export type ParametroPergunta = "mes" | "filial";
export type AreaPergunta = "Caixa" | "Conciliação" | "Financeiro" | "Pessoas" | "Chamados" | "Tecnologia";

export type Pergunta = {
  id: string;
  area: AreaPergunta;
  pergunta: string;
  descricao: string;
  /** Tela da área: quem não abre essa tela não vê a pergunta. */
  rota: string;
  parametros: ParametroPergunta[];
};

export const AREAS_PERGUNTA: AreaPergunta[] = ["Caixa", "Conciliação", "Financeiro", "Pessoas", "Chamados", "Tecnologia"];

export const PERGUNTAS: Pergunta[] = [
  {
    id: "quebras-por-loja",
    area: "Caixa",
    pergunta: "Quais lojas tiveram mais quebra de caixa no mês?",
    descricao: "Quebras acima da tolerância (e as lançadas à mão) por loja: quantidade, faltas, sobras e valor.",
    rota: "/financeiro/diferenca-caixa",
    parametros: ["mes"],
  },
  {
    id: "quebras-por-operador",
    area: "Caixa",
    pergunta: "Quais operadores mais tiveram quebra no mês?",
    descricao: "Ranking de operadores do Trier por valor de quebra, com o código do operador e a loja.",
    rota: "/financeiro/diferenca-caixa",
    parametros: ["mes", "filial"],
  },
  {
    id: "quebras-sem-justificativa",
    area: "Caixa",
    pergunta: "Quais quebras ainda esperam justificativa?",
    descricao: "Quebras pendentes de qualquer mês, das mais antigas para as mais novas, com quantos dias estão em aberto.",
    rota: "/caixa",
    parametros: ["filial"],
  },
  {
    id: "pendencias-por-fornecedor",
    area: "Conciliação",
    pergunta: "Quais fornecedores têm mais pendências em aberto?",
    descricao: "Pendências pendentes ou em análise agrupadas pelo beneficiário: quantidade, valor e vencimento mais antigo.",
    rota: "/conciliacao/pendencias",
    parametros: [],
  },
  {
    id: "pendencias-vencendo",
    area: "Conciliação",
    pergunta: "Quais pendências estão vencidas ou vencem nos próximos 7 dias?",
    descricao: "Boletos e títulos em aberto por data de vencimento, para tratar antes de virar juros.",
    rota: "/conciliacao/pendencias",
    parametros: ["filial"],
  },
  {
    id: "enviado-omie",
    area: "Conciliação",
    pergunta: "Quanto foi enviado ao Omie no mês?",
    descricao: "Contas enviadas por planilha ou pela API, por empresa (envios desfeitos não contam).",
    rota: "/conciliacao/omie",
    parametros: ["mes"],
  },
  {
    id: "resultado-por-loja",
    area: "Financeiro",
    pergunta: "Quais lojas tiveram o melhor e o pior resultado no mês?",
    descricao: "Receitas, despesas e resultado por unidade, do maior para o menor. Sem mês escolhido, usa o último mês lançado.",
    rota: "/financeiro",
    parametros: ["mes"],
  },
  {
    id: "maiores-despesas",
    area: "Financeiro",
    pergunta: "Quais foram as maiores despesas do mês, por categoria?",
    descricao: "As 25 categorias de despesa com maior valor no mês (todas as unidades ou uma).",
    rota: "/financeiro",
    parametros: ["mes", "filial"],
  },
  {
    id: "funcionarios-por-loja",
    area: "Pessoas",
    pergunta: "Quantos funcionários cada loja tem?",
    descricao: "Funcionários não desligados por unidade: ativos, afastados e em férias.",
    rota: "/rh/funcionarios",
    parametros: [],
  },
  {
    id: "movimentacao-do-mes",
    area: "Pessoas",
    pergunta: "Quem foi admitido ou desligado no mês?",
    descricao: "Admissões e desligamentos do mês, com cargo e unidade.",
    rota: "/rh/funcionarios",
    parametros: ["mes", "filial"],
  },
  {
    id: "aso-pendente",
    area: "Pessoas",
    pergunta: "Quem está com ASO vencido ou sem ASO?",
    descricao: "Funcionários ativos sem ASO cadastrado ou com o último ASO vencido.",
    rota: "/rh/aso",
    parametros: ["filial"],
  },
  {
    id: "horas-extras-por-loja",
    area: "Pessoas",
    pergunta: "Quais lojas têm mais horas extras no mês?",
    descricao: "Horas extras lançadas para a contabilidade (50%, 60%, 75% e 100%) por unidade.",
    rota: "/rh/lancamentos",
    parametros: ["mes"],
  },
  {
    id: "chamados-por-loja",
    area: "Chamados",
    pergunta: "Quais lojas abriram mais chamados no mês?",
    descricao: "Chamados abertos no mês por unidade: em aberto, resolvidos e de prioridade alta ou crítica.",
    rota: "/chamados",
    parametros: ["mes"],
  },
  {
    id: "equipamentos-atencao",
    area: "Tecnologia",
    pergunta: "Quais equipamentos estão em manutenção ou com garantia acabando?",
    descricao: "Equipamentos em manutenção ou com garantia vencida ou vencendo nos próximos 60 dias.",
    rota: "/ti/ativos",
    parametros: ["filial"],
  },
];

export const perguntaPorId = (id: string) => PERGUNTAS.find((p) => p.id === id) ?? null;

/** Perguntas que o papel pode fazer (tem acesso à tela da área). */
export const perguntasDoPapel = (papel: AppRole) => PERGUNTAS.filter((p) => podeAcessar(papel, p.rota));
