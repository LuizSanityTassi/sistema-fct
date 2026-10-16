// Tipos e nomes da busca global (Ctrl+K). Módulo puro: usado pela rota /api/busca e pela janela de busca.

export type TipoBusca = "funcionario" | "filial" | "chamado" | "ativo" | "pendencia" | "fornecedor" | "caixa" | "usuario";

export type ItemBusca = {
  tipo: TipoBusca;
  id: string;
  titulo: string;
  detalhe: string;
  situacao: string | null;
  href: string;
};

export type GrupoBusca = { tipo: TipoBusca; rotulo: string; itens: ItemBusca[] };

/** Ordem e nome dos grupos na janela. */
export const GRUPOS_BUSCA: { tipo: TipoBusca; rotulo: string }[] = [
  { tipo: "funcionario", rotulo: "Funcionários" },
  { tipo: "filial", rotulo: "Filiais" },
  { tipo: "chamado", rotulo: "Chamados" },
  { tipo: "ativo", rotulo: "Equipamentos de TI" },
  { tipo: "pendencia", rotulo: "Pendências da conciliação" },
  { tipo: "fornecedor", rotulo: "Fornecedores" },
  { tipo: "caixa", rotulo: "Caixas" },
  { tipo: "usuario", rotulo: "Usuários" },
];

/** A busca nos dados começa com 2 caracteres (ou 1 número: filial 5, chamado #5). */
export const buscaValida = (termo: string) => {
  const t = termo.trim();
  return t.length >= 2 || /^\d$/.test(t);
};
