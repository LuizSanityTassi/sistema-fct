// Sangria → conta a receber no Omie (puro: roda no servidor e nos testes). O formato é o que a Zanini usava, para o
// financeiro continuar conciliando do mesmo jeito: cliente "Cliente Sangrias", categoria 1.01.93, a filial em 100% no
// departamento e vencimento e previsão na data do depósito.
import type { EmpresaOmie } from "@/lib/conciliacao/omie-api";

/** Cadastros do Omie de cada empresa (conferidos em 05/11/2026 nos lançamentos da Zanini). */
export const SANGRIA_NO_OMIE: Record<EmpresaOmie, { cliente: number; categoria: string; tipoDocumento: string }> = {
  varela: { cliente: 11082218167, categoria: "1.01.93", tipoDocumento: "NFE" },
  nazario: { cliente: 3211519773, categoria: "1.01.93", tipoDocumento: "BOL" },
};

/** Código de integração do lançamento: o mesmo a cada tentativa, então reenviar não cria outro título no Omie. */
export const codigoIntegracaoSangria = (id: string) => `SANGRIA-${id}`;

/** Diferença de dias, para mais ou para menos, em que mesma filial e mesmo valor ainda contam como "parecida". */
export const DIAS_PARECIDA = 3;

export type TituloSangriaOmie = { codigo: string; integracao: string; vencimento: string; valor: number; departamento: string; status: string };
export type SangriaParaConferir = { id: string; deposito: string; valor: number; departamento: string };
export type ConferenciaOmie =
  | { tipo: "nova" }
  | { tipo: "ja_enviada"; codigo: string }
  | { tipo: "duplicada"; codigo: string; motivo: string }
  | { tipo: "parecida"; codigo: string; motivo: string };

/** aaaa-mm-dd → dd/mm/aaaa (o Omie usa o formato brasileiro). */
export const dataOmie = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const diaDoAno = (br: string) => Date.UTC(Number(br.slice(6, 10)), Number(br.slice(3, 5)) - 1, Number(br.slice(0, 2))) / 86_400_000;

/**
 * Na dúvida, não lança. Já lançada pelo portal (mesmo código de integração): só marca. Mesma filial, data e valor de outra
 * sangria no Omie (da Zanini ou de alguém à mão): duplicada. Mesma filial e valor a até DIAS_PARECIDA dias: parecida,
 * que só sobe se o financeiro mandar mesmo assim. Título cancelado no Omie não conta como duplicado.
 */
export function conferirSangriaNoOmie(s: SangriaParaConferir, titulos: TituloSangriaOmie[]): ConferenciaOmie {
  const nosso = titulos.find((t) => t.integracao === codigoIntegracaoSangria(s.id));
  if (nosso) return { tipo: "ja_enviada", codigo: nosso.codigo };
  const venc = dataOmie(s.deposito);
  const daFilial = titulos.filter((t) => t.status !== "CANCELADO" && t.departamento === s.departamento && Math.abs(t.valor - s.valor) < 0.005);
  const igual = daFilial.find((t) => t.vencimento === venc);
  if (igual) return { tipo: "duplicada", codigo: igual.codigo, motivo: `já existe no Omie sangria desta filial com a mesma data e o mesmo valor (lançamento ${igual.codigo})` };
  const perto = daFilial
    .map((t) => ({ t, dias: Math.abs(diaDoAno(t.vencimento) - diaDoAno(venc)) }))
    .filter((x) => Number.isFinite(x.dias) && x.dias <= DIAS_PARECIDA)
    .sort((a, b) => a.dias - b.dias)[0];
  if (perto) {
    const quando = perto.dias === 1 ? "1 dia" : `${perto.dias} dias`;
    return { tipo: "parecida", codigo: perto.t.codigo, motivo: `já existe no Omie sangria desta filial com o mesmo valor, com ${quando} de diferença (lançamento ${perto.t.codigo}, vencimento ${perto.t.vencimento})` };
  }
  return { tipo: "nova" };
}

export type DadosLancamentoSangria = {
  id: string;
  empresa: EmpresaOmie;
  contaCorrente: number;
  departamento: string;
  deposito: string;
  retirada: string;
  valor: number;
  numeroDeposito: string | null;
  filial: string;
  conferidaPor: string | null;
  hoje: string;
};

/** O que vai para o UpsertContaReceber. */
export function lancamentoDaSangria(d: DadosLancamentoSangria) {
  const cfg = SANGRIA_NO_OMIE[d.empresa];
  const valor = Math.round(d.valor * 100) / 100;
  const obs = [`Sangria lançada pelo portal FCT · ${d.filial}`, `depósito ${d.numeroDeposito ?? "sem nº"} em ${dataOmie(d.deposito)}`, `retirada em ${dataOmie(d.retirada)}`, d.conferidaPor ? `conferida por ${d.conferidaPor}` : null]
    .filter(Boolean)
    .join(" · ");
  return {
    codigo_lancamento_integracao: codigoIntegracaoSangria(d.id),
    codigo_cliente_fornecedor: cfg.cliente,
    codigo_categoria: cfg.categoria,
    codigo_tipo_documento: cfg.tipoDocumento,
    id_conta_corrente: d.contaCorrente,
    data_vencimento: dataOmie(d.deposito),
    data_previsao: dataOmie(d.deposito),
    data_emissao: dataOmie(d.hoje),
    valor_documento: valor,
    numero_documento: (d.numeroDeposito ?? "").slice(0, 20),
    observacao: obs.slice(0, 2000),
    distribuicao: [{ cCodDep: d.departamento, nPerDep: 100, nValDep: valor }],
  };
}
