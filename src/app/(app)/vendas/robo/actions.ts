"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";
import { coletarVendas, ehRelatorioVendas, ontemNoBrasil, pedidosDoPeriodo, pedidosPendentes } from "@/lib/vendas/coleta";
import { relerColetas } from "@/lib/vendas/leitura";

export type EstadoBuscaVendas = { erro?: string; ok?: string; avisos?: string[]; restantes?: number; rodada?: number };

const DIAS_MAX = 800;

/**
 * Busca no Trier os relatórios marcados do período (todas as filiais) e já lê cada um. Pula o que já foi buscado
 * (a não ser com "buscar de novo"). Faz o que couber em ~4,5 min e devolve quantos faltam: a tela chama de novo
 * sozinha até acabar.
 */
export async function buscarVendasAgora(prev: EstadoBuscaVendas, fd: FormData): Promise<EstadoBuscaVendas> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador roda o robô de vendas." };
  const de = String(fd.get("de") ?? "");
  const ate = String(fd.get("ate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return { erro: "Escolha o período." };
  if (ate < de) return { erro: "A data final vem antes da inicial." };
  if (ate > ontemNoBrasil()) return { erro: "Vai até ontem no máximo: o dia de hoje ainda não fechou." };
  if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 + 1 > DIAS_MAX) return { erro: `Período de no máximo ${DIAS_MAX} dias por busca.` };
  const relatorios = fd.getAll("relatorio").map(String).filter(ehRelatorioVendas);
  if (!relatorios.length) return { erro: "Marque pelo menos um relatório." };
  // "buscar de novo" só vale na primeira rodada; nas seguintes, pula o que a própria busca já trouxe
  const forcar = fd.get("forcar") === "1" && !prev.restantes;
  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return { erro: "Cadastre antes o usuário e a senha do robô do Trier (Administração → Integrações)." };
  const todos = pedidosDoPeriodo(de, ate, relatorios);
  const pedidos = forcar ? todos : await pedidosPendentes(supabase, todos);
  if (!pedidos.length) return { ok: "Esse período já foi todo buscado. Marque “buscar de novo” para trazer outra vez." };
  let r;
  try {
    r = await coletarVendas(supabase, cred, pedidos, sessao.id, 265_000);
  } catch (e) {
    return { erro: `O robô não conseguiu entrar no Trier: ${e instanceof Error ? e.message : String(e)}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "vendas_coletas", novo: { de, ate, relatorios, ok: r.ok, erros: r.erros.length, faltam: r.restantes.length } });
  revalidatePath("/vendas/robo");
  const avisos = r.erros.slice(0, 8).map((e) => `${e.relatorio} ${e.de}${e.de !== e.ate ? ` a ${e.ate}` : ""}: ${e.erro}`);
  if (r.erros.length > 8) avisos.push(`… e mais ${r.erros.length - 8} erro(s).`);
  const parou = r.restantes.length > 0 && r.ok + r.vazios === 0;
  if (parou) return { erro: "O Trier não devolveu nenhum relatório nesta rodada.", avisos };
  return {
    ok: `${r.ok} relatório(s) guardado(s) e lido(s)${r.vazios ? `, ${r.vazios} sem movimento` : ""} em ${Math.round(r.ms / 1000)} s.${r.restantes.length ? ` Faltam ${r.restantes.length}: continuando…` : " Pronto."}`,
    avisos,
    restantes: r.restantes.length,
    rodada: (prev.rodada ?? 0) + 1,
  };
}

export type EstadoReler = { erro?: string; ok?: string; avisos?: string[] };

/** Lê de novo os Excel já guardados (depois de uma correção no leitor), sem ir ao Trier. */
export async function relerVendas(_prev: EstadoReler, fd: FormData): Promise<EstadoReler> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador relê as buscas." };
  const supabase = await createClient();
  try {
    const r = await relerColetas(supabase, { soNaoLidas: fd.get("todas") !== "1", prazoMs: 250_000 });
    revalidatePath("/vendas/robo");
    if (!r.total) return { ok: "Nada para ler: tudo que foi buscado já está lido." };
    return { ok: `${r.lidas} de ${r.total} busca(s) lida(s).${r.lidas + r.erros.length < r.total ? " O tempo acabou: clique de novo para continuar." : ""}`, avisos: r.erros.slice(0, 8) };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : String(e) };
  }
}
