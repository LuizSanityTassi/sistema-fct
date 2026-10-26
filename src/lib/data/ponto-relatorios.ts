import * as XLSX from "xlsx";
import type { Sessao } from "@/lib/auth/session";
import { limitesMes, local } from "@/lib/ponto/calculo";
import {
  ehRelatorioPonto,
  relatorioBanco,
  relatorioDias,
  relatorioEspelho,
  relatorioHoras,
  relatorioMarcacoes,
  RELATORIOS_PONTO,
  type TipoRelatorioPonto,
} from "@/lib/ponto/relatorios";
import type { Coluna, Relatorio } from "@/lib/relatorios/csv";
import { apurar, bancoDeHoras, gerePonto, lerMes, lerUuid, listarEquipe, listarMarcacoes, meuFuncionario, rotuloMes, type FuncPonto } from "./ponto";

export type ParamsRelatorioPonto = { relatorio: TipoRelatorioPonto; mes: string; filial?: string; departamento?: string; funcionario?: string; q?: string };

export function lerParamsRelatorioPonto(sp: Record<string, string | string[] | undefined>): ParamsRelatorioPonto {
  const v = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  return {
    relatorio: ehRelatorioPonto(v("relatorio")) ? (v("relatorio") as TipoRelatorioPonto) : "horas",
    mes: lerMes(v("mes")),
    filial: lerUuid(v("filial")),
    departamento: lerUuid(v("departamento")),
    funcionario: lerUuid(v("funcionario")),
    q: v("q").slice(0, 60) || undefined,
  };
}

/** Quem o relatório cobre: o gestor escolhe filial/departamento/funcionário; os demais só veem o próprio ponto. */
async function quem(sessao: Sessao, p: ParamsRelatorioPonto): Promise<FuncPonto[]> {
  if (!gerePonto(sessao)) {
    const eu = await meuFuncionario();
    return eu ? [eu] : [];
  }
  if (p.funcionario) return listarEquipe({ ids: [p.funcionario], desligados: true });
  return listarEquipe({ filial: p.filial, departamento: p.departamento, q: p.q });
}

/** Monta as tabelas do relatório pedido (mesmos dados da tela; o RLS limita o que cada um vê). */
export async function montarRelatorioPonto(sessao: Sessao, p: ParamsRelatorioPonto): Promise<{ titulo: string; relatorios: Relatorio[]; funcionarios: number }> {
  const funcs = await quem(sessao, p);
  const periodo = rotuloMes(p.mes);
  const { de, ate } = limitesMes(p.mes);
  const titulo = `${RELATORIOS_PONTO[p.relatorio]} · ${periodo}`;
  if (!funcs.length) return { titulo, relatorios: [], funcionarios: 0 };

  if (p.relatorio === "banco") {
    const bancos = await bancoDeHoras(funcs);
    return { titulo: RELATORIOS_PONTO.banco, relatorios: [relatorioBanco(bancos, new Date().toISOString().slice(0, 10))], funcionarios: funcs.length };
  }
  if (p.relatorio === "marcacoes") {
    const ms = (await listarMarcacoes(funcs.map((f) => f.id), de, ate)).filter((m) => {
      const d = local(m.momento).data;
      return d >= de && d <= ate;
    });
    return { titulo, relatorios: [relatorioMarcacoes(new Map(funcs.map((f) => [f.id, f])), ms, periodo)], funcionarios: funcs.length };
  }
  const aps = await apurar(funcs, de, ate);
  if (p.relatorio === "espelho") return { titulo, relatorios: aps.map((a) => relatorioEspelho(a, periodo)), funcionarios: funcs.length };
  if (p.relatorio === "horas") return { titulo, relatorios: [relatorioHoras(aps, periodo)], funcionarios: funcs.length };
  return { titulo, relatorios: [relatorioDias(aps, periodo, p.relatorio)], funcionarios: funcs.length };
}

/** Excel (.xlsx): uma aba por tabela (espelho: uma aba por funcionário). */
export function gerarXlsx(relatorios: Relatorio[]): Buffer {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const r of relatorios) {
    const cab = r.colunas.map((c: Coluna) => c.titulo);
    const valor = (v: unknown, c: Coluna) => (v === null || v === undefined ? "" : c.tipo === "data" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);
    const linhas = r.linhas.map((l) => r.colunas.map((c) => valor(l[c.chave], c)));
    const tot = r.totais ? [r.colunas.map((c) => valor(r.totais![c.chave], c))] : [];
    const ws = XLSX.utils.aoa_to_sheet([[r.titulo], [], cab, ...linhas, ...tot]);
    ws["!cols"] = r.colunas.map((c, i) => ({ wch: Math.min(40, Math.max(c.titulo.length, ...linhas.map((l) => String(l[i] ?? "").length)) + 2) }));
    // nome da aba: até 31 caracteres, sem : \ / ? * [ ] e sem repetir
    let nome = (relatorios.length > 1 ? (r.titulo.split(" · ")[1] ?? r.titulo) : "Relatório").replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
    for (let i = 2; usados.has(nome); i++) nome = `${nome.slice(0, 27)} (${i})`;
    usados.add(nome);
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  if (!relatorios.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Sem dados para este filtro."]]), "Relatório");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
