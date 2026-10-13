import type { LucideIcon } from "lucide-react";
import {
  Building2,
  ChartColumn,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  MonitorCog,
  ScrollText,
  ShieldCheck,
  Stethoscope,
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
