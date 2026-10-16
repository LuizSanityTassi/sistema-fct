import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  Bot,
  Banknote,
  Building2,
  ChartColumn,
  ClipboardList,
  Coins,
  FileText,
  FolderOpen,
  KeyRound,
  ListChecks,
  Scale,
  LayoutDashboard,
  LifeBuoy,
  MonitorCog,
  ScrollText,
  ShieldAlert,
  Send,
  Workflow,
  ShieldCheck,
  Stethoscope,
  Store,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import type { AppRole } from "@/lib/roles";

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
  itens: NavItem[];
};

// Fonte única de verdade do menu E da autorização de rota (ver `podeAcessar`).
// O que cada papel enxerga nos dados continua sendo decidido pelo RLS no banco.
export const NAV: NavGrupo[] = [
  {
    itens: [
      {
        label: "Dashboard",
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
    ],
  },
  {
    titulo: "Recursos Humanos",
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
    ],
  },
  {
    titulo: "Operação",
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
        papeis: ["admin", "ti", "rh", "financeiro"],
        descricao: "SLA, tempo de primeira resposta e de resolução, por loja, por categoria e recorrentes.",
        oculto: true,
      },
      {
        label: "Quebras de caixa",
        href: "/caixa",
        icon: Coins,
        papeis: ["admin", "financeiro", "gerente", "usuario"],
        descricao: "Quebras de caixa: o gestor da loja justifica; o colaborador vê as do caixa dele.",
      },
      {
        label: "Canal de denúncias",
        href: "/denuncias",
        icon: ShieldAlert,
        descricao: "Denúncia anônima de assédio, fraude ou conduta errada; o comitê autorizado lê e responde.",
      },
      {
        label: "Filiais",
        href: "/filiais",
        icon: Building2,
        papeis: ["admin", "rh", "ti", "financeiro", "gerente"],
        descricao: "Empresas, filiais e departamentos.",
      },
      {
        label: "TI",
        href: "/ti",
        icon: MonitorCog,
        papeis: ["admin", "ti"],
        descricao: "Fila de TI, ativos e acessos.",
      },
      {
        label: "Solicitar acesso",
        href: "/ti/acessos",
        icon: MonitorCog,
        descricao: "Pedir acesso a um sistema (vira chamado de TI).",
        oculto: true,
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
    titulo: "Financeiro",
    itens: [
      {
        label: "Visão geral",
        href: "/financeiro",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Receitas, despesas e resultado por grupo e unidade.",
      },
      {
        label: "Lançamentos",
        href: "/financeiro/lancamentos",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Entradas e saídas realizadas por unidade.",
      },
      {
        label: "Categorias",
        href: "/financeiro/categorias",
        icon: ScrollText,
        papeis: ["admin", "financeiro", "contador"],
        descricao: "Plano de categorias e molde da DRE.",
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
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Demonstrativo contábil por grupo/unidade e mês, com ajustes do contador e caixa.",
      },
      {
        label: "Orçamento",
        href: "/financeiro/orcamento",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Orçado × realizado por categoria e mês.",
      },
      {
        label: "Caixa",
        href: "/financeiro/caixa",
        icon: Wallet,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Fluxo diário (foto do dia), mensal (provisão × realizado) e semanal.",
      },
      {
        label: "Diferença de caixa",
        href: "/financeiro/diferenca-caixa",
        icon: Banknote,
        papeis: ["admin", "financeiro"],
        descricao: "Declarado × movimentado de cada caixa (Trier): tolerância, quebras, justificativas e desconto na folha.",
      },
      {
        label: "Inadimplência e ranking",
        href: "/financeiro/analise",
        icon: ChartColumn,
        papeis: ["admin", "financeiro", "contador", "gerente"],
        descricao: "Inadimplência de crediário/convênio, ranking de lojas e comparativo.",
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
    titulo: "Conciliação",
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
      {
        label: "Robôs e agente",
        href: "/conciliacao/robos",
        icon: Bot,
        papeis: ["admin", "financeiro"],
        descricao: "Busca automática do relatório do Trier e agente que envia os .RET do Itaú Mailbox.",
      },
    ],
  },
  {
    titulo: "Configurações",
    itens: [
      {
        label: "Usuários",
        href: "/configuracoes/usuarios",
        icon: UserCog,
        papeis: ["admin"],
        descricao: "Usuários do sistema, papéis e filiais.",
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
  return !item.papeis || item.papeis.includes(papel);
}

/** Menu filtrado pelo papel (sem itens ocultos); grupos que ficam vazios somem. */
export function navParaPapel(papel: AppRole): NavGrupo[] {
  return NAV.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.oculto && podeVerItem(i, papel)) })).filter(
    (g) => g.itens.length > 0,
  );
}

/** Item do menu que corresponde à rota (prefixo mais específico). */
export function itemDaRota(pathname: string): NavItem | undefined {
  return TODOS_ITENS.filter((i) => casaRota(i, pathname)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0];
}

export function grupoDaRota(pathname: string): NavGrupo | undefined {
  return NAV.find((g) => g.itens.some((i) => casaRota(i, pathname)));
}

/** Autorização de rota derivada do menu. Rotas fora do menu são liberadas (ex.: /dashboard/...). */
export function podeAcessar(papel: AppRole, pathname: string): boolean {
  const item = itemDaRota(pathname);
  return item ? podeVerItem(item, papel) : true;
}
