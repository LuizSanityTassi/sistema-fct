// Cálculo simplificado da folha mensal CLT com as tabelas vigentes em 2026.
// É uma ESTIMATIVA para conferência interna: a folha oficial continua sendo a da contabilidade.
// Não cobre: DSR sobre horas extras, adicional noturno, insalubridade/periculosidade, salário-família,
// vale-transporte, férias/13º e encargos patronais além do FGTS.

export const TABELAS_2026 = {
  salarioMinimo: 1621.0,
  // INSS do empregado: alíquotas progressivas por faixa (vigência 2026)
  inss: {
    faixas: [
      { ate: 1621.0, aliquota: 0.075 },
      { ate: 2902.84, aliquota: 0.09 },
      { ate: 4354.27, aliquota: 0.12 },
      { ate: 8475.55, aliquota: 0.14 },
    ],
    teto: 8475.55,
  },
  // IRRF mensal: tabela progressiva + redução da Lei 15.270/2025 (isento até R$ 5.000; decresce até R$ 7.350)
  irrf: {
    faixas: [
      { ate: 2428.8, aliquota: 0, deduzir: 0 },
      { ate: 2826.65, aliquota: 0.075, deduzir: 182.16 },
      { ate: 3751.05, aliquota: 0.15, deduzir: 394.16 },
      { ate: 4664.68, aliquota: 0.225, deduzir: 675.49 },
      { ate: Number.POSITIVE_INFINITY, aliquota: 0.275, deduzir: 908.73 },
    ],
    deducaoDependente: 189.59,
    descontoSimplificado: 607.2,
    reducao: { isentoAte: 5000.0, limite: 7350.0, a: 978.62, b: 0.133145 },
  },
  fgts: { padrao: 0.08, aprendiz: 0.02 },
} as const;

export type EntradaCalculo = {
  salarioBase: number;
  horasMes: number | null;
  qtdExtras50: number;
  qtdExtras100: number;
  adicionais: number;
  beneficios: number;
  outrosDescontos: number;
  dependentes: number;
  aprendiz: boolean;
};

export type ResultadoCalculo = {
  valorHora: number;
  horasExtras: number;
  bruto: number;
  inss: number;
  baseIrrf: number;
  irrf: number;
  reducaoIrrf: number;
  fgts: number;
  descontos: number;
  liquido: number;
};

const arred = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function calcularInss(bruto: number) {
  let total = 0;
  let anterior = 0;
  for (const faixa of TABELAS_2026.inss.faixas) {
    if (bruto <= anterior) break;
    total += (Math.min(bruto, faixa.ate) - anterior) * faixa.aliquota;
    anterior = faixa.ate;
  }
  return arred(total);
}

export function calcularIrrf(bruto: number, inss: number, dependentes: number) {
  const t = TABELAS_2026.irrf;
  // Vale a dedução mais vantajosa: legal (INSS + dependentes) ou o desconto simplificado.
  const deducao = Math.max(inss + dependentes * t.deducaoDependente, t.descontoSimplificado);
  const base = Math.max(0, bruto - deducao);
  const faixa = t.faixas.find((f) => base <= f.ate) ?? t.faixas[t.faixas.length - 1];
  const impostoTabela = Math.max(0, base * faixa.aliquota - faixa.deduzir);
  let reducao = 0;
  if (bruto <= t.reducao.isentoAte) reducao = impostoTabela;
  else if (bruto <= t.reducao.limite) {
    reducao = Math.min(impostoTabela, Math.max(0, t.reducao.a - t.reducao.b * bruto));
  }
  return { base: arred(base), imposto: arred(impostoTabela - reducao), reducao: arred(reducao) };
}

export function calcularFolha(e: EntradaCalculo): ResultadoCalculo {
  const horasMes = e.horasMes && e.horasMes > 0 ? e.horasMes : 220;
  const valorHora = e.salarioBase / horasMes;
  const horasExtras = arred(e.qtdExtras50 * valorHora * 1.5 + e.qtdExtras100 * valorHora * 2);
  const bruto = arred(e.salarioBase + horasExtras + e.adicionais);
  const inss = calcularInss(bruto);
  const irrf = calcularIrrf(bruto, inss, e.dependentes);
  const fgts = arred(bruto * (e.aprendiz ? TABELAS_2026.fgts.aprendiz : TABELAS_2026.fgts.padrao));
  const descontos = arred(inss + irrf.imposto + e.outrosDescontos);
  return {
    valorHora: arred(valorHora),
    horasExtras,
    bruto,
    inss,
    baseIrrf: irrf.base,
    irrf: irrf.imposto,
    reducaoIrrf: irrf.reducao,
    fgts,
    descontos,
    liquido: arred(bruto - descontos),
  };
}
