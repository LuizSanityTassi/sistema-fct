"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { rpcPaginado } from "@/lib/data/dre";
import { carregarEventos } from "@/lib/data/lancamentos-folha";
import { competenciaValida, rotuloCompetencia } from "@/lib/rh/competencia";
import { lerPlanilhaRh, type AbaLida } from "@/lib/rh/importacao-rh";
import { ativoNaCompetencia, competenciaParaData, distanciaNomes, ehFarmaceutico, formatarValorGrade, normalizarNome } from "@/lib/rh/lancamentos";
import { createClient } from "@/lib/supabase/server";

type Ref = { nome: string; aba: string; linha: number };

export type AnaliseRh = {
  competencia: string;
  arquivo: string;
  abas: AbaLida[];
  abasIgnoradas: string[];
  encontrados: number;
  naoEncontrados: Ref[];
  ambiguos: Ref[];
  novos: number;
  alterados: number;
  iguais: number;
  porEvento: { nome: string; qtd: number }[];
  avisos: { nome: string; evento: string; original: string; lido: string; aviso: string }[];
  alteracoes: { nome: string; evento: string; antes: string; depois: string }[];
  foraDaPlanilha: { evento: string; qtd: number }[];
  quebraFarmaceuticos: { nome: string; valor: string }[];
  duplicados: { nome: string; evento: string }[];
  parecidos: { planilha: string; cadastro: string }[];
  quebraFarmaceuticosLancada: boolean;
  observacoes: number;
};

export type EstadoImportacaoRh = { erro?: string; analise?: AnaliseRh; gravado?: { valores: number; observacoes: number } };

const PARTICULAS = new Set(["DE", "DA", "DO", "DOS", "DAS", "E"]);
const semParticulas = (n: string) =>
  n
    .split(" ")
    .filter((p) => !PARTICULAS.has(p))
    .join(" ");

function pedacos<T>(lista: T[], tamanho: number) {
  const saida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) saida.push(lista.slice(i, i + tamanho));
  return saida;
}

export async function importarPlanilhaRh(_prev: EstadoImportacaoRh, fd: FormData): Promise<EstadoImportacaoRh> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "rh") return { erro: "Sem permissão para importar." };
  const competencia = String(fd.get("competencia") ?? "");
  if (!competenciaValida(competencia)) return { erro: "Escolha a competência (mês) da planilha." };
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da planilha do RH (.xlsx)." };
  if (arquivo.size > 20 * 1024 * 1024) return { erro: "Arquivo grande demais (máx. 20 MB)." };
  if (!/\.xlsx?$/i.test(arquivo.name)) return { erro: "Use a planilha em Excel (.xlsx). No Google Planilhas: Arquivo → Fazer download → Microsoft Excel." };
  const gravar = fd.get("etapa") === "gravar";
  const lancarQuebraFarmaceutico = fd.get("quebra_farmaceuticos") === "on";

  let leitura;
  try {
    leitura = lerPlanilhaRh(Buffer.from(await arquivo.arrayBuffer()), competencia);
  } catch {
    return { erro: "Não foi possível ler o arquivo. Confira se é a planilha do RH em .xlsx." };
  }
  if (leitura.abas.length === 0) {
    return { erro: `Nenhuma aba de ${rotuloCompetencia(competencia)} no arquivo. O nome da aba precisa ter o mês e o ano, como "VARELA ${competencia.slice(5)}${competencia.slice(0, 4)}".${leitura.abasIgnoradas.length ? ` Ignoradas: ${leitura.abasIgnoradas.join(", ")}.` : ""}` };
  }

  const supabase = await createClient();
  const data = competenciaParaData(competencia);
  const [eventos, funcionarios, existentes, obsExistentes] = await Promise.all([
    carregarEventos(supabase),
    rpcPaginado((a, b) => supabase.from("employees").select("id, nome, cargo, branch_id, status, data_admissao, data_desligamento").order("id").range(a, b)),
    rpcPaginado((a, b) => supabase.from("folha_lancamentos").select("employee_id, evento_id, valor").eq("competencia", data).order("id").range(a, b)),
    rpcPaginado((a, b) => supabase.from("folha_observacoes").select("employee_id, texto, pendente").eq("competencia", data).order("employee_id").range(a, b)),
  ]);
  const eventoPorChave = new Map(eventos.map((e) => [e.chave, e]));
  const valorExistente = new Map(existentes.map((l) => [`${l.employee_id}|${l.evento_id}`, Number(l.valor)]));
  const obsExistente = new Map(obsExistentes.map((o) => [o.employee_id, o]));

  // índice de nomes do cadastro
  type Emp = (typeof funcionarios)[number];
  const porNome = new Map<string, Emp[]>();
  const porNomeCurto = new Map<string, Emp[]>();
  const porPrimeiroNome = new Map<string, Emp[]>();
  for (const e of funcionarios) {
    if (!e.branch_id) continue;
    const n = normalizarNome(e.nome);
    porNome.set(n, [...(porNome.get(n) ?? []), e]);
    const c = semParticulas(n);
    porNomeCurto.set(c, [...(porNomeCurto.get(c) ?? []), e]);
    const p = n.split(" ")[0];
    porPrimeiroNome.set(p, [...(porPrimeiroNome.get(p) ?? []), e]);
  }
  const escolher = (lista: Emp[] | undefined): Emp | "ambiguo" | null => {
    if (!lista?.length) return null;
    if (lista.length === 1) return lista[0];
    const ativos = lista.filter((e) => ativoNaCompetencia({ status: String(e.status), data_admissao: e.data_admissao, data_desligamento: e.data_desligamento }, competencia));
    return ativos.length === 1 ? ativos[0] : "ambiguo";
  };
  const naoEncontrados = new Map<string, Ref>();
  const ambiguos = new Map<string, Ref>();
  const parecidos = new Map<string, { planilha: string; cadastro: string }>();
  const casar = (nome: string, aba: string, linha: number): Emp | null => {
    const n = normalizarNome(nome);
    let r = escolher(porNome.get(n)) ?? escolher(porNomeCurto.get(semParticulas(n)));
    if (!r) {
      // erro de digitação ("SOUZA" × "SOUSA"): mesmo primeiro nome e até 2 letras de diferença
      const candidatos = (porPrimeiroNome.get(n.split(" ")[0]) ?? []).filter((e) => distanciaNomes(normalizarNome(e.nome), n) <= 2);
      r = escolher(candidatos);
      if (r && r !== "ambiguo") parecidos.set(n, { planilha: nome, cadastro: r.nome });
    }
    if (r === "ambiguo") {
      ambiguos.set(n, { nome, aba, linha });
      return null;
    }
    if (!r) naoEncontrados.set(n, { nome, aba, linha });
    return r;
  };

  const novosValores = new Map<string, { emp: Emp; eventoId: string; eventoNome: string; valor: number }>();
  const partesObs = new Map<string, { texto: string; pendente: boolean }[]>();
  const addObs = (empId: string, texto: string, pendente: boolean) => partesObs.set(empId, [...(partesObs.get(empId) ?? []), { texto, pendente }]);
  const avisos: AnaliseRh["avisos"] = [];
  const duplicados: AnaliseRh["duplicados"] = [];
  const quebraFarmaceuticos: AnaliseRh["quebraFarmaceuticos"] = [];
  const foraDaPlanilha = new Map<string, number>();
  const encontrados = new Set<string>();

  for (const v of leitura.valores) {
    const emp = casar(v.nome, v.aba, v.linha);
    if (!emp) continue;
    encontrados.add(emp.id);
    const ev = eventoPorChave.get(v.chave);
    if (!ev || !ev.ativo) continue;
    const valorTxt = formatarValorGrade(v.valor);
    if (v.chave === "quebra_caixa" && !lancarQuebraFarmaceutico && ehFarmaceutico(emp.cargo)) {
      quebraFarmaceuticos.push({ nome: emp.nome, valor: valorTxt });
      addObs(emp.id, `Quebra de caixa de R$ ${valorTxt} na planilha do RH não lançada (farmacêutico)`, false);
      continue;
    }
    const chave = `${emp.id}|${ev.id}`;
    if (novosValores.has(chave)) {
      duplicados.push({ nome: emp.nome, evento: ev.nome });
      addObs(emp.id, `${ev.nome}: aparece mais de uma vez na planilha do RH (ficou o primeiro valor, ${formatarValorGrade(novosValores.get(chave)!.valor)}; o outro era "${v.original}")`, true);
      continue;
    }
    novosValores.set(chave, { emp, eventoId: ev.id, eventoNome: ev.nome, valor: v.valor });
    if (!ev.naPlanilha || ev.codigo === null) foraDaPlanilha.set(ev.nome, (foraDaPlanilha.get(ev.nome) ?? 0) + 1);
    if (v.aviso) {
      avisos.push({ nome: emp.nome, evento: ev.nome, original: v.original, lido: valorTxt, aviso: v.aviso });
      addObs(emp.id, `Conferir ${ev.nome}: ${v.aviso}`, true);
    }
  }
  for (const o of leitura.observacoes) {
    const emp = casar(o.nome, o.aba, o.linha);
    if (!emp) continue;
    encontrados.add(emp.id);
    addObs(emp.id, o.texto, o.pendente);
  }

  let novos = 0;
  let alterados = 0;
  let iguais = 0;
  const alteracoes: AnaliseRh["alteracoes"] = [];
  const porEvento = new Map<string, number>();
  const aGravar: { emp: Emp; eventoId: string; valor: number }[] = [];
  for (const [chave, n] of novosValores) {
    porEvento.set(n.eventoNome, (porEvento.get(n.eventoNome) ?? 0) + 1);
    const antes = valorExistente.get(chave);
    if (antes === undefined) novos++;
    else if (Math.round(antes * 100) === Math.round(n.valor * 100)) {
      iguais++;
      continue;
    } else {
      alterados++;
      if (alteracoes.length < 100) alteracoes.push({ nome: n.emp.nome, evento: n.eventoNome, antes: formatarValorGrade(antes), depois: formatarValorGrade(n.valor) });
    }
    aGravar.push(n);
  }

  // observações: acrescenta ao texto existente só o que ainda não está lá
  const obsGravar: { competencia: string; employee_id: string; texto: string; pendente: boolean; updated_by: string }[] = [];
  for (const [empId, partes] of partesObs) {
    const atual = obsExistente.get(empId);
    const textoAtual = atual?.texto ?? "";
    const novas = [...new Set(partes.map((p) => p.texto))].filter((t) => !textoAtual.includes(t));
    if (!novas.length) continue;
    const texto = [textoAtual, ...novas].filter(Boolean).join(" · ").slice(0, 2000);
    const pendente = (atual?.pendente ?? false) || partes.some((p) => p.pendente && novas.includes(p.texto));
    obsGravar.push({ competencia: data, employee_id: empId, texto, pendente, updated_by: sessao.id });
  }

  const analise: AnaliseRh = {
    competencia,
    arquivo: arquivo.name,
    abas: leitura.abas,
    abasIgnoradas: leitura.abasIgnoradas,
    encontrados: encontrados.size,
    naoEncontrados: [...naoEncontrados.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    ambiguos: [...ambiguos.values()],
    novos,
    alterados,
    iguais,
    porEvento: [...porEvento.entries()].map(([nome, qtd]) => ({ nome, qtd })),
    avisos,
    alteracoes,
    foraDaPlanilha: [...foraDaPlanilha.entries()].map(([evento, qtd]) => ({ evento, qtd })),
    quebraFarmaceuticos,
    duplicados,
    parecidos: [...parecidos.values()],
    quebraFarmaceuticosLancada: lancarQuebraFarmaceutico,
    observacoes: obsGravar.length,
  };
  if (!gravar) return { analise };

  const linhas = aGravar.map((n) => ({
    competencia: data,
    employee_id: n.emp.id,
    evento_id: n.eventoId,
    branch_id: n.emp.branch_id!,
    valor: n.valor,
    origem: "importacao",
    updated_by: sessao.id,
  }));
  for (const parte of pedacos(linhas, 500)) {
    const { error } = await supabase.from("folha_lancamentos").upsert(parte, { onConflict: "competencia,employee_id,evento_id" });
    if (error) return { erro: `Não foi possível gravar: ${error.message}`, analise };
  }
  const porBranch = new Map<string, Set<string>>();
  for (const l of linhas) porBranch.set(l.branch_id, (porBranch.get(l.branch_id) ?? new Set()).add(l.employee_id));
  for (const [branchId, emps] of porBranch) {
    for (const parte of pedacos([...emps], 300)) {
      const { error } = await supabase.from("folha_lancamentos").update({ branch_id: branchId }).eq("competencia", data).in("employee_id", parte).neq("branch_id", branchId);
      if (error) return { erro: error.message, analise };
    }
  }
  for (const parte of pedacos(obsGravar, 500)) {
    const { error } = await supabase.from("folha_observacoes").upsert(parte, { onConflict: "competencia,employee_id" });
    if (error) return { erro: `Valores gravados, mas as observações falharam: ${error.message}`, analise };
  }
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "importar",
    entidade: "folha_lancamentos",
    novo: { competencia, arquivo: arquivo.name, abas: leitura.abas.map((a) => a.nome), novos, alterados, iguais, observacoes: obsGravar.length, nao_encontrados: naoEncontrados.size },
  });
  revalidatePath("/rh/lancamentos");
  return { analise, gravado: { valores: linhas.length, observacoes: obsGravar.length } };
}
