// Carteira (Financeiro → Carteira): bancos e tipos de conta. Módulo puro (servidor e navegador).

/** Bancos mais comuns por código de compensação (o cadastro guarda o código). */
export const BANCOS: { codigo: string; nome: string }[] = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "041", nome: "Banrisul" },
  { codigo: "077", nome: "Inter" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "133", nome: "Cresol" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "260", nome: "Nubank" },
  { codigo: "336", nome: "C6 Bank" },
  { codigo: "341", nome: "Itaú" },
  { codigo: "422", nome: "Safra" },
  { codigo: "707", nome: "Daycoval" },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "756", nome: "Sicoob" },
];
const NOME_BANCO = new Map(BANCOS.map((b) => [b.codigo, b.nome]));
export const nomeBanco = (codigo: string | null | undefined) => (codigo ? (NOME_BANCO.get(codigo) ?? `Banco ${codigo}`) : null);

export const TIPOS_CONTA = { corrente: "Conta corrente", aplicacao: "Aplicação", caixa: "Caixa", cofre: "Cofre" } as const;
export type TipoConta = keyof typeof TIPOS_CONTA;
export const ehTipoConta = (v: unknown): v is TipoConta => typeof v === "string" && v in TIPOS_CONTA;

export type ContaBancaria = {
  id: string;
  apelido: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: string;
  grupo: string | null;
  ativa: boolean;
  observacao: string | null;
  atualizado_em: string;
};
