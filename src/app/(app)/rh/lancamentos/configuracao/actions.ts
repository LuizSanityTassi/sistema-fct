"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { carregarEventos } from "@/lib/data/lancamentos-folha";
import { normalizarNome } from "@/lib/rh/lancamentos";
import { lerPlanilhaContabilidade } from "@/lib/rh/planilha-contabilidade";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export type EstadoConfig = { erro?: string; ok?: string };

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function inteiro(v: string, max: number): number | null | "invalido" {
  if (!v) return null;
  if (!/^\d+$/.test(v)) return "invalido";
  const n = Number(v);
  return n > 0 && n <= max ? n : "invalido";
}

async function exigirRh() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "rh" ? sessao : null;
}

/** Códigos, nomes, ordem e uso na planilha dos eventos; também cria um evento novo. */
export async function salvarEventos(_prev: EstadoConfig, fd: FormData): Promise<EstadoConfig> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Sem permissão." };
  const supabase = await createClient();
  const atuais = await carregarEventos(supabase);

  const propostos = atuais.map((e) => {
    const codigo = inteiro(texto(fd, `codigo_${e.id}`), 99_999);
    const ordem = inteiro(texto(fd, `ordem_${e.id}`), 9_999);
    return {
      atual: e,
      codigo,
      nome: texto(fd, `nome_${e.id}`),
      ordem,
      unidade: texto(fd, `unidade_${e.id}`) === "horas" ? "horas" : "valor",
      naPlanilha: fd.get(`planilha_${e.id}`) === "on",
      ativo: fd.get(`ativo_${e.id}`) === "on",
    };
  });
  const novoNome = texto(fd, "novo_nome");
  const novoCodigo = inteiro(texto(fd, "novo_codigo"), 99_999);
  const novoOrdem = inteiro(texto(fd, "novo_ordem"), 9_999);

  for (const p of propostos) {
    if (!p.nome || p.nome.length > 60) return { erro: `Nome inválido no evento “${p.atual.nome}” (1 a 60 caracteres).` };
    if (p.codigo === "invalido") return { erro: `Código inválido em “${p.nome}” (número inteiro positivo).` };
    if (p.ordem === "invalido") return { erro: `Ordem inválida em “${p.nome}”.` };
    if (p.naPlanilha && p.codigo === null) return { erro: `“${p.nome}” só pode ir para a planilha com o código da Domínio.` };
  }
  if (novoNome && (novoNome.length > 60 || novoCodigo === "invalido" || novoOrdem === "invalido")) return { erro: "Confira o nome, o código e a ordem do evento novo." };
  const codigos = [...propostos.map((p) => p.codigo), novoNome ? novoCodigo : null].filter((c): c is number => typeof c === "number");
  const repetido = codigos.find((c, i) => codigos.indexOf(c) !== i);
  if (repetido) return { erro: `O código ${repetido} está em mais de um evento.` };

  // dois passos para não esbarrar no código único quando dois eventos trocam de código
  const mudados = propostos.filter(
    (p) => p.codigo !== p.atual.codigo || p.nome !== p.atual.nome || (p.ordem ?? 0) !== p.atual.ordem || p.unidade !== p.atual.unidade || p.naPlanilha !== p.atual.naPlanilha || p.ativo !== p.atual.ativo,
  );
  const trocaCodigo = mudados.filter((p) => p.codigo !== p.atual.codigo && p.atual.codigo !== null);
  for (const p of trocaCodigo) {
    const { error } = await supabase.from("folha_eventos").update({ codigo: null, na_planilha: false }).eq("id", p.atual.id);
    if (error) return { erro: error.message };
  }
  for (const p of mudados) {
    const { error } = await supabase
      .from("folha_eventos")
      .update({ codigo: p.codigo as number | null, nome: p.nome, ordem: (p.ordem as number | null) ?? 0, unidade: p.unidade, na_planilha: p.naPlanilha, ativo: p.ativo })
      .eq("id", p.atual.id);
    if (error) return { erro: `Não foi possível salvar “${p.nome}”: ${error.message}` };
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "folha_eventos",
      registroId: p.atual.id,
      anterior: { codigo: p.atual.codigo, nome: p.atual.nome, ordem: p.atual.ordem, unidade: p.atual.unidade, na_planilha: p.atual.naPlanilha, ativo: p.atual.ativo },
      novo: { codigo: p.codigo, nome: p.nome, ordem: p.ordem, unidade: p.unidade, na_planilha: p.naPlanilha, ativo: p.ativo },
    });
  }
  if (novoNome) {
    const base = normalizarNome(novoNome).toLowerCase().replace(/\s+/g, "_").slice(0, 40) || "evento";
    const chave = atuais.some((e) => e.chave === base) ? `${base}_${Date.now().toString(36)}` : base;
    const { data, error } = await supabase
      .from("folha_eventos")
      .insert({ chave, nome: novoNome, codigo: novoCodigo as number | null, ordem: (novoOrdem as number | null) ?? 900, unidade: texto(fd, "novo_unidade") === "horas" ? "horas" : "valor", na_planilha: novoCodigo !== null })
      .select("id")
      .single();
    if (error) return { erro: `Não foi possível criar o evento: ${error.message}` };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "folha_eventos", registroId: data.id, novo: { nome: novoNome, codigo: novoCodigo } });
  }
  revalidatePath("/rh/lancamentos", "layout");
  const n = mudados.length + (novoNome ? 1 : 0);
  return { ok: n ? `${n} evento(s) salvo(s).` : "Nada mudou." };
}

/** Código da empresa na Domínio e razão social da planilha, por CNPJ. */
export async function salvarEmpresasDominio(_prev: EstadoConfig, fd: FormData): Promise<EstadoConfig> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Sem permissão." };
  const ids = fd.getAll("branch").map(String);
  if (ids.length > 500) return { erro: "Dados inválidos." };
  const supabase = await createClient();
  const { data: atuais, error } = await supabase.from("folha_empresas_dominio").select("branch_id, codigo_dominio, razao_social").in("branch_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
  if (error) return { erro: error.message };
  const porId = new Map(atuais.map((a) => [a.branch_id, a]));

  const mudancas: { branch_id: string; codigo_dominio: number | null; razao_social: string | null; updated_by: string }[] = [];
  for (const id of ids) {
    const codigo = inteiro(texto(fd, `codigo_${id}`), 9_999_999);
    const razao = texto(fd, `razao_${id}`).toUpperCase() || null;
    if (codigo === "invalido") return { erro: "Código da Domínio inválido: use só números." };
    if (razao && razao.length > 150) return { erro: "Razão social com mais de 150 caracteres." };
    const atual = porId.get(id);
    if ((atual?.codigo_dominio ?? null) === codigo && (atual?.razao_social ?? null) === razao) continue;
    mudancas.push({ branch_id: id, codigo_dominio: codigo, razao_social: razao, updated_by: sessao.id });
  }
  if (!mudancas.length) return { ok: "Nada mudou." };
  const { error: e2 } = await supabase.from("folha_empresas_dominio").upsert(mudancas, { onConflict: "branch_id" });
  if (e2) return { erro: `Não foi possível salvar: ${e2.message}` };
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "editar",
    entidade: "folha_empresas_dominio",
    novo: { alteradas: mudancas.map((m) => ({ branch_id: m.branch_id, codigo_dominio: m.codigo_dominio, razao_social: m.razao_social })) },
  });
  revalidatePath("/rh/lancamentos", "layout");
  return { ok: `${mudancas.length} CNPJ(s) salvo(s).` };
}

// ---------- códigos da Domínio pelas planilhas que a contabilidade devolve ----------

export type ResultadoPlanilhaCodigos = {
  arquivo: string;
  filial: string | null;
  erro?: string;
  empresa?: { codigo: number | null; antes: number | null };
  colunas?: number;
  /** colunas que a contabilidade tem e o sistema não usa (saem vazias) */
  semEvento?: string[];
  /** quantas colunas mudaram (código, rótulo, ordem ou evento) em relação ao que estava gravado */
  mudancas?: number;
  funcionarios?: { iguais: number; atualizados: string[]; outraFilial: string[]; naoCadastrados: string[] };
};
export type EstadoCodigos = { erro?: string; resultados?: ResultadoPlanilhaCodigos[] };

const MAX_PLANILHAS = 80;
const MAX_TAMANHO = 2 * 1024 * 1024;

/**
 * Lê as planilhas "RELAÇÃO DE VALORES PARA FOLHA DE PAGAMENTO" da contabilidade (uma por CNPJ) e deixa os CÓDIGOS do
 * sistema iguais aos delas, filial por filial: colunas de evento (rótulo, código e ordem), código da empresa e código
 * do funcionário. Os valores das planilhas são ignorados; funcionário que está em outra filial no sistema fica onde
 * está (movimentação já feita) e quem não está no cadastro só é listado.
 */
export async function atualizarCodigosDaContabilidade(_prev: EstadoCodigos, fd: FormData): Promise<EstadoCodigos> {
  const sessao = await exigirRh();
  if (!sessao) return { erro: "Sem permissão." };
  const arquivos = fd.getAll("planilhas").filter((f): f is File => f instanceof File && f.size > 0);
  if (!arquivos.length) return { erro: "Escolha as planilhas da contabilidade (.xls ou .xlsx)." };
  if (arquivos.length > MAX_PLANILHAS) return { erro: `Envie até ${MAX_PLANILHAS} planilhas por vez.` };

  const supabase = await createClient();
  const [{ data: branches, error: e1 }, { data: empresas, error: e2 }, eventos, { data: atuais, error: e3 }, { data: pessoas, error: e4 }] = await Promise.all([
    supabase.from("branches").select("id, codigo, cnpj"),
    supabase.from("folha_empresas_dominio").select("branch_id, codigo_dominio"),
    carregarEventos(supabase),
    supabase.from("folha_eventos_filial").select("branch_id, coluna, rotulo, codigo, evento_id"),
    supabase.from("employees").select("id, nome, matricula, branch_id").neq("status", "desligado"),
  ]);
  const erroBanco = e1 ?? e2 ?? e3 ?? e4;
  if (erroBanco || !branches || !empresas || !atuais || !pessoas) return { erro: erroBanco?.message ?? "Não consegui ler os cadastros." };
  const porCnpj = new Map(branches.filter((b) => b.cnpj).map((b) => [String(b.cnpj).replace(/\D/g, ""), b]));
  const porId = new Map(branches.map((b) => [b.id, b]));
  const codigoDe = new Map(empresas.map((e) => [e.branch_id, e.codigo_dominio]));
  const porCodigoDominio = new Map(empresas.filter((e) => e.codigo_dominio).map((e) => [e.codigo_dominio, e.branch_id]));
  const eventoPorChave = new Map(eventos.map((e) => [e.chave, e.id]));
  const pessoasPorNome = new Map<string, typeof pessoas>();
  for (const p of pessoas) pessoasPorNome.set(normalizarNome(p.nome), [...(pessoasPorNome.get(normalizarNome(p.nome)) ?? []), p]);

  const resultados: ResultadoPlanilhaCodigos[] = [];
  const filiais: { branch_id: string; arquivo: string; codigo_dominio: number | null; colunas: { coluna: number; rotulo: string; codigo: number; evento_id: string | null }[] }[] = [];
  const matriculas: { id: string; nome: string; antes: string | null; depois: string }[] = [];
  const vistas = new Set<string>();
  for (const f of arquivos) {
    const r: ResultadoPlanilhaCodigos = { arquivo: f.name, filial: null };
    resultados.push(r);
    if (!/\.xlsx?$/i.test(f.name) || f.size > MAX_TAMANHO) {
      r.erro = "envie a planilha do Excel (.xls ou .xlsx) de até 2 MB";
      continue;
    }
    let p: ReturnType<typeof lerPlanilhaContabilidade>;
    try {
      const wb = XLSX.read(Buffer.from(await f.arrayBuffer()), { type: "buffer" });
      p = lerPlanilhaContabilidade(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null, blankrows: true }));
    } catch {
      r.erro = "não consegui ler a planilha";
      continue;
    }
    if (!p.colunas.length) {
      r.erro = "não achei as colunas de evento (é a “Relação de valores para folha de pagamento”?)";
      continue;
    }
    // a filial pelo código da empresa na Domínio (a planilha da RFA de 09/2026 veio com o CNPJ errado) ou pelo CNPJ
    const pelaEmpresa = p.codigoEmpresa ? porCodigoDominio.get(p.codigoEmpresa) : undefined;
    const peloCnpj = p.cnpj ? porCnpj.get(p.cnpj)?.id : undefined;
    if (pelaEmpresa && peloCnpj && pelaEmpresa !== peloCnpj) {
      r.erro = `o código da empresa (${p.codigoEmpresa}) é de ${porId.get(pelaEmpresa)?.codigo} e o CNPJ é de ${porId.get(peloCnpj)?.codigo}: confira a planilha`;
      continue;
    }
    const branchId = pelaEmpresa ?? peloCnpj;
    if (!branchId) {
      r.erro = `nenhuma filial com o código ${p.codigoEmpresa ?? "—"} nem com o CNPJ ${p.cnpj ?? "—"}`;
      continue;
    }
    if (vistas.has(branchId)) {
      r.erro = `${porId.get(branchId)?.codigo} já veio em outra planilha desta leva`;
      continue;
    }
    vistas.add(branchId);
    r.filial = porId.get(branchId)?.codigo ?? null;

    const usados = new Set<string>();
    const colunas = p.colunas.map((c) => {
      let evento = c.chave ? (eventoPorChave.get(c.chave) ?? null) : null;
      if (evento && usados.has(evento)) evento = null; // o mesmo evento em duas colunas: a 2ª sai vazia
      if (evento) usados.add(evento);
      return { coluna: c.coluna, rotulo: c.rotulo, codigo: c.codigo, evento_id: evento };
    });
    const antes = atuais.filter((a) => a.branch_id === branchId);
    r.colunas = colunas.length;
    r.semEvento = colunas.filter((c) => !c.evento_id).map((c) => `${c.rotulo} (${c.codigo})`);
    r.mudancas =
      Math.max(0, antes.length - colunas.length) +
      colunas.filter((c) => {
        const a = antes.find((x) => x.coluna === c.coluna);
        return !a || a.rotulo !== c.rotulo || a.codigo !== c.codigo || a.evento_id !== c.evento_id;
      }).length;
    r.empresa = { codigo: p.codigoEmpresa, antes: codigoDe.get(branchId) ?? null };
    filiais.push({ branch_id: branchId, arquivo: f.name, codigo_dominio: p.codigoEmpresa, colunas });

    // código de cada funcionário: só de quem está nesta filial no sistema (quem foi movimentado fica onde está)
    const func = { iguais: 0, atualizados: [] as string[], outraFilial: [] as string[], naoCadastrados: [] as string[] };
    for (const pf of p.funcionarios) {
      const achados = pessoasPorNome.get(normalizarNome(pf.nome)) ?? [];
      const aqui = achados.find((x) => x.branch_id === branchId);
      if (aqui) {
        if (!pf.codigo || String(aqui.matricula ?? "") === pf.codigo) func.iguais++;
        else {
          func.atualizados.push(`${pf.nome} (${aqui.matricula ?? "sem código"} → ${pf.codigo})`);
          matriculas.push({ id: aqui.id, nome: aqui.nome, antes: aqui.matricula, depois: pf.codigo });
        }
      } else if (achados.length) func.outraFilial.push(`${pf.nome} (está na ${achados.map((x) => porId.get(x.branch_id ?? "")?.codigo ?? "?").join(", ")})`);
      else func.naoCadastrados.push(`${pf.nome} (código ${pf.codigo || "—"})`);
    }
    r.funcionarios = func;
  }
  if (!filiais.length) return { erro: "Nenhuma planilha pôde ser usada.", resultados };

  const { error: eRpc } = await supabase.rpc("folha_codigos_dominio_importar", { p_filiais: filiais as unknown as Json });
  if (eRpc) return { erro: `Não foi possível gravar os códigos: ${eRpc.message}`, resultados };
  for (const m of matriculas) {
    const { error } = await supabase.from("employees").update({ matricula: m.depois }).eq("id", m.id);
    if (error) return { erro: `Códigos das filiais gravados, mas não consegui trocar o código de ${m.nome}: ${error.message}`, resultados };
    await registrarAuditoria(supabase, {
      userId: sessao.id,
      acao: "editar",
      entidade: "employees",
      registroId: m.id,
      anterior: { matricula: m.antes },
      novo: { matricula: m.depois, motivo: "código da Domínio (planilha da contabilidade)" },
    });
  }
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "importar",
    entidade: "folha_eventos_filial",
    novo: { planilhas: filiais.map((f) => ({ filial: porId.get(f.branch_id)?.codigo, arquivo: f.arquivo, codigo_dominio: f.codigo_dominio, colunas: f.colunas.length })), matriculas: matriculas.length },
  });
  revalidatePath("/rh/lancamentos", "layout");
  return { resultados };
}
