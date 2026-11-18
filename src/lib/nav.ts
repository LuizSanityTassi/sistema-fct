import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  BadgeDollarSign,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  Clock,
  FileClock,
  Fingerprint,
  Gauge,
  Goal,
  Headset,
  History,
  Hourglass,
  Lock,
  TimerReset,
  Trophy,
  Bot,
  Banknote,
  Building2,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  Coins,
  HandCoins,
  FileText,
  FolderOpen,
  KeyRound,
  Landmark,
  Laptop,
  ListChecks,
  MessageCircleQuestion,
  PenLine,
  Scale,
  LayoutDashboard,
  LifeBuoy,
  LockOpen,
  MonitorCog,
  ScrollText,
  ShieldAlert,
  Signature,
  Send,
  Workflow,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Store,
  Tags,
  FileSpreadsheet,
  Target,
  TrendingUp,
  UserCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { papelEfetivo, type AppRole } from "@/lib/roles";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Papéis com acesso. Ausente = todo usuário autenticado. */
  papeis?: AppRole[];
  descricao: string;
  /** Não aparece no menu; serve só para a regra de acesso da rota. */
  oculto?: boolean;
};

export type NavGrupo = {
  titulo?: string;
  /** Como o módulo aparece na tela de entrada (Portal de Gestão). */
  descricao?: string;
  icone?: LucideIcon;
  itens: NavItem[];
};

/** Folha da equipe: além do papel Gerente, abre para quem é o responsável no cadastro da filial (getSessao). */
export const ROTA_FOLHA_EQUIPE = "/folha-equipe";

/** Minhas vendas: abre para quem tem o código de vendedor do Trier ligado a ele (getSessao); o admin abre para conferir. */
export const ROTA_MINHAS_VENDAS = "/vendas/minhas";

// Fonte única de verdade do menu E da autorização de rota (ver `podeAcessar`).
// O que cada papel enxerga nos dados continua sendo decidido pelo RLS no banco.
export const NAV: NavGrupo[] = [
  {
    titulo: "Diretoria Estratégica",
    descricao: "Painel geral da rede, pendências de todos os setores e respostas prontas sobre lojas, pessoas e resultado.",
    icone: Target,
    itens: [
      {
        label: "Painel geral",
        href: "/dashboard",
        icon: LayoutDashboard,
        descricao: "Visão geral e acesso rápido aos módulos.",
      },
      {
        label: "Central de pendências",
        href: "/pendencias",
        icon: ListChecks,
        descricao: "O que precisa de ação agora, de todos os módulos (com o link já filtrado).",
      },
      {
        label: "Perguntas prontas",
        href: "/perguntas",
        icon: MessageCircleQuestion,
        descricao: "Respostas na hora: lojas com mais quebra, fornecedores com pendência, resultado por loja, horas extras e mais.",
      },
      {
        label: "Assistente IA",
        href: "/assistente",
        icon: Sparkles,
        papeis: ["admin", "financeiro", "rh", "contador"],
        descricao: "Pergunte em português sobre vendas, quebras, conciliação, pendências, DRE, caixa contábil, RH, folha e ponto; a IA responde com os dados que você já pode ver.",
      },
    ],
  },
  {
    titulo: "Folha",
    descricao: "Lançamentos do mês dos colaboradores vinculados ao gerente, só para consulta.",
    icone: Wallet,
    itens: [
      {
        label: "Folha da equipe",
        href: ROTA_FOLHA_EQUIPE,
        icon: Wallet,
        papeis: ["admin", "gerente"],
        descricao: "Horas extras, quebra de caixa e demais eventos do mês dos colaboradores vinculados a você. Só consulta.",
      },
    ],
  },
  {
    titulo: "RH",
    descricao: "Funcionários, documentos, ASO, folha de pagamento e canal de denúncias.",
    icone: Users,
    itens: [
      {
        label: "Funcionários",
        href: "/rh/funcionarios",
        icon: Users,
        papeis: ["admin", "rh", "gerente"],
        descricao: "Cadastro e situação dos funcionários por filial.",
      },
      {
        label: "Documentos",
        href: "/rh/documentos",
        icon: FileText,
        papeis: ["admin", "rh", "gerente"],
        descricao: "Documentos dos funcionários em armazenamento privado.",
      },
      {
        label: "Assinaturas",
        href: "/rh/assinaturas",
        icon: PenLine,
        papeis: ["admin", "rh", "gerente"],
        descricao: "Documentos que o RH mandou para o gerente colher a assinatura; devolvido, vai direto para a ficha.",
      },
      {
        label: "ASO",
        href: "/rh/aso",
        icon: Stethoscope,
        papeis: ["admin", "rh", "gerente"],
        descricao: "Exames ocupacionais e vencimentos.",
      },
      {
        label: "Folha de pagamento",
        href: "/rh/folha",
        icon: Wallet,
        papeis: ["admin", "rh"],
        descricao: "Registros de folha por competência.",
      },
      {
        label: "Lançamentos da folha",
        href: "/rh/lancamentos",
        icon: ClipboardList,
        papeis: ["admin", "rh"],
        descricao: "Horas extras, quebra de caixa e eventos do mês; gera a planilha da contabilidade (Domínio) por CNPJ.",
      },
      {
        label: "Canal de denúncias",
        href: "/denuncias",
        icon: ShieldAlert,
        descricao: "Denúncia anônima de assédio, fraude ou conduta errada; o comitê autorizado lê e responde.",
      },
    ],
  },
  {
    titulo: "Ponto Eletrônico",
    descricao: "Registro de ponto, espelho, banco de horas, escalas, ausências e fechamento do mês.",
    icone: Fingerprint,
    itens: [
      {
        label: "Meu ponto",
        href: "/ponto/registrar",
        icon: Fingerprint,
        descricao: "Suas marcações, jornada e saldo do dia e o PIN do relógio (o ponto é batido só no relógio da loja).",
      },
      {
        label: "Espelho de ponto",
        href: "/ponto/espelho",
        icon: FileClock,
        descricao: "Marcações do mês dia a dia, horas trabalhadas, extras, faltas e saldo.",
      },
      {
        label: "Ajustes de ponto",
        href: "/ponto/ajustes",
        icon: TimerReset,
        descricao: "Pedir correção de marcação (com motivo) e, para o gestor, aprovar ou recusar.",
      },
      {
        label: "Banco de horas",
        href: "/ponto/banco",
        icon: Hourglass,
        descricao: "Saldo, horas positivas e negativas, compensações e histórico mês a mês.",
      },
      {
        label: "Painel do ponto",
        href: "/ponto",
        icon: Gauge,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Quem está trabalhando, faltas, atrasos, extras, banco e alertas por filial.",
      },
      {
        label: "Relógio da filial",
        href: "/ponto/relogio",
        icon: Clock,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Relógio da loja em tela cheia, sem menu (o funcionário só coloca o dedo ou digita matrícula e PIN), e o login de relógio de cada filial.",
      },
      {
        label: "Equipe e jornadas",
        href: "/ponto/equipe",
        icon: CalendarClock,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Jornada de cada funcionário, PIN do relógio e situação do dia.",
      },
      {
        label: "Escalas",
        href: "/ponto/escalas",
        icon: CalendarDays,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Calendário do mês por funcionário: trocas de horário, folgas e plantões.",
      },
      {
        label: "Simulador de escala 5x2",
        href: "/escalas",
        icon: CalendarRange,
        papeis: ["admin", "rh", "coordenador", "gerente"],
        descricao: "Folgas 5x2 por filial com cobertura de farmacêutico hora a hora, auditoria de jornada e descanso, ajustes dia a dia, escala oficial do mês e PDF/Excel.",
      },
      {
        label: "Modelos de jornada",
        href: "/ponto/jornadas",
        icon: Clock,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Jornadas fixas, escalas 12x36 e 6x1, tolerância, jornada padrão da filial e feriados.",
      },
      {
        label: "Ausências",
        href: "/ponto/ausencias",
        icon: CalendarX2,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Férias, atestados, afastamentos, abonos e folgas compensatórias.",
      },
      {
        label: "Relatórios do ponto",
        href: "/ponto/relatorios",
        icon: ChartColumn,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Horas trabalhadas, extras, faltas, atrasos, banco e marcações em Excel, CSV ou PDF.",
      },
      {
        label: "Folha para assinatura",
        href: "/ponto/folha-assinatura",
        icon: Signature,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Cartão de ponto do período, uma folha por colaborador, com marcações, extras, faltas, noturno e carga, para conferir e assinar (PDF pelo navegador).",
      },
      {
        label: "Fechamento do mês",
        href: "/ponto/fechamento",
        icon: Lock,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Inconsistências do mês por filial; fechar trava o ponto e lança o saldo no banco.",
      },
      {
        label: "Auditoria do ponto",
        href: "/ponto/auditoria",
        icon: History,
        papeis: ["admin", "rh", "gerente", "coordenador"],
        descricao: "Quem registrou, ajustou, aprovou, fechou ou reabriu, com antes e depois.",
      },
    ],
  },
  {
    titulo: "Operações",
    descricao: "Chamados, quebras de caixa, sangrias, filiais e relatórios das lojas.",
    icone: Store,
    itens: [
      {
        label: "Chamados",
        href: "/chamados",
        icon: LifeBuoy,
        descricao: "Abertura e acompanhamento de chamados.",
      },
      {
        label: "Indicadores de chamados",
        href: "/chamados/indicadores",
        icon: ChartColumn,
        papeis: ["admin", "ti", "rh", "financeiro", "coordenador", "manutencao", "compras", "marketing"],
        descricao: "SLA, tempo de primeira resposta e de resolução, por loja, por categoria e recorrentes.",
        oculto: true,
      },
      {
        label: "Quebras de caixa",
        href: "/caixa",
        icon: Coins,
        papeis: ["admin", "financeiro", "coordenador", "gerente", "usuario"],
        descricao: "Quebras de caixa: o gestor da loja justifica; o colaborador vê as do caixa dele.",
      },
      {
        label: "Sangrias",
        href: "/sangrias",
        icon: HandCoins,
        papeis: ["admin", "financeiro", "coordenador", "gerente", "usuario"],
        descricao: "A loja lança o dinheiro do caixa depositado no banco, com o comprovante.",
      },
      {
        label: "Filiais",
        href: "/filiais",
        icon: Building2,
        papeis: ["admin", "rh", "ti", "financeiro", "coordenador", "gerente"],
        descricao: "Empresas, filiais e departamentos.",
      },
      {
        label: "Relatórios",
        href: "/relatorios",
        icon: ChartColumn,
        papeis: ["admin", "rh", "financeiro", "gerente"],
        descricao: "Consolidados por filial e período.",
      },
    ],
  },
  {
    titulo: "Coordenação Regional",
    descricao: "Checklist das visitas às lojas e ranking das mais bem avaliadas.",
    icone: ClipboardCheck,
    itens: [
      {
        label: "Checklist da loja",
        href: "/coordenacao",
        icon: ClipboardCheck,
        papeis: ["admin", "coordenador", "gerente"],
        descricao: "Check-list do coordenador regional na visita: notas de 0 a 5 estrelas, direcionamentos e acordos; o gerente confirma.",
      },
      {
        label: "Ranking das lojas",
        href: "/coordenacao/ranking",
        icon: Trophy,
        papeis: ["admin", "coordenador"],
        descricao: "Lojas mais bem avaliadas nos checklists, por regional (Sul, Serra, Oeste…), com o ponto fraco de cada uma.",
      },
    ],
  },
  {
    titulo: "Auditoria de lojas",
    descricao: "Checklist das normas das farmácias e auditoria de precificação (etiqueta × sistema), com relatório por regional ou filial.",
    icone: ListChecks,
    itens: [
      {
        label: "Checklist de auditoria",
        href: "/auditoria",
        icon: ListChecks,
        papeis: ["admin", "financeiro", "coordenador", "gerente"],
        descricao: "Verificação do cumprimento das normas das farmácias: Sim, Não, Regular ou Não utilizar em cada item, com impressão no formato do papel.",
      },
      {
        label: "Auditoria de precificação",
        href: "/auditoria/precificacao",
        icon: Tags,
        papeis: ["admin", "financeiro", "coordenador", "gerente"],
        descricao: "Preço da etiqueta × valor no sistema pelo código reduzido; lança as divergências e gera o relatório semanal por regional ou filial.",
      },
      {
        label: "Base de preços",
        href: "/auditoria/precos",
        icon: FileSpreadsheet,
        papeis: ["admin", "financeiro"],
        descricao: "Planilha de produtos do Trier (código reduzido, descrição e preço de venda) usada pela auditoria de precificação.",
      },
    ],
  },
  {
    titulo: "Comercial",
    descricao: "Painel de vendas, projeção do mês e venda de cada loja.",
    icone: TrendingUp,
    itens: [
      {
        label: "Painel de vendas",
        href: "/vendas",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "coordenador", "gerente"],
        descricao: "Venda do ano, do mês e de ontem, por regional, genéricos + similares, premium, CMV e projeção do mês.",
      },
      {
        label: "Venda por filial",
        href: "/vendas/filiais",
        icon: Trophy,
        papeis: ["admin", "financeiro", "coordenador"],
        descricao: "Ranking das lojas no mês ou nos dias escolhidos: venda, atendimentos, ticket, unidades, Fortvigor, premium, gen+sim e CMV.",
      },
      {
        label: "Televendas",
        href: "/vendas/televendas",
        icon: Headset,
        papeis: ["admin", "financeiro", "coordenador"],
        descricao: "Venda da equipe de tele-vendas como uma loja à parte: ranking dos vendedores, equipes (Criciúma, Concórdia, Lages) e onde a venda foi lançada.",
      },
      {
        label: "Metas",
        href: "/vendas/metas",
        icon: Goal,
        papeis: ["admin", "financeiro", "coordenador"],
        descricao: "Meta do mês por filial, para o televendas e por vendedor, com o realizado e o % atingido.",
      },
      {
        label: "Minhas vendas",
        href: ROTA_MINHAS_VENDAS,
        icon: BadgeDollarSign,
        papeis: ["admin"],
        descricao: "Só a sua venda: do dia, do mês, por filial, grupos de produtos e a sua meta. Aparece para o vendedor ligado ao código dele no Trier.",
      },
      {
        label: "Acesso dos vendedores",
        href: "/vendas/vendedores",
        icon: UserCheck,
        papeis: ["admin"],
        descricao: "Liga o código de cada vendedor do Trier ao funcionário: ligado, ele entra com o login dele e vê só a própria venda.",
      },
    ],
  },
  {
    titulo: "TI",
    descricao: "Fila de TI, equipamentos das lojas e pedidos de acesso.",
    icone: MonitorCog,
    itens: [
      {
        label: "Painel de TI",
        href: "/ti",
        icon: MonitorCog,
        papeis: ["admin", "ti"],
        descricao: "Fila de TI, ativos e acessos.",
      },
      {
        label: "Equipamentos",
        href: "/ti/ativos",
        icon: Laptop,
        papeis: ["admin", "ti"],
        descricao: "Inventário por loja, patrimônio, histórico e etiqueta com QR Code.",
      },
      {
        label: "Solicitar acesso",
        href: "/ti/acessos",
        icon: MonitorCog,
        descricao: "Pedir acesso a um sistema (vira chamado de TI).",
        oculto: true,
      },
    ],
  },
  {
    titulo: "Financeiro",
    descricao: "Lançamentos, caixa contábil, DRE, orçamento, fluxo de caixa e diferença de caixa.",
    icone: Wallet,
    itens: [
      {
        label: "Visão geral",
        href: "/financeiro",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Receitas, despesas e resultado por grupo e unidade.",
      },
      {
        label: "Lançamentos",
        href: "/financeiro/lancamentos",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Entradas e saídas realizadas por unidade.",
      },
      {
        label: "Conferência de sangrias",
        href: "/financeiro/sangrias",
        icon: ClipboardCheck,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "O financeiro confere com o extrato as sangrias lançadas pelas lojas.",
      },
      {
        label: "Retiradas de caixa",
        href: "/financeiro/retiradas",
        icon: ArrowLeftRight,
        papeis: ["admin", "financeiro"],
        descricao: "Dinheiro retirado dos caixas (Trier) × depósitos declarados nas sangrias, por loja.",
      },
      {
        label: "Carteira",
        href: "/financeiro/carteira",
        icon: Landmark,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Contas bancárias, aplicações, caixas e cofres da empresa.",
      },
      {
        label: "Categorias",
        href: "/financeiro/categorias",
        icon: ScrollText,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Plano de categorias e molde do caixa contábil.",
      },
      {
        label: "Importar do Omie",
        href: "/financeiro/importar",
        icon: FolderOpen,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Relatórios do Omie em Excel viram lançamentos realizados por unidade.",
      },
      {
        label: "DRE",
        href: "/financeiro/dre",
        icon: ScrollText,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "DRE contábil por filial (planilha do contador): resultado do mês e acumulado, ranking e indicadores.",
      },
      {
        label: "Caixa contábil",
        href: "/financeiro/caixa-contabil",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Demonstrativo contábil por grupo/unidade e mês, com ajustes do contador e caixa; ranking de lojas, resumo por loja e comparativo mês a mês.",
      },
      {
        label: "Orçamento",
        href: "/financeiro/orcamento",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Orçado × realizado por categoria e mês.",
      },
      {
        label: "Caixa",
        href: "/financeiro/caixa",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Fluxo diário (foto do dia), mensal (provisão × realizado) e semanal.",
      },
      {
        label: "Fluxo de caixa",
        href: "/financeiro/fluxo-caixa",
        icon: ChartColumn,
        papeis: ["admin", "financeiro"],
        descricao: "A receber (previsão) × a pagar (Omie) por dia, semana e mês, previsão de cartão, motivos e anotações. Dá para compartilhar com outras pessoas.",
      },
      {
        label: "Diferença de caixa",
        href: "/financeiro/diferenca-caixa",
        icon: Banknote,
        papeis: ["admin", "financeiro"],
        descricao: "Declarado × movimentado de cada caixa (Trier): tolerância, quebras, justificativas e desconto na folha.",
      },
      {
        label: "Inadimplência",
        href: "/financeiro/analise",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "coordenador"],
        descricao: "Inadimplência de crediário e convênio por mês.",
      },
      {
        label: "Migrar sistema anterior",
        href: "/financeiro/migrar",
        icon: FolderOpen,
        papeis: ["admin"],
        descricao: "Traz o fluxo de caixa antigo (SQLite) para dentro do sistema.",
        oculto: true,
      },
    ],
  },
  {
    titulo: "DDA x Trier",
    descricao: "DDA do Itaú × contas a pagar do Trier, pendências, de-para e envios ao Omie.",
    icone: Scale,
    itens: [
      {
        label: "Painel",
        href: "/conciliacao",
        icon: Scale,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "DDA do Itaú × contas a pagar do Trier: resultado, pendências e envios ao Omie.",
      },
      {
        label: "Arquivos",
        href: "/conciliacao/arquivos",
        icon: FolderOpen,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Arquivos do banco (.RET, planilha do portal) e relatórios do Trier.",
      },
      {
        label: "Pendências",
        href: "/conciliacao/pendencias",
        icon: ClipboardList,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Divergências a tratar, com prioridade, responsável e histórico.",
      },
      {
        label: "De-para",
        href: "/conciliacao/de-para",
        icon: ArrowLeftRight,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Boleto em nome de terceiro → fornecedor real; correspondências aprendidas.",
      },
      {
        label: "Regras automáticas",
        href: "/conciliacao/regras",
        icon: Workflow,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Nome contém CLARO → categoria Telefonia: categoria e departamento da Omie e pendências tratadas sozinhas.",
      },
      {
        label: "Omie",
        href: "/conciliacao/omie",
        icon: Send,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Envios ao Omie (planilha e API), configuração e desfazer.",
      },
      {
        label: "Fornecedores",
        href: "/conciliacao/fornecedores",
        icon: Store,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Ficha por fornecedor (raiz do CNPJ): histórico de boletos, faixa normal de valores, bancos e anomalias.",
      },
    ],
  },
  {
    titulo: "Conciliação GI",
    descricao: "A conciliação da GI (outra empresa), separada da nossa.",
    icone: Building2,
    itens: [
      {
        label: "Painel GI",
        href: "/conciliacao-gi",
        icon: Scale,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Conciliação da GI (outra empresa), separada da nossa: DDA × Trier, resultado e pendências.",
      },
      {
        label: "Arquivos GI",
        href: "/conciliacao-gi/arquivos",
        icon: FolderOpen,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Arquivos do banco e relatórios do Trier da GI.",
      },
      {
        label: "Pendências GI",
        href: "/conciliacao-gi/pendencias",
        icon: ClipboardList,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Divergências da GI a tratar, com prioridade, responsável e histórico.",
      },
      {
        label: "De-para GI",
        href: "/conciliacao-gi/de-para",
        icon: ArrowLeftRight,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "De-para e correspondências aprendidas só da GI.",
      },
      {
        label: "Regras GI",
        href: "/conciliacao-gi/regras",
        icon: Workflow,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Regras automáticas só da GI.",
      },
      {
        label: "Fornecedores GI",
        href: "/conciliacao-gi/fornecedores",
        icon: Store,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Ficha por fornecedor com o histórico de boletos da GI.",
      },
      {
        label: "Filiais da GI",
        href: "/conciliacao-gi/filiais",
        icon: Building2,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Número de cada filial no Trier da GI, nome e CNPJ.",
      },
    ],
  },
  {
    titulo: "Automações",
    descricao: "Robôs que buscam os relatórios do Trier e o agente do Itaú.",
    icone: Bot,
    itens: [
      {
        label: "Robôs e agente",
        href: "/conciliacao/robos",
        icon: Bot,
        papeis: ["admin", "financeiro"],
        descricao: "Busca automática do relatório do Trier e agente que envia os .RET do Itaú Mailbox.",
      },
      {
        label: "Robô de vendas",
        href: "/vendas/robo",
        icon: Bot,
        papeis: ["admin"],
        descricao: "Busca no Trier os relatórios de vendas de todas as filiais (toda madrugada ou na hora).",
      },
    ],
  },
  {
    titulo: "Administração",
    descricao: "Usuários, permissões, pedidos de acesso, auditoria e integrações.",
    icone: ShieldCheck,
    itens: [
      {
        label: "Usuários",
        href: "/configuracoes/usuarios",
        icon: UserCog,
        papeis: ["admin"],
        descricao: "Usuários do sistema, papéis e filiais.",
      },
      {
        label: "Pedidos de acesso",
        href: "/configuracoes/acessos",
        icon: LockOpen,
        papeis: ["admin"],
        descricao: "Quem pediu acesso a uma tela que o perfil não libera.",
      },
      {
        label: "Permissões",
        href: "/configuracoes/permissoes",
        icon: ShieldCheck,
        papeis: ["admin"],
        descricao: "Matriz de acesso por papel.",
      },
      {
        label: "Auditoria",
        href: "/configuracoes/auditoria",
        icon: ScrollText,
        papeis: ["admin"],
        descricao: "Histórico de alterações no sistema.",
      },
      {
        label: "Integrações",
        href: "/configuracoes/integracoes",
        icon: KeyRound,
        papeis: ["admin"],
        descricao: "Chaves do Trier e da Omie, agente do Itaú, convite por e-mail e o que mais precisa ser configurado.",
      },
    ],
  },
];

const TODOS_ITENS = NAV.flatMap((g) => g.itens);

function casaRota(item: NavItem, pathname: string) {
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export function podeVerItem(item: NavItem, papel: AppRole) {
  // login do relógio da filial: nenhum item do menu (só a tela /relogio)
  if (papel === "relogio") return false;
  // diretor de compras: só as telas que o administrador marcou para ele (acesso_telas, que entram como `extras`)
  if (papel === "diretor_compras") return false;
  // líder de loja vê as mesmas telas do gerente
  return !item.papeis || item.papeis.includes(papelEfetivo(papel));
}

/** Papel cujas telas são escolhidas uma a uma pelo administrador (e que só vê os dados, sem alterar). */
export const PAPEL_TELAS_ESCOLHIDAS: AppRole = "diretor_compras";

/**
 * Telas que o administrador pode marcar para o diretor de compras, por grupo do menu. Ficam de fora as ocultas e as só
 * de administrador (usuários, permissões, integrações, robôs): os dados delas são só do administrador.
 */
export const TELAS_ESCOLHIVEIS: { titulo: string; itens: { href: string; label: string }[] }[] = NAV.map((g) => ({
  titulo: g.titulo ?? "Geral",
  itens: g.itens.filter((i) => !i.oculto && !(i.papeis && i.papeis.every((p) => p === "admin"))).map((i) => ({ href: i.href, label: i.label })),
})).filter((g) => g.itens.length > 0);

const ROTAS_ESCOLHIVEIS = new Set(TELAS_ESCOLHIVEIS.flatMap((g) => g.itens.map((i) => i.href)));
/** Só as rotas que existem na lista de telas escolhíveis (o resto do formulário é ignorado). */
export const filtrarTelasEscolhiveis = (rotas: readonly unknown[]) => [...new Set(rotas.filter((r): r is string => typeof r === "string" && ROTAS_ESCOLHIVEIS.has(r)))].sort();

/**
 * Papéis cujos dados o diretor de compras pode LER, a partir das telas marcadas: os papéis que abrem cada tela (sem o
 * administrador) + compras, que é a área dele. No banco (private.tem_papel) vale só em consulta: nada de alterar.
 */
export function papeisDeLeitura(rotas: readonly string[]): string[] {
  const papeis = new Set<string>(["compras"]);
  for (const i of TODOS_ITENS) if (rotas.includes(i.href)) for (const p of i.papeis ?? []) if (p !== "admin") papeis.add(p);
  return [...papeis].sort();
}

/** Grupos do menu que mudaram de nome: o bloqueio guardado com o nome antigo continua valendo. */
const NOMES_ANTIGOS: Record<string, string> = { "Conciliação Bancária": "DDA x Trier" };
export const normalizarBloqueios = (lista: readonly string[] | null | undefined) => [...new Set((lista ?? []).map((m) => NOMES_ANTIGOS[m] ?? m))];

/** Grupos do menu que dá para bloquear por pessoa (profiles.modulos_bloqueados guarda o título do grupo). */
export const MODULOS_BLOQUEAVEIS = NAV.flatMap((g) => (g.titulo ? [g.titulo] : []));

/** Menu filtrado pelo papel (sem itens ocultos); grupos que ficam vazios somem. `bloqueios` = grupos tirados da pessoa. */
export function navParaPapel(papel: AppRole, extras: readonly string[] = [], bloqueios: readonly string[] = []): NavGrupo[] {
  return NAV.filter((g) => !g.titulo || !bloqueios.includes(g.titulo))
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.oculto && (podeVerItem(i, papel) || extras.includes(i.href))) }))
    .filter((g) => g.itens.length > 0);
}

/** Item do menu que corresponde à rota (prefixo mais específico). */
export function itemDaRota(pathname: string): NavItem | undefined {
  return TODOS_ITENS.filter((i) => casaRota(i, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

/** Grupo do item mais específico: /vendas/robo é Automações, não Comercial. */
export function grupoDaRota(pathname: string): NavGrupo | undefined {
  const item = itemDaRota(pathname);
  return item && NAV.find((g) => g.itens.includes(item));
}

/** Primeira tela do grupo que a pessoa pode abrir; sem nenhuma, undefined (não vira link). */
export function inicioDoGrupo(titulo: string | undefined, papel: AppRole, extras: readonly string[] = [], bloqueios: readonly string[] = []): string | undefined {
  if (!titulo) return undefined;
  return navParaPapel(papel, extras, bloqueios).find((g) => g.titulo === titulo)?.itens[0]?.href;
}

/** Autorização de rota derivada do menu. Rotas fora do menu são liberadas (ex.: /dashboard/...). */
/** `extras` = telas liberadas para a pessoa além do papel (acesso_telas, ex.: Fluxo de caixa compartilhado). */
/** `bloqueios` = grupos do menu tirados da pessoa (profiles.modulos_bloqueados): valem mesmo para administrador. */
export function podeAcessar(papel: AppRole, pathname: string, extras: readonly string[] = [], bloqueios: readonly string[] = []): boolean {
  if (papel === "relogio") return pathname === "/relogio";
  const item = itemDaRota(pathname);
  if (!item) return true;
  // o grupo do item mais específico (/vendas/robo é Automações, não Comercial)
  if (bloqueios.length && bloqueios.includes(NAV.find((g) => g.itens.includes(item))?.titulo ?? "")) return false;
  return podeVerItem(item, papel) || extras.includes(item.href);
}
