// Relatórios do ponto (CSV, Excel e impressão/PDF usam as mesmas tabelas). Funções puras sobre a apuração.
import type { Relatorio } from "@/lib/relatorios/csv";
import { AUSENCIA_LABEL, DIAS_SEMANA_CURTO, diaSemana, duracao, local, METODO_LABEL, saldoTexto, TIPO_MARCACAO_LABEL, type ApuracaoDia, type TotaisPeriodo } from "./calculo";
import { rotuloSituacao } from "./situacao";

export const RELATORIOS_PONTO = {
  horas: "Horas por funcionário (consolidado)",
  espelho: "Espelho de ponto (dia a dia)",
  extras: "Horas extras",
  faltas: "Faltas, atrasos e dias incompletos",
  inconsistencias: "Inconsistências (CLT)",
  banco: "Banco de horas",
  marcacoes: "Marcações registradas (NSR, método, aparelho, IP)",
} as const;
export type TipoRelatorioPonto = keyof typeof RELATORIOS_PONTO;

export function ehRelatorioPonto(v: unknown): v is TipoRelatorioPonto {
  return typeof v === "string" && v in RELATORIOS_PONTO;
}

type Func = { id: string; nome: string; matricula: string | null; filialCodigo: string; filialNome: string; departamento: string | null; cargo: string | null };
type Ap = { func: Func; dias: ApuracaoDia[]; totais: TotaisPeriodo; jornadaAtual: string | null };
type Banco = { func: Func; total: number; creditos: number; debitos: number; saldoMovimentos: number; saldoAberto: number };
type MarcacaoRel = { nsr?: number | null; employee_id: string; momento: string; tipo: string; metodo: string; origem: string; dispositivo: string | null; ip: string | null; latitude: number | null; longitude: number | null; anulada: boolean; anulada_motivo?: string | null };

const h = (min: number) => (min ? duracao(min) : "");
const s = (min: number) => (min ? saldoTexto(min) : "");
const hora = (iso: string) => {
  const l = local(iso);
  return `${String(Math.floor(l.min / 60)).padStart(2, "0")}:${String(l.min % 60).padStart(2, "0")}`;
};
const filial = (f: Func) => `${f.filialCodigo} ${f.filialNome}`.trim();
const horarioPrevisto = (d: ApuracaoDia) => {
  const p = d.previsto.horarios;
  if (!p?.entrada || !p.saida || d.previsto.minutos === 0) return d.previsto.feriado ? `Feriado` : "Folga";
  return p.intervalo_inicio && p.intervalo_fim ? `${p.entrada.slice(0, 5)}-${p.intervalo_inicio.slice(0, 5)} ${p.intervalo_fim.slice(0, 5)}-${p.saida.slice(0, 5)}` : `${p.entrada.slice(0, 5)}-${p.saida.slice(0, 5)}`;
};

const COLS_FUNC = [
  { chave: "funcionario", titulo: "Funcionário" },
  { chave: "matricula", titulo: "Matrícula" },
  { chave: "filial", titulo: "Filial" },
];
const colsFunc = (f: Func) => ({ funcionario: f.nome, matricula: f.matricula ?? "", filial: filial(f) });

export function relatorioHoras(aps: Ap[], periodo: string): Relatorio {
  const tot = { previsto: 0, trabalhado: 0, saldo: 0, extra: 0, extra100: 0, debito: 0, noturno: 0, faltas: 0, atrasos: 0, inconsistencias: 0 };
  const linhas = aps.map(({ func: f, totais: t, jornadaAtual }) => {
    tot.previsto += t.previsto;
    tot.trabalhado += t.trabalhado;
    tot.saldo += t.saldo;
    tot.extra += t.extra - t.extra100;
    tot.extra100 += t.extra100;
    tot.debito += t.debito;
    tot.noturno += t.noturno;
    tot.faltas += t.faltas;
    tot.atrasos += t.atrasos;
    tot.inconsistencias += t.inconsistencias;
    return {
      ...colsFunc(f),
      departamento: f.departamento ?? "",
      jornada: jornadaAtual ?? "Sem jornada",
      previsto: h(t.previsto),
      trabalhado: h(t.trabalhado),
      extra50: h(t.extra - t.extra100),
      extra100: h(t.extra100),
      debito: h(t.debito),
      saldo: s(t.saldo),
      noturno: h(t.noturno),
      faltas: t.faltas,
      atrasos: t.atrasos,
      inconsistencias: t.inconsistencias,
    };
  });
  return {
    titulo: `Horas por funcionário · ${periodo}`,
    colunas: [
      ...COLS_FUNC,
      { chave: "departamento", titulo: "Departamento" },
      { chave: "jornada", titulo: "Jornada" },
      { chave: "previsto", titulo: "Previsto" },
      { chave: "trabalhado", titulo: "Trabalhado" },
      { chave: "extra50", titulo: "Extra 50%" },
      { chave: "extra100", titulo: "Extra 100%" },
      { chave: "debito", titulo: "Débito" },
      { chave: "saldo", titulo: "Saldo" },
      { chave: "noturno", titulo: "Noturno" },
      { chave: "faltas", titulo: "Faltas", tipo: "inteiro" },
      { chave: "atrasos", titulo: "Atrasos", tipo: "inteiro" },
      { chave: "inconsistencias", titulo: "Inconsistências", tipo: "inteiro" },
    ],
    linhas,
    totais: {
      funcionario: `Total (${aps.length})`,
      previsto: h(tot.previsto),
      trabalhado: h(tot.trabalhado),
      extra50: h(tot.extra),
      extra100: h(tot.extra100),
      debito: h(tot.debito),
      saldo: s(tot.saldo),
      noturno: h(tot.noturno),
      faltas: tot.faltas,
      atrasos: tot.atrasos,
      inconsistencias: tot.inconsistencias,
    },
  };
}

export function relatorioEspelho(ap: Ap, periodo: string): Relatorio {
  const t = ap.totais;
  return {
    titulo: `Espelho de ponto · ${ap.func.nome}${ap.func.matricula ? ` (matr. ${ap.func.matricula})` : ""} · ${filial(ap.func)} · ${periodo}`,
    colunas: [
      { chave: "data", titulo: "Data", tipo: "data" },
      { chave: "dia", titulo: "Dia" },
      { chave: "previsto_h", titulo: "Horário previsto" },
      { chave: "m1", titulo: "Entrada" },
      { chave: "m2", titulo: "Intervalo" },
      { chave: "m3", titulo: "Retorno" },
      { chave: "m4", titulo: "Saída" },
      { chave: "extras_m", titulo: "Outras marcações" },
      { chave: "previsto", titulo: "Previsto" },
      { chave: "trabalhado", titulo: "Trabalhado" },
      { chave: "extra", titulo: "Extra" },
      { chave: "debito", titulo: "Débito" },
      { chave: "saldo", titulo: "Saldo" },
      { chave: "noturno", titulo: "Noturno" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "ocorrencias", titulo: "Ocorrências" },
    ],
    linhas: ap.dias
      .filter((d) => d.situacao !== "fora_contrato")
      .map((d) => {
        const ms = d.marcacoes.map((m) => `${hora(m.momento)}${m.origem === "ajuste" ? "*" : ""}`);
        return {
          data: d.data,
          dia: DIAS_SEMANA_CURTO[diaSemana(d.data)],
          previsto_h: d.previsto.origem === "ausencia" && d.previsto.ausencia ? AUSENCIA_LABEL[d.previsto.ausencia.tipo] : horarioPrevisto(d),
          m1: ms[0] ?? "",
          m2: ms[1] ?? "",
          m3: ms[2] ?? "",
          m4: ms[3] ?? "",
          extras_m: ms.slice(4).join(" "),
          previsto: h(d.previsto.minutos),
          trabalhado: h(d.trabalhado),
          extra: h(d.extra),
          debito: h(d.debito),
          saldo: s(d.saldo),
          noturno: h(d.noturno),
          situacao: rotuloSituacao(d),
          ocorrencias: d.ocorrencias.map((o) => o.texto).join("; "),
        };
      }),
    totais: { data: "", dia: "Total", previsto: h(t.previsto), trabalhado: h(t.trabalhado), extra: h(t.extra), debito: h(t.debito), saldo: s(t.saldo), noturno: h(t.noturno), situacao: `${t.faltas} falta(s)`, ocorrencias: `${t.inconsistencias} dia(s) com inconsistência · * = ajuste aprovado` },
  };
}

export function relatorioDias(aps: Ap[], periodo: string, tipo: "extras" | "faltas" | "inconsistencias"): Relatorio {
  const filtro = {
    extras: (d: ApuracaoDia) => d.extra > 0,
    faltas: (d: ApuracaoDia) => d.falta || d.atraso > 0 || d.situacao === "incompleto" || d.saidaAntecipada > 0,
    inconsistencias: (d: ApuracaoDia) => d.ocorrencias.some((o) => o.grave),
  }[tipo];
  const linhas = aps.flatMap(({ func: f, dias }) =>
    dias.filter(filtro).map((d) => ({
      ...colsFunc(f),
      data: d.data,
      dia: DIAS_SEMANA_CURTO[diaSemana(d.data)],
      previsto: h(d.previsto.minutos),
      trabalhado: h(d.trabalhado),
      extra: h(d.extra - d.extra100),
      extra100: h(d.extra100),
      atraso: h(d.atraso),
      saida: h(d.saidaAntecipada),
      saldo: s(d.saldo),
      situacao: rotuloSituacao(d),
      ocorrencias: d.ocorrencias.map((o) => o.texto).join("; "),
    })),
  );
  const extra = [
    { chave: "extra", titulo: "Extra 50%" },
    { chave: "extra100", titulo: "Extra 100%" },
  ];
  const falta = [
    { chave: "atraso", titulo: "Atraso" },
    { chave: "saida", titulo: "Saída antecipada" },
  ];
  return {
    titulo: `${RELATORIOS_PONTO[tipo]} · ${periodo}`,
    colunas: [
      ...COLS_FUNC,
      { chave: "data", titulo: "Data", tipo: "data" },
      { chave: "dia", titulo: "Dia" },
      { chave: "previsto", titulo: "Previsto" },
      { chave: "trabalhado", titulo: "Trabalhado" },
      ...(tipo === "extras" ? extra : tipo === "faltas" ? falta : []),
      { chave: "saldo", titulo: "Saldo" },
      { chave: "situacao", titulo: "Situação" },
      { chave: "ocorrencias", titulo: "Ocorrências" },
    ],
    linhas,
  };
}

export function relatorioBanco(bancos: Banco[], data: string): Relatorio {
  return {
    titulo: `Banco de horas · saldo em ${data.split("-").reverse().join("/")}`,
    colunas: [
      ...COLS_FUNC,
      { chave: "departamento", titulo: "Departamento" },
      { chave: "creditos", titulo: "Horas positivas" },
      { chave: "debitos", titulo: "Horas negativas" },
      { chave: "fechado", titulo: "Meses fechados e lançamentos" },
      { chave: "aberto", titulo: "Meses abertos" },
      { chave: "total", titulo: "Saldo" },
    ],
    linhas: bancos.map((b) => ({ ...colsFunc(b.func), departamento: b.func.departamento ?? "", creditos: h(b.creditos), debitos: h(b.debitos), fechado: s(b.saldoMovimentos), aberto: s(b.saldoAberto), total: s(b.total) || "0:00" })),
    totais: { funcionario: `Total (${bancos.length})`, total: s(bancos.reduce((x, b) => x + b.total, 0)) },
  };
}

export function relatorioMarcacoes(funcs: Map<string, Func>, ms: MarcacaoRel[], periodo: string): Relatorio {
  return {
    titulo: `Marcações registradas · ${periodo}`,
    colunas: [
      { chave: "nsr", titulo: "NSR", tipo: "inteiro" },
      ...COLS_FUNC,
      { chave: "data", titulo: "Data", tipo: "data" },
      { chave: "hora", titulo: "Hora" },
      { chave: "tipo", titulo: "Tipo" },
      { chave: "metodo", titulo: "Método" },
      { chave: "origem", titulo: "Origem" },
      { chave: "dispositivo", titulo: "Aparelho" },
      { chave: "ip", titulo: "IP" },
      { chave: "local", titulo: "Localização" },
      { chave: "anulada", titulo: "Anulada" },
    ],
    linhas: ms.map((m) => {
      const f = funcs.get(m.employee_id);
      return {
        nsr: m.nsr ?? "",
        ...(f ? colsFunc(f) : { funcionario: "", matricula: "", filial: "" }),
        data: local(m.momento).data,
        hora: hora(m.momento),
        tipo: TIPO_MARCACAO_LABEL[m.tipo as keyof typeof TIPO_MARCACAO_LABEL] ?? m.tipo,
        metodo: METODO_LABEL[m.metodo] ?? m.metodo,
        origem: m.origem,
        dispositivo: m.dispositivo ?? "",
        ip: m.ip ?? "",
        local: m.latitude != null && m.longitude != null ? `${m.latitude}, ${m.longitude}` : "",
        anulada: m.anulada ? `Sim${m.anulada_motivo ? `: ${m.anulada_motivo}` : ""}` : "",
      };
    }),
  };
}
