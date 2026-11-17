// Excel da escala 5x2 (uma opção ou a mesma opção de várias filiais): resumo, escala mensal, turnos, folgas, horas,
// cobertura por hora, auditoria e configuração. As horas e o excedente são fórmulas ligadas à aba da escala mensal.
import "server-only";
import * as XLSX from "xlsx";
import type { Simulacao } from "@/lib/data/escalas";
import { ROTULO_DIA, ROTULO_FUNCAO, ROTULO_SITUACAO, diaChave, type Funcao } from "./motor";
import { celula, excedenteEquipe, horasEquipe, mesCurto, rotuloDias, textoFuncionamento } from "./resumo";

type Celula = string | number | boolean | null | { t: "n"; v: number; f: string };

function aba(wb: XLSX.WorkBook, nome: string, linhas: Celula[][], larguras: number[], cabecalho?: number) {
  const ws = XLSX.utils.aoa_to_sheet(linhas.map((l) => l.map((c) => (c && typeof c === "object" ? null : c))));
  // fórmulas (com o valor já calculado, para abrir certo em qualquer programa)
  linhas.forEach((l, r) =>
    l.forEach((c, k) => {
      if (c && typeof c === "object") ws[XLSX.utils.encode_cell({ r, c: k })] = c;
    }),
  );
  ws["!cols"] = larguras.map((wch) => ({ wch }));
  if (cabecalho !== undefined && linhas.length > cabecalho + 1) {
    const ult = XLSX.utils.encode_cell({ r: linhas.length - 1, c: Math.max(...linhas.map((l) => l.length)) - 1 });
    ws["!autofilter"] = { ref: `A${cabecalho + 1}:${ult}` };
  }
  XLSX.utils.book_append_sheet(wb, ws, nome);
}

const dm = (d: number, m: number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;

export function gerarExcelEscala(sims: Simulacao[], pessoaId?: string): Buffer {
  const wb = XLSX.utils.book_new();
  const lista = sims.map((s) => (pessoaId ? { ...s, equipe: s.equipe.filter((p) => p.id === pessoaId) } : s));
  const rascunho = sims.some((s) => s.situacao !== "oficial");
  const comPendencia = sims.some((s) => s.alertas.length);

  const resumo: Celula[][] = [
    ["SIMULADOR DE ESCALA 5x2 · FCT"],
    [
      `Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      rascunho ? (comPendencia ? "RASCUNHO com pendências de auditoria (veja a aba AUDITORIA)" : "RASCUNHO sem pendências") : "ESCALA OFICIAL",
    ],
    [],
    ["Filial", "Nome", "Período", "Opção", "Situação", "Pessoas ativas", "Jornada (h/sem)", "Horas no mês", "Excedente semanal (h)", "Pendências", "Folgas permitidas"],
  ];
  for (const s of lista)
    resumo.push([
      s.filial.codigo,
      s.filial.nome,
      mesCurto(s.ano, s.mes),
      s.opcao,
      s.situacao === "oficial" ? "Oficial" : s.situacao === "substituida" ? "Substituída" : "Rascunho",
      s.equipe.filter((p) => p.situacao === "ativo").length,
      s.jornadaSemanal,
      Number(horasEquipe(s).toFixed(1)),
      Number(excedenteEquipe(s).toFixed(1)),
      s.alertas.length,
      rotuloDias(s.folgasPermitidas),
    ]);
  aba(wb, "RESUMO", resumo, [10, 28, 10, 7, 12, 13, 14, 13, 18, 11, 22], 3);

  // escala mensal: guarda onde ficou o total de horas de cada pessoa (as abas de horas apontam para lá)
  const escala: Celula[][] = [["ESCALA MENSAL · horário de entrada (F folga · — fechado · A afastado · I inativo)"]];
  const celulaHoras = new Map<string, string>();
  for (const s of lista) {
    const n = s.cobertura.length;
    escala.push([]);
    escala.push([`${s.filial.codigo} · ${s.filial.nome} · opção ${s.opcao} · ${mesCurto(s.ano, s.mes)} · folgas em ${rotuloDias(s.folgasPermitidas)}`]);
    escala.push(["Colaborador", "Função", ...s.cobertura.map((c) => `${c.data} ${ROTULO_DIA[diaChave(s.ano, s.mes, c.data)]}`), "Horas"]);
    for (const p of s.equipe) {
      const turnos = new Map(p.turnos.map((t) => [t.data, t]));
      escala.push([p.nome, ROTULO_FUNCAO[p.funcao], ...s.cobertura.map((c) => celula(turnos.get(c.data)?.status ?? "fechado", turnos.get(c.data)?.inicio)), Number(p.totalHoras.toFixed(1))]);
      celulaHoras.set(`${s.id}:${p.id}`, XLSX.utils.encode_cell({ r: escala.length - 1, c: n + 2 }));
    }
  }
  aba(wb, "ESCALA MENSAL", escala, [30, 15, ...Array.from({ length: 31 }, () => 7), 8]);

  const pessoas: Celula[][] = [["Filial", "Nome", "Função", "Situação", "Horas/dia", "Intervalo (min)", "Registro (CRF)"]];
  const turnos: Celula[][] = [["Filial", "Nome", "Data", "Dia", "Entrada", "Saída p/ almoço", "Retorno", "Saída final", "Horas", "Ajuste manual"]];
  const folgas: Celula[][] = [["Filial", "Nome", "Data", "Dia"]];
  const horas: Celula[][] = [["Filial", "Nome", "Função", "Horas no mês", "Média semanal (h)", "Jornada (h/sem)", "Excedente semanal (h)"]];
  const cobertura: Celula[][] = [["Filial", "Data", "Dia", "Aberta", "Faixa", "Total na loja", "Por função"]];
  const auditoria: Celula[][] = [["Filial", "Severidade", "Pessoa", "Data", "Pendência", "Faixas sem cobertura (1 h)", "Alternativas para avaliar"]];
  const config: Celula[][] = [["Filial", "Nome", "Funcionamento", "Farmacêuticos mínimos/h", "Acordo >8 h/dia", "Jornada (h/sem)", "Folgas permitidas", "Situação"]];

  for (const s of lista) {
    const cod = s.filial.codigo;
    const nomes = new Map(s.equipe.map((p) => [p.id, p.nome]));
    for (const p of s.equipe) {
      pessoas.push([cod, p.nome, ROTULO_FUNCAO[p.funcao], ROTULO_SITUACAO[p.situacao], p.horasDia ?? s.jornadaSemanal / 5, p.intervaloMin, p.registro ?? ""]);
      for (const t of p.turnos) {
        if (t.status === "trabalho") turnos.push([cod, p.nome, dm(t.data, s.mes), ROTULO_DIA[t.dia], t.inicio ?? "", t.intervaloInicio || "—", t.intervaloFim || "—", t.fim ?? "", Number(t.horas.toFixed(2)), t.ajustado ? "Sim" : ""]);
        if (t.status === "folga") folgas.push([cod, p.nome, dm(t.data, s.mes), ROTULO_DIA[t.dia]]);
      }
      const r = horas.length + 1;
      const ref = celulaHoras.get(`${s.id}:${p.id}`);
      horas.push([
        cod,
        p.nome,
        ROTULO_FUNCAO[p.funcao],
        ref ? { t: "n", v: Number(p.totalHoras.toFixed(1)), f: `'ESCALA MENSAL'!${ref}` } : Number(p.totalHoras.toFixed(1)),
        Number(p.mediaSemanal.toFixed(1)),
        s.jornadaSemanal,
        { t: "n", v: Number(p.excedente.toFixed(1)), f: `MAX(0,E${r}-F${r})` },
      ]);
    }
    if (!pessoaId)
      for (const d of s.cobertura) {
        const faixas = d.faixas.length ? d.faixas : [{ hora: "—", porFuncao: d.porFuncao }];
        for (const f of faixas) {
          const por = Object.entries(f.porFuncao) as [Funcao, number][];
          cobertura.push([cod, dm(d.data, s.mes), ROTULO_DIA[d.dia], d.aberto ? "Sim" : "Não", f.hora, por.reduce((x, [, q]) => x + q, 0), por.map(([fn, q]) => `${ROTULO_FUNCAO[fn]}: ${q}`).join(" | ") || "Ninguém"]);
        }
      }
    for (const a of s.alertas) {
      if (pessoaId && a.pessoaId && a.pessoaId !== pessoaId) continue;
      auditoria.push([cod, a.severidade === "alta" ? "Alta" : "Média", a.pessoaId ? (nomes.get(a.pessoaId) ?? "") : "", a.data ? dm(a.data, s.mes) : "", a.mensagem, (a.faixas ?? []).join(", "), (a.sugestoes ?? []).join(" | ")]);
    }
    config.push([cod, s.filial.nome, textoFuncionamento(s.config), s.config.minimos.farmaceutico ?? 0, s.config.acordoJornadaEstendida ? "Sim" : "Não", s.jornadaSemanal, rotuloDias(s.folgasPermitidas), s.situacao]);
  }
  aba(wb, "FUNCIONÁRIOS", pessoas, [8, 32, 15, 10, 10, 14, 14], 0);
  aba(wb, "HORÁRIOS E TURNOS", turnos, [8, 32, 8, 6, 9, 14, 9, 11, 7, 13], 0);
  aba(wb, "FOLGAS", folgas, [8, 32, 8, 6], 0);
  aba(wb, "HORAS TRABALHADAS", horas, [8, 32, 15, 13, 17, 15, 20], 0);
  if (!pessoaId) aba(wb, "COBERTURA POR HORA", cobertura, [8, 8, 6, 7, 7, 12, 40], 0);
  aba(wb, "AUDITORIA", auditoria, [8, 10, 28, 8, 70, 30, 90], 0);
  aba(wb, "CONFIGURAÇÕES", config, [8, 28, 50, 22, 15, 15, 20, 12], 0);
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
