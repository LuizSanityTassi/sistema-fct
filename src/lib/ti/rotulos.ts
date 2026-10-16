// Rótulos do módulo de TI. Módulo puro (server e client).
import type { Enums } from "@/lib/tipos";

export type StatusAtivo = Enums["it_asset_status"];

export const STATUS_ATIVO_LABEL: Record<StatusAtivo, string> = {
  em_uso: "Em uso",
  estoque: "Em estoque",
  manutencao: "Em manutenção",
  baixado: "Baixado",
};

export type TipoAtivo = {
  codigo: string;
  rotulo: string;
  /** Valor unitário de referência (R$) usado nos inventários das lojas. */
  valorReferencia: number | null;
  /** true quando o valor é mensal (aluguel), não de compra. */
  mensal?: boolean;
};

// Valores de referência definidos pela empresa nos inventários de loja (jul/2026).
export const TIPOS_ATIVO: TipoAtivo[] = [
  { codigo: "computador", rotulo: "Computador (CPU/Desktop)", valorReferencia: 2200 },
  { codigo: "notebook", rotulo: "Notebook", valorReferencia: 3000 },
  { codigo: "servidor", rotulo: "Servidor", valorReferencia: 4000 },
  { codigo: "monitor", rotulo: "Monitor", valorReferencia: 325 },
  { codigo: "impressora", rotulo: "Impressora A4", valorReferencia: 950 },
  { codigo: "impressora_termica", rotulo: "Impressora térmica", valorReferencia: 550 },
  { codigo: "tef", rotulo: "Máquina TEF / maquineta", valorReferencia: 39, mensal: true },
  { codigo: "leitor", rotulo: "Leitor de código de barras (bipe)", valorReferencia: 150 },
  { codigo: "biometria", rotulo: "Leitor biométrico (FingerTech)", valorReferencia: null },
  { codigo: "nobreak", rotulo: "Nobreak", valorReferencia: 600 },
  { codigo: "estabilizador", rotulo: "Estabilizador", valorReferencia: 160 },
  { codigo: "dvr", rotulo: "DVR", valorReferencia: 2500 },
  { codigo: "camera", rotulo: "Câmera", valorReferencia: 150 },
  { codigo: "rede", rotulo: "Roteador / switch", valorReferencia: null },
  { codigo: "celular", rotulo: "Celular", valorReferencia: null },
  { codigo: "mouse", rotulo: "Mouse", valorReferencia: 60 },
  { codigo: "teclado", rotulo: "Teclado", valorReferencia: 40 },
  { codigo: "outro", rotulo: "Outro", valorReferencia: null },
];

export const TIPO_ATIVO_LABEL: Record<string, string> = Object.fromEntries(TIPOS_ATIVO.map((t) => [t.codigo, t.rotulo]));

export function tipoAtivoValido(codigo: unknown): codigo is string {
  return typeof codigo === "string" && TIPOS_ATIVO.some((t) => t.codigo === codigo);
}

export const SISTEMAS_ACESSO = [
  "Trier (sistema da farmácia)",
  "Sistema FCT (este sistema)",
  "E-mail corporativo",
  "Omie (financeiro)",
  "Portal / Conciliação",
  "Wi-Fi / rede da loja",
  "Outro",
];

export const TIPOS_SOLICITACAO_ACESSO = {
  novo: "Novo acesso",
  alteracao: "Alteração de permissões",
  remocao: "Remoção de acesso (desligamento/troca)",
} as const;

/** Sigla do tipo no código patrimonial: TI-F009-PC-003. */
export const SIGLA_TIPO_ATIVO: Record<string, string> = {
  computador: "PC",
  notebook: "NB",
  servidor: "SRV",
  monitor: "MON",
  impressora: "IMP",
  impressora_termica: "IMT",
  tef: "TEF",
  leitor: "LEI",
  biometria: "BIO",
  nobreak: "NBK",
  estabilizador: "EST",
  dvr: "DVR",
  camera: "CAM",
  rede: "RED",
  celular: "CEL",
  mouse: "MOU",
  teclado: "TEC",
  outro: "OUT",
};

/** Prefixo do código patrimonial para a loja e o tipo (sem o número): "TI-F009-PC-". */
export const prefixoPatrimonio = (codigoLoja: string, tipo: string) => `TI-${codigoLoja.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${SIGLA_TIPO_ATIVO[tipo] ?? "OUT"}-`;

/** Próximo código livre: maior número já usado com o prefixo + 1, com 3 dígitos. */
export function proximoPatrimonio(prefixo: string, existentes: (string | null)[]) {
  let maior = 0;
  for (const p of existentes) {
    if (!p?.startsWith(prefixo)) continue;
    const n = Number.parseInt(p.slice(prefixo.length), 10);
    if (Number.isFinite(n) && n > maior) maior = n;
  }
  return `${prefixo}${String(maior + 1).padStart(3, "0")}`;
}

export const TIPOS_EVENTO_ATIVO = {
  cadastro: "Cadastro",
  transferencia: "Transferência",
  situacao: "Situação",
  responsavel: "Responsável",
  manutencao: "Manutenção",
  troca_peca: "Troca de peça",
  outro: "Anotação",
} as const;
export type TipoEventoAtivo = keyof typeof TIPOS_EVENTO_ATIVO;
/** Eventos que a TI registra à mão (os outros o sistema registra sozinho). */
export const EVENTOS_MANUAIS: TipoEventoAtivo[] = ["manutencao", "troca_peca", "outro"];
