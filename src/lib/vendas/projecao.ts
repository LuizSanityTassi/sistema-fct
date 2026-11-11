// Projeção de fechamento do mês do painel de vendas.
//
// Modelo (testado contra o fechado de jul/2025 a out/2026 na venda da rede: erro médio de 10,5% do modelo antigo, que
// só usava a média de cada dia da semana do mês, para 3,2%; no dia 12 do mês, de 11,2% para 2,3%):
//
//   venda esperada do dia = nível do mês × peso do dia da semana × peso do dia do mês
//
// - peso do dia da semana: quanto cada dia vende em relação ao dia útil (domingo ~0,33, sábado ~0,8), nos últimos 12 meses;
// - peso do dia do mês: o começo do mês (pagamento) vende mais e o fim menos; os 2 últimos dias do mês têm peso próprio;
// - nível do mês: tirado dos dias completos deste mês, já descontados esses pesos;
// - feriado e Carnaval não entram em nenhuma média e vendem a proporção que tiveram no histórico (venda do dia ÷ dia útil
//   do mês, jan/2025 a nov/2026): feriado nacional em dia de semana 0,33 a 0,50 (0,43); Natal e Ano-Novo 0,20 a 0,24;
//   Carnaval segunda 0,78 a 0,86, terça 0,57 a 0,64; feriado no sábado 0,78 do sábado (15/11/2025).
//
// Sem dependência do servidor (só datas "aaaa-mm-dd"), para poder ser testado fora do Next.

export type TipoDiaEspecial = "feriado" | "natal" | "carnaval_seg" | "carnaval_ter";
export type DiaEspecial = { tipo: TipoDiaEspecial; nome: string };

/** Quanto o dia especial vende em relação ao dia útil do mês. */
export const FATOR_DIA_ESPECIAL: Record<TipoDiaEspecial, number> = { feriado: 0.43, natal: 0.22, carnaval_seg: 0.82, carnaval_ter: 0.6 };
/** Feriado que cai no sábado (menos Natal/Ano-Novo): em relação a um sábado comum. */
export const FATOR_FERIADO_SABADO = 0.78;
/** Peso do dia da semana quando o histórico é curto demais (loja nova): o típico da rede. */
const PESO_SEMANA_PADRAO = [0.33, 1, 1, 1, 1, 1, 0.8];
/** Amostras mínimas para confiar num peso do histórico. */
const MINIMO = 3;

const diaDaSemana = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
function somarDias(d: string, n: number) {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
const fimDoMesDe = (d: string) => {
  const [a, m] = d.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
const media = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
const diaUtil = (d: string) => diaDaSemana(d) >= 1 && diaDaSemana(d) <= 5;

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const FIXOS: [string, string][] = [
  ["01-01", "Confraternização Universal"],
  ["04-21", "Tiradentes"],
  ["05-01", "Dia do Trabalho"],
  ["09-07", "Independência do Brasil"],
  ["10-12", "Nossa Senhora Aparecida"],
  ["11-02", "Finados"],
  ["11-15", "Proclamação da República"],
  ["11-20", "Consciência Negra"],
  ["12-25", "Natal"],
];

/**
 * Dias que vendem menos entre `de` e `ate`: os feriados nacionais (os fixos, os da Páscoa e os do cadastro do ponto, que
 * vem em `cadastrados`) e o Carnaval, que não é feriado oficial mas esvazia o comércio.
 */
export function diasEspeciais(cadastrados: Map<string, string>, de: string, ate: string): Map<string, DiaEspecial> {
  const out = new Map<string, DiaEspecial>();
  const incluir = (data: string, nome: string, tipo?: TipoDiaEspecial) => {
    if (data < de || data > ate || out.has(data)) return;
    const md = data.slice(5);
    out.set(data, { tipo: tipo ?? (md === "12-25" || md === "01-01" ? "natal" : "feriado"), nome });
  };
  for (const [data, nome] of cadastrados) incluir(data, nome);
  for (let ano = Number(de.slice(0, 4)); ano <= Number(ate.slice(0, 4)); ano++) {
    for (const [md, nome] of FIXOS) incluir(`${ano}-${md}`, nome);
    const p = pascoa(ano);
    incluir(somarDias(p, -48), "Carnaval", "carnaval_seg");
    incluir(somarDias(p, -47), "Carnaval", "carnaval_ter");
    incluir(somarDias(p, -2), "Sexta-feira Santa");
    incluir(somarDias(p, 60), "Corpus Christi");
  }
  return out;
}

/** Chave do peso do dia do mês: o número do dia, menos nos 2 últimos dias do mês ("f1" = penúltimo, "f0" = último). */
function chaveDoMes(d: string) {
  const dia = Number(d.slice(8, 10));
  const falta = Number(fimDoMesDe(d).slice(8, 10)) - dia;
  return falta <= 1 ? `f${falta}` : String(dia);
}

/** Pesos do dia da semana e do dia do mês, aprendidos de um histórico diário (meses completos, de preferência 12). */
function aprenderPesos(historico: Map<string, number>, especiais: Map<string, DiaEspecial>) {
  // cada dia comum em relação ao dia útil do próprio mês
  const porMes = new Map<string, string[]>();
  for (const [d, v] of historico) {
    if (v <= 0 || especiais.has(d)) continue;
    const m = d.slice(0, 7);
    if (!porMes.has(m)) porMes.set(m, []);
    porMes.get(m)!.push(d);
  }
  const amostras: { d: string; x: number }[] = [];
  for (const dias of porMes.values()) {
    const util = media(dias.filter(diaUtil).map((d) => historico.get(d)!));
    if (!util) continue;
    for (const d of dias) amostras.push({ d, x: historico.get(d)! / util });
  }
  const semana = PESO_SEMANA_PADRAO.map((padrao, w) => {
    const xs = amostras.filter((a) => diaDaSemana(a.d) === w).map((a) => a.x);
    return xs.length >= MINIMO ? media(xs)! : padrao;
  });
  // o que sobra depois do dia da semana, por dia do mês (média do dia com os vizinhos, para alisar)
  const brutos = new Map<string, number[]>();
  for (const a of amostras) {
    const k = chaveDoMes(a.d);
    if (!brutos.has(k)) brutos.set(k, []);
    brutos.get(k)!.push(a.x / semana[diaDaSemana(a.d)]);
  }
  const base = new Map([...brutos].filter(([, xs]) => xs.length >= MINIMO).map(([k, xs]) => [k, media(xs)!]));
  const doMes = (d: string) => {
    const k = chaveDoMes(d);
    if (k.startsWith("f")) return base.get(k) ?? 1;
    const n = Number(k);
    const vizinhos = [n - 1, n, n + 1].map((j) => base.get(String(j))).filter((x): x is number => x != null);
    return media(vizinhos) ?? 1;
  };
  return { semana, doMes };
}

export type EntradaProjecao = {
  /** venda de cada dia do mês até o último dia lido (hoje, se parcial) */
  vendaPorDia: Map<string, number>;
  /** venda de cada dia dos meses anteriores (12 meses), de onde saem os pesos */
  historico: Map<string, number>;
  /** último dia lido */
  ate: string;
  /** último dia completo (ontem) */
  ontem: string;
  /** o último dia lido é hoje, ainda vendendo */
  parcial: boolean;
  /** já vendido no mês (o realizado do painel) */
  realizado: number;
  /** feriados e Carnaval do histórico e do mês (diasEspeciais) */
  especiais: Map<string, DiaEspecial>;
};

export function projetarMes(e: EntradaProjecao) {
  const { semana, doMes } = aprenderPesos(e.historico, e.especiais);
  // nível do mês: venda dos dias completos e comuns ÷ a soma dos pesos deles
  const comuns = [...e.vendaPorDia].filter(([d, v]) => d <= e.ontem && v > 0 && !e.especiais.has(d));
  const peso = comuns.reduce((s, [d]) => s + semana[diaDaSemana(d)] * doMes(d), 0);
  let nivel = peso ? comuns.reduce((s, [, v]) => s + v, 0) / peso : null;
  if (nivel == null) {
    // nenhum dia comum completo ainda (dia 1 ou 2): o dia útil do último mês do histórico
    const ultimoMes = [...e.historico.keys()].sort().at(-1)?.slice(0, 7);
    nivel = media([...e.historico].filter(([d, v]) => d.startsWith(ultimoMes ?? "-") && v > 0 && diaUtil(d) && !e.especiais.has(d)).map(([, v]) => v)) ?? 0;
  }
  const valorDoDia = (d: string) => {
    const w = diaDaSemana(d);
    const comum = nivel * semana[w] * doMes(d);
    const esp = e.especiais.get(d);
    if (!esp) return comum;
    if (w === 6 && esp.tipo !== "natal") return FATOR_FERIADO_SABADO * comum;
    return Math.min(FATOR_DIA_ESPECIAL[esp.tipo] * nivel * doMes(d), comum);
  };
  const fimDoMes = fimDoMesDe(e.ate);
  const faltamDias: string[] = [];
  for (let d = somarDias(e.ate, 1); d <= fimDoMes; d = somarDias(d, 1)) faltamDias.push(d);
  const vendaHoje = e.parcial ? (e.vendaPorDia.get(e.ate) ?? 0) : 0;
  const restoDeHoje = e.parcial ? Math.max(0, valorDoDia(e.ate) - vendaHoje) : 0;
  const projecao = e.realizado + restoDeHoje + faltamDias.reduce((s, d) => s + valorDoDia(d), 0);
  const especiaisPelaFrente = [...(e.parcial ? [e.ate] : []), ...faltamDias].filter((d) => e.especiais.has(d)).map((d) => ({ data: d, ...e.especiais.get(d)! }));
  return { projecao, faltamDias, especiaisPelaFrente, valorDoDia };
}
