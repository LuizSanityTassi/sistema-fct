"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { coletarDiferencas, filiaisDoTrier } from "@/lib/caixa/coleta";
import type { PedidoCaixaTrier } from "@/lib/conciliacao/trier-robo";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 7;

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};

async function exigirFinanceiro() {
  const sessao = await getSessao();
  return sessao.papel === "admin" || sessao.papel === "financeiro" ? sessao : null;
}

const revalidar = () => {
  revalidatePath("/financeiro/diferenca-caixa");
  revalidatePath("/caixa");
};

function diasEntre(de: string, ate: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${de}T12:00:00Z`); t <= Date.parse(`${ate}T12:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** `lidas`, `caixas`, `quebras` e `totalErros` somam todas as rodadas da busca; `erros` e `rodada` são só desta rodada. */
export type EstadoBusca = { erro?: string; inicio?: string; lidas?: number; caixas?: number; quebras?: number; totalErros?: number; erros?: string[]; rodada?: number; faltam?: number; total?: number; fim?: boolean; nadaNovo?: boolean };

/**
 * Uma rodada do robô (até ~4 min): busca no Trier o Relatório de Diferenças de Caixa de cada filial × dia que ainda
 * não foi lido nesta busca. A tela chama de novo sozinha enquanto faltar filial (`inicio` marca a busca).
 */
export async function buscarDoTrier(_prev: EstadoBusca, fd: FormData): Promise<EstadoBusca> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro e o administrador buscam os caixas no Trier." };
  const de = texto(fd, "de");
  const ate = texto(fd, "ate");
  if (!DIA.test(de) || !DIA.test(ate) || de > ate) return { erro: "Confira as datas." };
  const dias = diasEntre(de, ate);
  if (dias.length > MAX_DIAS) return { erro: `Busque no máximo ${MAX_DIAS} dias de cada vez.` };
  const filialEscolhida = texto(fd, "filial");
  const forcar = texto(fd, "forcar") === "1";
  const inicioTexto = texto(fd, "inicio");
  const inicio = inicioTexto && !Number.isNaN(Date.parse(inicioTexto)) ? new Date(inicioTexto).toISOString() : new Date().toISOString();
  const inicioMs = Date.parse(inicio);
  const acumulado = (nome: string) => Math.max(0, Number.parseInt(texto(fd, nome), 10) || 0);

  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return { erro: "O robô do Trier ainda não tem usuário e senha (Administração → Integrações)." };
  const todas = await filiaisDoTrier(supabase);
  const filiais = UUID.test(filialEscolhida) ? todas.filter((f) => f.id === filialEscolhida) : todas;
  if (!filiais.length) return { erro: "Nenhuma loja do Trier no cadastro de filiais (códigos F001, F002…)." };

  // o que já foi lido: nesta busca (qualquer resultado) ou antes (com sucesso, se não for para buscar de novo)
  const { data: lidas } = await supabase.from("caixa_coletas").select("dia, branch_id, status, coletado_em").gte("dia", de).lte("dia", ate);
  const pular = new Set((lidas ?? []).filter((c) => Date.parse(c.coletado_em) >= inicioMs || (!forcar && c.status === "ok")).map((c) => `${c.dia}|${c.branch_id}`));
  const todosPedidos: PedidoCaixaTrier[] = dias.flatMap((dia) => filiais.map((f) => ({ dia, filial: f.filial })));
  const idDaFilial = new Map(filiais.map((f) => [f.filial, f.id]));
  const pedidos = todosPedidos.filter((p) => !pular.has(`${p.dia}|${idDaFilial.get(p.filial)}`));
  const base = { inicio, lidas: acumulado("acc_lidas"), caixas: acumulado("acc_caixas"), quebras: acumulado("acc_quebras"), totalErros: acumulado("acc_erros"), total: todosPedidos.length };
  if (!pedidos.length) return { ...base, erros: [], rodada: 0, faltam: 0, fim: true, nadaNovo: !inicioTexto };

  let r;
  try {
    r = await coletarDiferencas(supabase, cred, pedidos, filiais, 255_000);
  } catch (e) {
    return { erro: `O robô não conseguiu ler o Trier: ${e instanceof Error ? e.message : String(e)}`, inicio };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "importar", entidade: "caixa_diferencas", novo: { de, ate, filiais: filiais.length, lidas: r.lidas, caixas: r.caixas, quebras: r.quebras, erros: r.erros.length } });
  revalidar();
  return {
    ...base,
    lidas: base.lidas + r.lidas,
    caixas: base.caixas + r.caixas,
    quebras: base.quebras + r.quebras,
    totalErros: base.totalErros + r.erros.length,
    erros: r.erros.map((e) => `${e.filial} ${e.dia.split("-").reverse().join("/")}: ${e.erro}`),
    rodada: r.lidas + r.erros.length,
    faltam: r.restantes.length,
    fim: r.restantes.length === 0,
  };
}

export type EstadoDecisao = { erro?: string; ok?: string };

/** Financeiro decide a quebra: mantém o desconto, abona (sai da folha) ou reabre para nova justificativa. */
export async function decidirQuebra(id: string, _prev: EstadoDecisao, fd: FormData): Promise<EstadoDecisao> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro decide as quebras." };
  if (!UUID.test(id)) return { erro: "Caixa inválido." };
  const decisao = texto(fd, "decisao");
  const obs = texto(fd, "obs").slice(0, 2000);
  if (!["mantida", "abonada", "pendente"].includes(decisao)) return { erro: "Escolha a decisão." };
  if (decisao === "abonada" && obs.length < 5) return { erro: "Para abonar, escreva o motivo." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("caixa_diferencas").select("id, classe, andamento").eq("id", id).maybeSingle();
  if (!atual || atual.classe !== "quebra") return { erro: "Quebra não encontrada." };
  const patch =
    decisao === "pendente"
      ? { andamento: "pendente", decisao_obs: obs || null, decidida_por: null, decidida_por_nome: null, decidida_em: null }
      : { andamento: decisao, decisao_obs: obs || null, decidida_por: sessao.id, decidida_por_nome: sessao.nome, decidida_em: new Date().toISOString() };
  const { error } = await supabase.from("caixa_diferencas").update(patch).eq("id", id);
  if (error) return { erro: `Não consegui salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_diferencas", registroId: id, anterior: { andamento: atual.andamento }, novo: { andamento: decisao } });
  revalidar();
  revalidatePath(`/financeiro/diferenca-caixa/${id}`);
  return { ok: decisao === "abonada" ? "Quebra abonada: saiu do desconto da folha." : decisao === "mantida" ? "Desconto mantido na folha." : "Reaberta: volta a aguardar justificativa." };
}

export type EstadoVinculo = { erro?: string; ok?: string };

/** Liga (ou desliga) o operador do Trier a um funcionário. As quebras ainda não decididas passam para ele. */
export async function vincularOperador(cod: number, _prev: EstadoVinculo, fd: FormData): Promise<EstadoVinculo> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro e o administrador ligam operadores." };
  if (!Number.isInteger(cod) || cod <= 0) return { erro: "Operador inválido." };
  const emp = texto(fd, "employee_id");
  if (emp && !UUID.test(emp)) return { erro: "Funcionário inválido." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("caixa_operadores").select("employee_id").eq("cod_operador", cod).maybeSingle();
  const { error } = await supabase
    .from("caixa_operadores")
    .update({ employee_id: emp || null, vinculado_por: sessao.id, vinculado_em: new Date().toISOString() })
    .eq("cod_operador", cod);
  if (error) return { erro: `Não consegui salvar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_operadores", anterior: { cod_operador: cod, employee_id: atual?.employee_id ?? null }, novo: { cod_operador: cod, employee_id: emp || null } });
  revalidar();
  revalidatePath("/financeiro/diferenca-caixa/operadores");
  return { ok: emp ? "Ligado." : "Desligado." };
}

// ---------- quebra manual e gestores ----------

export type EstadoManual = { erro?: string; ok?: string; id?: string; erros?: Record<string, string> };

/** Lançamento à mão pelo financeiro (vale mesmo abaixo de R$ 2,00): entra no desconto da folha e vai para o gestor. */
export async function lancarQuebraManual(_prev: EstadoManual, fd: FormData): Promise<EstadoManual> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro e o administrador lançam quebras." };
  const employeeId = texto(fd, "employee_id");
  const branchId = texto(fd, "branch_id");
  const dia = texto(fd, "dia");
  const tipo = texto(fd, "tipo");
  const descricao = texto(fd, "descricao").slice(0, 2000);
  const valorTexto = texto(fd, "valor").replace(/\s/g, "").replace(/^R\$/i, "");
  const normal = valorTexto.includes(",") ? valorTexto.replace(/\./g, "").replace(",", ".") : valorTexto;
  const valor = /^\d+(\.\d{1,2})?$/.test(normal) ? Number(normal) : Number.NaN;
  const erros: Record<string, string> = {};
  if (!UUID.test(employeeId)) erros.employee_id = "Escolha o colaborador.";
  if (!DIA.test(dia)) erros.dia = "Informe a data.";
  if (tipo !== "falta" && tipo !== "sobra") erros.tipo = "Falta ou sobra?";
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100_000) erros.valor = "Valor inválido (ex.: 15,40).";
  if (descricao.length < 5) erros.descricao = "Conte o motivo da quebra.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const supabase = await createClient();
  const { data: funcionarios, error: e0 } = await supabase.rpc("caixa_funcionarios");
  if (e0) return { erro: e0.message };
  const func = (funcionarios ?? []).find((f) => f.id === employeeId);
  if (!func) return { erro: "Colaborador não encontrado.", erros: { employee_id: "Colaborador não encontrado." } };
  if (/FARMAC[EÊ]UTIC/i.test(func.cargo ?? "")) return { erro: "Farmacêutico não tem quebra de caixa.", erros: { employee_id: "Farmacêutico não tem quebra de caixa." } };
  const loja = UUID.test(branchId) ? branchId : func.branch_id;
  const { data, error } = await supabase
    .from("caixa_diferencas")
    .insert({
      branch_id: loja,
      dia,
      nome_operador: func.nome,
      employee_id: func.id,
      informado: 0,
      diferenca: tipo === "falta" ? valor : -valor,
      origem: "manual",
      descricao,
      lancada_por: sessao.id,
      lancada_por_nome: sessao.nome,
    })
    .select("id")
    .single();
  if (error) return { erro: `Não consegui lançar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "caixa_diferencas", registroId: data.id, novo: { origem: "manual", dia, tipo, valor } });
  revalidar();
  return { ok: "Quebra lançada.", id: data.id };
}

/** Só a quebra lançada à mão pode ser excluída (lançada por engano); o desconto sai da folha. */
export async function excluirQuebraManual(id: string): Promise<EstadoDecisao> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro exclui quebras." };
  if (!UUID.test(id)) return { erro: "Quebra inválida." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("caixa_diferencas").select("id, origem, dia, diferenca, employee_id").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Quebra não encontrada." };
  if (atual.origem !== "manual") return { erro: "A quebra que veio do Trier não se exclui: abone, se for o caso." };
  const { error } = await supabase.from("caixa_diferencas").delete().eq("id", id);
  if (error) return { erro: `Não consegui excluir: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "caixa_diferencas", registroId: id, anterior: { origem: "manual", dia: atual.dia, diferenca: atual.diferenca } });
  revalidar();
  return { ok: "Quebra excluída." };
}

/** Troca o gestor que justifica uma quebra (ex.: gerente de férias, colaborador emprestado de outra loja). */
export async function moverGestorQuebra(id: string, _prev: EstadoDecisao, fd: FormData): Promise<EstadoDecisao> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro troca o gestor." };
  if (!UUID.test(id)) return { erro: "Quebra inválida." };
  const gestor = texto(fd, "gestor_id");
  if (gestor && !UUID.test(gestor)) return { erro: "Gestor inválido." };
  const supabase = await createClient();
  const { data: atual } = await supabase.from("caixa_diferencas").select("gestor_id").eq("id", id).maybeSingle();
  if (!atual) return { erro: "Quebra não encontrada." };
  const { error } = await supabase.from("caixa_diferencas").update({ gestor_id: gestor || null }).eq("id", id);
  if (error) return { erro: `Não consegui trocar: ${error.message}` };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_diferencas", registroId: id, anterior: { gestor_id: atual.gestor_id }, novo: { gestor_id: gestor || null } });
  revalidar();
  revalidatePath(`/financeiro/diferenca-caixa/${id}`);
  return { ok: gestor ? "Gestor trocado: a quebra aparece para ele justificar." : "Sem gestor: fica com o gerente da loja." };
}

/** Define (ou troca) o gestor das quebras de uma loja; opcionalmente leva junto as quebras em aberto da loja. */
export async function definirGestorLoja(branchId: string, _prev: EstadoDecisao, fd: FormData): Promise<EstadoDecisao> {
  const sessao = await exigirFinanceiro();
  if (!sessao) return { erro: "Só o financeiro define gestores." };
  if (!UUID.test(branchId)) return { erro: "Loja inválida." };
  const gestor = texto(fd, "gestor_id");
  if (gestor && !UUID.test(gestor)) return { erro: "Gestor inválido." };
  const moverAbertas = texto(fd, "mover") === "1";
  const supabase = await createClient();
  const { data: antes } = await supabase.from("caixa_gestores").select("profile_id").eq("branch_id", branchId).maybeSingle();
  const { error } = gestor
    ? await supabase.from("caixa_gestores").upsert({ branch_id: branchId, profile_id: gestor, definido_por: sessao.id, definido_em: new Date().toISOString() }, { onConflict: "branch_id" })
    : await supabase.from("caixa_gestores").delete().eq("branch_id", branchId);
  if (error) return { erro: `Não consegui salvar: ${error.message}` };
  let movidas = 0;
  if (moverAbertas) {
    const { data: abertas, error: e2 } = await supabase
      .from("caixa_diferencas")
      .update({ gestor_id: gestor || null })
      .eq("branch_id", branchId)
      .eq("classe", "quebra")
      .in("andamento", ["pendente", "justificada"])
      .select("id");
    if (e2) return { erro: `Gestor salvo, mas não consegui mover as quebras: ${e2.message}` };
    movidas = abertas?.length ?? 0;
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "caixa_gestores", registroId: branchId, anterior: { gestor: antes?.profile_id ?? null }, novo: { gestor: gestor || null, quebras_movidas: movidas } });
  revalidar();
  revalidatePath("/financeiro/diferenca-caixa/gestores");
  return { ok: `${gestor ? "Gestor salvo" : "Gestor removido"}${moverAbertas ? ` · ${movidas} quebra(s) em aberto passaram para ${gestor ? "ele" : "o gerente da loja"}` : ""}.` };
}
