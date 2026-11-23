"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { filiaisDaEscala, filialDaEscala, simulacao } from "@/lib/data/escalas";
import { REGIMES, ROTULO_GRUPO, ajustarTurno, ajustarVariosDias, ehFuncao, ehRegime, type Regime, grupoDoDia, type ModoAjuste, rotuloData, rotuloPeriodo, ehSituacao, erroFolgas, gerarOpcoes, horaValida, limiteSemanal, minutos, reanalisar, type AjusteTurno, type Funcao } from "@/lib/escalas/motor";
import { lerMesAno } from "@/lib/escalas/resumo";
import { podeAcessar } from "@/lib/nav";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROTA = "/escalas";

export type EstadoEscala = { erro?: string; erros?: Record<string, string>; ok?: string };

const texto = (fd: FormData, nome: string) => {
  const v = fd.get(nome);
  return typeof v === "string" ? v.trim() : "";
};
const semPermissao = (msg: string) => /row-level security|42501/i.test(msg);
const msgBanco = (msg: string) => (semPermissao(msg) ? "Você não tem acesso a essa filial." : msg.replace(/^.*?ERROR:\s*/, ""));

async function sessaoComAcesso() {
  const sessao = await getSessao();
  if (!podeAcessar(sessao.papel, ROTA, sessao.telasExtras, sessao.bloqueios)) throw new Error("Sem acesso às escalas.");
  return sessao;
}

/** Volta para a tela da opção (só caminhos do simulador). */
function voltaDe(fd: FormData, lote: string) {
  const v = texto(fd, "volta");
  return v.startsWith(`${ROTA}/simulacao/`) && !v.includes("//") ? v : `${ROTA}/simulacao/${lote}`;
}
const comMsg = (url: string, chave: "ok" | "erro", msg: string) => {
  const u = new URL(url, "http://x");
  u.searchParams.delete("ok");
  u.searchParams.delete("erro");
  u.searchParams.set(chave, msg.slice(0, 300));
  return `${u.pathname}${u.search}`;
};

/** Cargo do RH → função na escala. */
function funcaoDoCargo(cargo: string | null | undefined): Funcao {
  const c = (cargo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (c.includes("gerente") && c.includes("farmaceut")) return "gerente_farmaceutico";
  if (c.includes("farmaceut")) return "farmaceutico";
  if (c.includes("gerente")) return "gerente";
  if (c.includes("estoqu")) return "estoquista";
  if (c.includes("caixa") || c.includes("operador")) return "caixa";
  if (c.includes("motorista") || c.includes("entregador") || c.includes("motoboy")) return "motorista";
  if (c.includes("auditor")) return "auditor";
  if (c.includes("servicos gerais") || c.includes("limpeza") || c.includes("zelador")) return "servicos_gerais";
  if (c.includes("atendente") || c.includes("balconista") || c.includes("vendedor") || c.includes("perfumista")) return "atendente";
  return "outros";
}

// ---------------------------------------------------------------------------------------------------------------
// Filial
// ---------------------------------------------------------------------------------------------------------------

function lerFaixa(fd: FormData, prefixo: string, rotulo: string, erros: Record<string, string>, obrigatoria = false) {
  const abre = texto(fd, `${prefixo}_abre`);
  const fecha = texto(fd, `${prefixo}_fecha`);
  if (!abre && !fecha) {
    if (obrigatoria) erros[prefixo] = `Informe o horário de ${rotulo}.`;
    return { abre: null, fecha: null };
  }
  if (!horaValida(abre) || !horaValida(fecha)) {
    erros[prefixo] = `${rotulo}: informe abertura e fechamento (HH:MM).`;
    return { abre: null, fecha: null };
  }
  if (minutos(fecha) <= minutos(abre)) erros[prefixo] = `${rotulo}: o fechamento precisa ser depois da abertura.`;
  return { abre, fecha };
}

/** Horário de funcionamento, mínimo de farmacêuticos e dias de folga da filial. */
export async function salvarFilialEscala(_prev: EstadoEscala, fd: FormData): Promise<EstadoEscala> {
  const sessao = await sessaoComAcesso();
  const branch_id = texto(fd, "branch_id");
  if (!UUID.test(branch_id)) return { erro: "Filial inválida." };
  const erros: Record<string, string> = {};
  const semana = lerFaixa(fd, "semana", "segunda a sexta", erros, true);
  const sabado = lerFaixa(fd, "sabado", "sábado", erros);
  const domingo = lerFaixa(fd, "domingo", "domingo", erros);
  const min = Number(texto(fd, "min_farmaceuticos"));
  if (!Number.isInteger(min) || min < 0 || min > 9) erros.min_farmaceuticos = "De 0 a 9 farmacêuticos.";
  const folgas = [...new Set(fd.getAll("folgas").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  if (!folgas.length) erros.folgas = "Marque pelo menos um dia para as folgas.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };
  const atual = await filialDaEscala(branch_id);
  if (!atual) return { erro: "Filial não está na escala." };
  const cfg = {
    ...atual.config,
    horarios: {
      ...atual.config.horarios,
      seg: { abre: semana.abre!, fecha: semana.fecha! },
      ter: { abre: semana.abre!, fecha: semana.fecha! },
      qua: { abre: semana.abre!, fecha: semana.fecha! },
      qui: { abre: semana.abre!, fecha: semana.fecha! },
      sex: { abre: semana.abre!, fecha: semana.fecha! },
      sab: sabado.abre ? { abre: sabado.abre, fecha: sabado.fecha! } : null,
      dom: domingo.abre ? { abre: domingo.abre, fecha: domingo.fecha! } : null,
    },
  };
  const erroDias = erroFolgas(cfg, folgas);
  if (erroDias) return { erro: erroDias, erros: { folgas: erroDias } };

  const supabase = await createClient();
  const novo = {
    semana_abre: semana.abre,
    semana_fecha: semana.fecha,
    sabado_abre: sabado.abre,
    sabado_fecha: sabado.fecha,
    domingo_abre: domingo.abre,
    domingo_fecha: domingo.fecha,
    min_farmaceuticos: min,
    acordo_jornada_estendida: fd.get("acordo") === "on",
    folgas_permitidas: folgas,
    origem: "Ajustado no portal",
  };
  const { error } = await supabase.from("esc_filiais").update(novo).eq("branch_id", branch_id);
  if (error) return { erro: msgBanco(error.message) };
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "esc_filiais", registroId: branch_id, novo });
  revalidatePath(ROTA, "layout");
  return { ok: "Funcionamento da filial salvo." };
}

/** Coloca uma filial na escala e já traz a equipe do cadastro do RH (ativos, afastados e de férias). */
export async function incluirFilialEscala(_prev: EstadoEscala, fd: FormData): Promise<EstadoEscala> {
  const sessao = await sessaoComAcesso();
  const branch_id = texto(fd, "branch_id");
  if (!UUID.test(branch_id)) return { erro: "Escolha a filial." };
  const supabase = await createClient();
  const { error } = await supabase.from("esc_filiais").insert({ branch_id, origem: "Incluída no portal" });
  if (error) return { erro: /duplicate key/i.test(error.message) ? "Essa filial já está na escala." : msgBanco(error.message) };
  // a escala segue a filial do PONTO (vazia = a da folha)
  const { data: rh } = await supabase.from("employees").select("id, nome, cargo, status").eq("ponto_filial_id", branch_id).in("status", ["ativo", "afastado", "ferias"]).order("nome");
  if (rh?.length) {
    await supabase.from("esc_colaboradores").insert(
      rh.map((e, i) => ({
        branch_id,
        employee_id: e.id,
        nome: e.nome,
        funcao: funcaoDoCargo(e.cargo),
        cargo_origem: e.cargo,
        situacao: e.status === "ativo" ? "ativo" : "afastado",
        origem: "rh",
        ordem: i + 1,
      })),
    );
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "esc_filiais", registroId: branch_id, novo: { branch_id, equipe_do_rh: rh?.length ?? 0 } });
  revalidatePath(ROTA, "layout");
  redirect(`${ROTA}/filial/${branch_id}?incluida=1`);
}

// ---------------------------------------------------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------------------------------------------------

/** Inclui ou edita uma pessoa da equipe da escala. */
export async function salvarColaborador(_prev: EstadoEscala, fd: FormData): Promise<EstadoEscala> {
  const sessao = await sessaoComAcesso();
  const id = texto(fd, "id");
  const branch_id = texto(fd, "branch_id");
  if (!UUID.test(branch_id) || (id && !UUID.test(id))) return { erro: "Dados inválidos." };
  const erros: Record<string, string> = {};
  const nome = texto(fd, "nome").replace(/\s+/g, " ").slice(0, 120);
  if (nome.length < 2) erros.nome = "Informe o nome.";
  const funcao = texto(fd, "funcao");
  if (!ehFuncao(funcao)) erros.funcao = "Escolha a função.";
  const situacao = texto(fd, "situacao");
  if (!ehSituacao(situacao)) erros.situacao = "Escolha a situação.";
  const horasTxt = texto(fd, "horas_dia").replace(",", ".");
  const horas_dia = horasTxt ? Number(horasTxt) : null;
  if (horas_dia !== null && (!Number.isFinite(horas_dia) || horas_dia < 1 || horas_dia > 12)) erros.horas_dia = "Entre 1 e 12 horas (vazio = jornada ÷ 5).";
  const intervalo_min = Number(texto(fd, "intervalo_min") || 60);
  if (!Number.isInteger(intervalo_min) || intervalo_min < 0 || intervalo_min > 240) erros.intervalo_min = "De 0 a 240 minutos.";
  const regime = texto(fd, "regime") || "5x2";
  if (!ehRegime(regime)) erros.regime = "Escolha o regime.";
  const employee = texto(fd, "employee_id");
  if (employee && !UUID.test(employee)) erros.employee_id = "Ficha inválida.";
  if (Object.keys(erros).length) return { erro: "Confira os campos destacados.", erros };

  const dados = {
    nome,
    funcao: funcao as Funcao,
    situacao,
    horas_dia,
    intervalo_min,
    regime: regime as Regime,
    registro: texto(fd, "registro").slice(0, 40) || null,
    observacoes: texto(fd, "observacoes").slice(0, 500) || null,
    employee_id: employee || null,
    revisar: false,
  };
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("esc_colaboradores").update(dados).eq("id", id).eq("branch_id", branch_id);
    if (error) return { erro: /esc_colaboradores_func_filial_uidx|duplicate key/i.test(error.message) ? "Essa ficha do RH já está ligada a outra pessoa desta filial." : msgBanco(error.message) };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "esc_colaboradores", registroId: id, novo: dados });
  } else {
    const { data: ult } = await supabase.from("esc_colaboradores").select("ordem").eq("branch_id", branch_id).order("ordem", { ascending: false }).limit(1).maybeSingle();
    const { data: novo, error } = await supabase
      .from("esc_colaboradores")
      .insert({ ...dados, branch_id, origem: employee ? "rh" : "manual", ordem: (ult?.ordem ?? 0) + 1 })
      .select("id")
      .single();
    if (error) return { erro: /esc_colaboradores_func_filial_uidx|duplicate key/i.test(error.message) ? "Essa ficha do RH já está na equipe desta filial." : msgBanco(error.message) };
    await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "esc_colaboradores", registroId: novo.id, novo: { ...dados, branch_id } });
  }
  revalidatePath(ROTA, "layout");
  return { ok: id ? "Dados da pessoa salvos." : "Pessoa incluída na equipe da escala." };
}

/** Tira a pessoa da equipe da escala (a ficha do RH não muda). */
export async function excluirColaborador(fd: FormData): Promise<void> {
  const sessao = await sessaoComAcesso();
  const id = texto(fd, "id");
  if (!UUID.test(id)) return;
  const supabase = await createClient();
  const { data: antigo } = await supabase.from("esc_colaboradores").select("nome, branch_id, employee_id, funcao, situacao").eq("id", id).maybeSingle();
  const { error } = await supabase.from("esc_colaboradores").delete().eq("id", id);
  if (error) throw new Error(msgBanco(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "esc_colaboradores", registroId: id, anterior: antigo ?? null });
  revalidatePath(ROTA, "layout");
}

/** Traz para a equipe da escala as pessoas do RH da filial que ainda não estão nela. */
export async function trazerDoRh(fd: FormData): Promise<void> {
  const sessao = await sessaoComAcesso();
  const branch_id = texto(fd, "branch_id");
  const ids = fd.getAll("employee_id").map(String).filter((v) => UUID.test(v));
  if (!UUID.test(branch_id) || !ids.length) return;
  const supabase = await createClient();
  const [{ data: rh }, { data: ja }, { data: ult }] = await Promise.all([
    supabase.from("employees").select("id, nome, cargo, status").in("id", ids),
    supabase.from("esc_colaboradores").select("employee_id").eq("branch_id", branch_id).not("employee_id", "is", null),
    supabase.from("esc_colaboradores").select("ordem").eq("branch_id", branch_id).order("ordem", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const tem = new Set((ja ?? []).map((x) => x.employee_id));
  const novos = (rh ?? []).filter((e) => !tem.has(e.id));
  if (!novos.length) return;
  const base = ult?.ordem ?? 0;
  const { error } = await supabase.from("esc_colaboradores").insert(
    novos.map((e, i) => ({ branch_id, employee_id: e.id, nome: e.nome, funcao: funcaoDoCargo(e.cargo), cargo_origem: e.cargo, situacao: e.status === "ativo" ? "ativo" : "afastado", origem: "rh", ordem: base + i + 1 })),
  );
  if (error) throw new Error(msgBanco(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "esc_colaboradores", registroId: branch_id, novo: { do_rh: novos.length } });
  revalidatePath(ROTA, "layout");
}

// ---------------------------------------------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------------------------------------------

/** Gera as opções do mês (uma filial ou todas as que a pessoa vê) e abre o resultado. */
export async function gerarSimulacao(_prev: EstadoEscala, fd: FormData): Promise<EstadoEscala> {
  const sessao = await sessaoComAcesso();
  const alvo = texto(fd, "filial");
  const periodo = lerMesAno(texto(fd, "periodo"));
  const jornada = Number(texto(fd, "jornada"));
  const qtd = Number(texto(fd, "opcoes"));
  if (!alvo || (alvo !== "todas" && !UUID.test(alvo))) return { erro: "Escolha a filial (ou todas)." };
  if (!periodo) return { erro: "Escolha o mês." };
  if (![40, 42, 44].includes(jornada)) return { erro: "Escolha a jornada semanal." };
  if (jornada > limiteSemanal(periodo.ano, periodo.mes)) return { erro: `Para ${String(periodo.mes).padStart(2, "0")}/${periodo.ano} o limite é ${limiteSemanal(periodo.ano, periodo.mes)} h/semana.` };
  if (![2, 3, 4].includes(qtd)) return { erro: "Escolha 2, 3 ou 4 opções." };
  const folgasForm = [...new Set(fd.getAll("folgas").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  const todas = await filiaisDaEscala();
  const alvos = alvo === "todas" ? todas : todas.filter((f) => f.id === alvo);
  if (!alvos.length) return { erro: "Filial não encontrada na escala." };
  if (alvo !== "todas") {
    if (!folgasForm.length) return { erro: "Marque pelo menos um dia permitido para folga.", erros: { folgas: "Marque pelo menos um dia." } };
    const erro = erroFolgas(alvos[0].config, folgasForm);
    if (erro) return { erro, erros: { folgas: erro } };
  }

  // uma filial: quem o RH marcou como 12x36 no "Gerar opções" fica salvo na equipe e já entra nesta geração
  if (alvo !== "todas" && texto(fd, "doze_presente") === "1") {
    const marcados = new Set(fd.getAll("doze").map(String).filter((v) => UUID.test(v)));
    const f = alvos[0];
    const novoRegime = (id: string): Regime => (marcados.has(id) ? "12x36" : "5x2");
    const mudar = f.equipe.filter((p) => p.situacao === "ativo" && novoRegime(p.id) !== (p.regime ?? "5x2"));
    if (mudar.length) {
      const sb = await createClient();
      for (const regime of REGIMES) {
        const ids = mudar.filter((p) => novoRegime(p.id) === regime).map((p) => p.id);
        if (!ids.length) continue;
        const { error } = await sb.from("esc_colaboradores").update({ regime }).in("id", ids).eq("branch_id", f.id);
        if (error) return { erro: msgBanco(error.message) };
      }
      await registrarAuditoria(sb, {
        userId: sessao.id,
        acao: "editar",
        entidade: "esc_colaboradores",
        registroId: f.id,
        anterior: { regime: mudar.map((p) => ({ id: p.id, nome: p.nome, regime: p.regime ?? "5x2" })) },
        novo: { regime: mudar.map((p) => ({ id: p.id, nome: p.nome, regime: novoRegime(p.id) })) },
      });
      for (const p of mudar) p.regime = novoRegime(p.id);
    }
  }

  const lote = crypto.randomUUID();
  const linhas: {
    lote: string;
    branch_id: string;
    opcao: number;
    ano: number;
    mes: number;
    inicio: string | null;
    jornada_semanal: number;
    folgas_permitidas: number[];
    config: Json;
    equipe: Json;
    cobertura: Json;
    alertas: Json;
    alertas_base: Json;
  }[] = [];
  const ignoradas: string[] = [];
  for (const f of alvos) {
    if (!f.equipe.length) {
      ignoradas.push(`${f.codigo} (sem equipe)`);
      continue;
    }
    try {
      const folgas = alvo === "todas" ? f.config.folgasPermitidas : folgasForm;
      const opcoes = gerarOpcoes(f.config, f.equipe, { ano: periodo.ano, mes: periodo.mes, jornadaSemanal: jornada, opcoes: qtd, folgasPermitidas: folgas });
      opcoes.forEach((o, i) =>
        linhas.push({
          lote,
          branch_id: f.id,
          opcao: i + 1,
          ano: o.ano,
          mes: o.mes,
          inicio: o.inicio ?? null,
          jornada_semanal: o.jornadaSemanal,
          folgas_permitidas: o.folgasPermitidas,
          config: { ...f.config, folgasPermitidas: o.folgasPermitidas } as unknown as Json,
          equipe: o.equipe as unknown as Json,
          cobertura: o.cobertura as unknown as Json,
          alertas: o.alertas as unknown as Json,
          alertas_base: (o.alertasBase ?? o.alertas) as unknown as Json,
        }),
      );
    } catch (e) {
      ignoradas.push(`${f.codigo} (${e instanceof Error ? e.message : "erro"})`);
    }
  }
  if (!linhas.length) return { erro: `Nenhuma opção gerada: ${ignoradas.join("; ")}` };

  const supabase = await createClient();
  // várias filiais: grava em partes para não mandar tudo de uma vez
  for (let i = 0; i < linhas.length; i += 12) {
    const { error } = await supabase.from("esc_simulacoes").insert(linhas.slice(i, i + 12));
    if (error) {
      await supabase.from("esc_simulacoes").delete().eq("lote", lote);
      return { erro: msgBanco(error.message) };
    }
  }
  // uma filial: os dias marcados viram o padrão dela (como no sistema original)
  if (alvo !== "todas" && folgasForm.join() !== alvos[0].config.folgasPermitidas.join()) {
    await supabase.from("esc_filiais").update({ folgas_permitidas: folgasForm }).eq("branch_id", alvos[0].id);
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "esc_simulacoes", registroId: lote, novo: { filiais: alvos.length, opcoes: linhas.length, ano: periodo.ano, mes: periodo.mes, jornada } });
  revalidatePath(ROTA, "layout");
  const qs = ignoradas.length ? `?ignoradas=${encodeURIComponent(ignoradas.join("; ").slice(0, 600))}` : "";
  redirect(`${ROTA}/simulacao/${lote}${qs}`);
}

export type RespostaAjuste = { erro?: string; ok?: string; movidaDe?: number | null };

/**
 * Ajuste de um dia no calendário: recalcula horas, cobertura e pendências e grava. O `modo` leva o novo horário também
 * para os outros dias da pessoa: "mesmo_horario" (dias com a mesma entrada e saída) ou "grupo" (todos os dias de
 * segunda a sexta, todos os sábados ou todos os domingos do período, conforme o dia escolhido). Folga não replica.
 */
export async function ajustarDia(simId: string, ajuste: AjusteTurno, modo: ModoAjuste | boolean = "dia"): Promise<RespostaAjuste> {
  await sessaoComAcesso();
  if (!UUID.test(simId) || !UUID.test(ajuste.pessoaId) || !Number.isInteger(ajuste.data)) return { erro: "Dados inválidos." };
  if (ajuste.status !== "trabalho" && ajuste.status !== "folga") return { erro: "Escolha trabalho ou folga." };
  const m: ModoAjuste = modo === true ? "mesmo_horario" : modo === "mesmo_horario" || modo === "grupo" ? modo : "dia";
  const s = await simulacao(simId);
  if (!s) return { erro: "Opção não encontrada." };
  if (s.situacao !== "rascunho") return { erro: "Escala oficial não muda. Gere uma nova opção." };
  let movidaDe: number | null = null;
  let outrosDias: number[] = [];
  const grupo = grupoDoDia(s.cobertura.find((c) => c.data === ajuste.data)?.dia ?? "seg");
  try {
    if (m !== "dia" && ajuste.status === "trabalho") ({ movidaDe, outrosDias } = ajustarVariosDias(s.config, s, ajuste, m));
    else movidaDe = ajustarTurno(s.config, s, ajuste).movidaDe;
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não deu para ajustar esse dia." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("esc_simulacoes")
    .update({
      equipe: s.equipe as unknown as Json,
      cobertura: s.cobertura as unknown as Json,
      alertas: s.alertas as unknown as Json,
      alertas_base: (s.alertasBase ?? null) as unknown as Json,
      analise_pendente: true,
    })
    .eq("id", simId);
  if (error) return { erro: msgBanco(error.message) };
  revalidatePath(`${ROTA}/simulacao/${s.lote}`);
  const onde = m === "grupo" ? (grupo === "seg_sex" ? " (segunda a sexta)" : ` (${ROTULO_GRUPO[grupo]})`) : "";
  const replicados = outrosDias.length ? ` Mesmo horário aplicado em mais ${outrosDias.length} dia(s)${onde}: ${outrosDias.map((d) => rotuloData(s, d)).join(", ")}.` : "";
  return { ok: `Ajuste salvo.${replicados} Cobertura e pendências recalculadas.${movidaDe ? ` Folga trocada: ${rotuloData(s, movidaDe)} → ${rotuloData(s, ajuste.data)}.` : ""}`, movidaDe };
}

/** "Atualizar pendências": registra o que foi resolvido, o que continua e o que é novo. */
export async function reanalisarSimulacao(fd: FormData): Promise<void> {
  await sessaoComAcesso();
  const id = texto(fd, "id");
  if (!UUID.test(id)) return;
  const s = await simulacao(id);
  if (!s || s.situacao !== "rascunho") return;
  const volta = voltaDe(fd, s.lote);
  reanalisar(s.config, s);
  const supabase = await createClient();
  const { error } = await supabase
    .from("esc_simulacoes")
    .update({
      equipe: s.equipe as unknown as Json,
      cobertura: s.cobertura as unknown as Json,
      alertas: s.alertas as unknown as Json,
      alertas_base: s.alertasBase as unknown as Json,
      analise: s.analise as unknown as Json,
      analise_pendente: false,
      analisado_em: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) redirect(comMsg(volta, "erro", msgBanco(error.message)));
  revalidatePath(`${ROTA}/simulacao/${s.lote}`);
  const a = s.analise;
  redirect(comMsg(volta, "ok", a && a.atuais === 0 ? "Pendências atualizadas: nenhuma pendência nesta opção." : `Pendências atualizadas: ${a?.resolvidas ?? 0} resolvida(s), ${a?.continuam ?? 0} continuam e ${a?.novas ?? 0} nova(s).`));
}

/**
 * Publica a opção como escala oficial do período da filial (a anterior do mesmo período vira "substituída"). Com
 * "segue até ser alterada", ela continua valendo nos próximos períodos até outra ser publicada.
 */
export async function publicarSimulacao(fd: FormData): Promise<void> {
  const sessao = await sessaoComAcesso();
  const id = texto(fd, "id");
  if (!UUID.test(id)) return;
  const s = await simulacao(id);
  if (!s || s.situacao !== "rascunho") return;
  const volta = voltaDe(fd, s.lote);
  if (s.analisePendente) redirect(comMsg(volta, "erro", "Atualize as pendências antes de publicar."));
  if (s.alertas.length) redirect(comMsg(volta, "erro", "Resolva as pendências antes de publicar a escala oficial."));
  const supabase = await createClient();
  const { data: anterior } = await supabase.from("esc_simulacoes").select("id").eq("branch_id", s.branchId).eq("ano", s.ano).eq("mes", s.mes).eq("situacao", "oficial").maybeSingle();
  if (anterior) {
    const { error } = await supabase.from("esc_simulacoes").update({ situacao: "substituida" }).eq("id", anterior.id);
    if (error) redirect(comMsg(volta, "erro", msgBanco(error.message)));
  }
  const continua = texto(fd, "continua") === "1";
  const { error } = await supabase.from("esc_simulacoes").update({ situacao: "oficial", continua }).eq("id", id);
  if (error) {
    // devolve a anterior para oficial não dá (substituída não volta): avisa para publicar de novo
    redirect(comMsg(volta, "erro", `Não publiquei: ${msgBanco(error.message)}`));
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "esc_simulacoes", registroId: id, novo: { situacao: "oficial", continua, filial: s.filial.codigo, ano: s.ano, mes: s.mes, substituiu: anterior?.id ?? null } });
  revalidatePath(ROTA, "layout");
  redirect(
    comMsg(
      volta,
      "ok",
      `Escala oficial de ${rotuloPeriodo(s)} publicada para ${s.filial.codigo}.${continua ? " Ela segue valendo nos próximos períodos até outra ser publicada." : ""}${anterior ? " A anterior ficou como substituída." : ""}`,
    ),
  );
}

/** Liga ou desliga o "segue até ser alterada" de uma escala oficial. */
export async function alternarContinua(fd: FormData): Promise<void> {
  const sessao = await sessaoComAcesso();
  const id = texto(fd, "id");
  if (!UUID.test(id)) return;
  const s = await simulacao(id);
  if (!s || s.situacao !== "oficial") return;
  const volta = voltaDe(fd, s.lote);
  const continua = texto(fd, "continua") === "1";
  const supabase = await createClient();
  const { error } = await supabase.from("esc_simulacoes").update({ continua }).eq("id", id);
  if (error) redirect(comMsg(volta, "erro", msgBanco(error.message)));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "editar", entidade: "esc_simulacoes", registroId: id, anterior: { continua: s.continua }, novo: { continua } });
  revalidatePath(ROTA, "layout");
  redirect(comMsg(volta, "ok", continua ? "A escala segue valendo nos próximos períodos até outra ser publicada." : "A escala deixou de seguir: vale só para o período dela."));
}

/** Apaga os rascunhos do lote (a escala oficial, se houver, fica). */
export async function descartarLote(fd: FormData): Promise<void> {
  const sessao = await sessaoComAcesso();
  const lote = texto(fd, "lote");
  if (!UUID.test(lote)) return;
  const supabase = await createClient();
  const { error, count } = await supabase.from("esc_simulacoes").delete({ count: "exact" }).eq("lote", lote).eq("situacao", "rascunho");
  if (error) throw new Error(msgBanco(error.message));
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "esc_simulacoes", registroId: lote, anterior: { rascunhos: count ?? 0 } });
  revalidatePath(ROTA, "layout");
  redirect(`${ROTA}/simulador`);
}
