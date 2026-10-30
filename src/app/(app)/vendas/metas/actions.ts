"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { chaveMetaFilial, chaveMetaVendedor, metasDoMes, mesmoDia, ultimoDia, vendasPorFilial, vendedoresNoPeriodo } from "@/lib/data/vendas";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

export type EstadoMetas = { erro?: string; ok?: string };

const MES = /^\d{4}-\d{2}-01$/;
const podeEditar = (papel: string) => papel === "admin" || papel === "financeiro";

/** "12.345,67", "12345,67", "12345.67", "150.000" ou "R$ 1.000" → número; vazio → null; inválido → NaN. */
function lerValor(bruto: string): number | null {
  const s = bruto.replace(/R\$|\s/g, "");
  if (!s) return null;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  const v = Number(norm);
  return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : Number.NaN;
}

/** De onde sai cada chave (filial, televendas, vendedor). */
function alvoDaChave(chave: string): { alvo: "filial" | "televendas" | "vendedor"; branch_id: string | null; vendedor_codigo: number | null } | null {
  if (chave === "televendas") return { alvo: "televendas", branch_id: null, vendedor_codigo: null };
  const [tipo, id] = chave.split(":");
  if (tipo === "filial" && ehUuid(id)) return { alvo: "filial", branch_id: id, vendedor_codigo: null };
  if (tipo === "vendedor" && /^\d+$/.test(id)) return { alvo: "vendedor", branch_id: null, vendedor_codigo: Number(id) };
  return null;
}

async function gravar(mes: string, valores: Map<string, number | null>, quem: string) {
  const supabase = await createClient();
  const salvar = [...valores].flatMap(([chave, valor]) => {
    const a = alvoDaChave(chave);
    return a && valor !== null ? [{ mes, chave, valor, ...a, atualizado_em: new Date().toISOString(), atualizado_por: quem }] : [];
  });
  const apagar = [...valores].filter(([, v]) => v === null).map(([chave]) => chave);
  if (salvar.length) {
    const { error } = await supabase.from("vendas_metas").upsert(salvar, { onConflict: "mes,chave" });
    if (error) return { erro: `Não consegui salvar: ${error.message}` };
  }
  if (apagar.length) {
    const { error } = await supabase.from("vendas_metas").delete().eq("mes", mes).in("chave", apagar);
    if (error) return { erro: `Não consegui apagar as metas em branco: ${error.message}` };
  }
  await registrarAuditoria(supabase, { userId: quem, acao: "editar", entidade: "vendas_metas", novo: { mes, salvas: salvar.length, apagadas: apagar.length } });
  revalidatePath("/vendas", "layout");
  return { salvas: salvar.length, apagadas: apagar.length };
}

/** Salva as metas digitadas na tela (campos "m|<chave>"); campo vazio apaga a meta. */
export async function salvarMetas(_prev: EstadoMetas, fd: FormData): Promise<EstadoMetas> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só o administrador e o financeiro cadastram metas." };
  const mes = String(fd.get("mes") ?? "");
  if (!MES.test(mes)) return { erro: "Mês inválido." };
  const atuais = await metasDoMes(mes);
  const valores = new Map<string, number | null>();
  for (const [campo, bruto] of fd.entries()) {
    if (!campo.startsWith("m|") || typeof bruto !== "string") continue;
    const chave = campo.slice(2);
    const v = lerValor(bruto);
    if (Number.isNaN(v)) return { erro: `Valor inválido: “${bruto}”. Use só números (ex.: 150.000,00).` };
    // só grava o que mudou
    if (v === null ? atuais.has(chave) : atuais.get(chave) !== v) valores.set(chave, v);
  }
  if (!valores.size) return { ok: "Nada mudou." };
  const r = await gravar(mes, valores, sessao.id);
  if ("erro" in r) return { erro: r.erro };
  return { ok: [r.salvas && `${r.salvas} ${r.salvas === 1 ? "meta salva" : "metas salvas"}`, r.apagadas && `${r.apagadas} ${r.apagadas === 1 ? "apagada" : "apagadas"}`].filter(Boolean).join(" e ") + "." };
}

/**
 * Preenche as metas em branco da seção com a venda do mês anterior (mês inteiro) + o percentual escolhido,
 * arredondada para centenas. Não mexe no que já tem meta.
 */
export async function preencherMetas(_prev: EstadoMetas, fd: FormData): Promise<EstadoMetas> {
  const sessao = await getSessao();
  if (!podeEditar(sessao.papel)) return { erro: "Só o administrador e o financeiro cadastram metas." };
  const mes = String(fd.get("mes") ?? "");
  if (!MES.test(mes)) return { erro: "Mês inválido." };
  const secao = String(fd.get("secao") ?? "");
  const filial = String(fd.get("filial") ?? "");
  const pctTxt = String(fd.get("percentual") ?? "").replace(",", ".").trim();
  const percentual = pctTxt ? Number(pctTxt) : 0;
  if (!Number.isFinite(percentual) || percentual < -90 || percentual > 300) return { erro: "Percentual inválido (ex.: 5 para 5% a mais)." };
  const ini = mesmoDia(mes, 1);
  const [a, m] = ini.split("-").map(Number);
  const fim = `${ini.slice(0, 7)}-${String(ultimoDia(a, m)).padStart(2, "0")}`;
  const fator = 1 + percentual / 100;
  const arred = (v: number) => Math.max(0, Math.round((v * fator) / 100) * 100);
  const atuais = await metasDoMes(mes);
  const base = new Map<string, number>();
  if (secao === "filiais" || secao === "televendas") {
    for (const l of await vendasPorFilial(ini, fim)) {
      const chave = chaveMetaFilial(l);
      if ((secao === "televendas") === (chave === "televendas")) base.set(chave, l.venda);
    }
  }
  if (secao === "televendas" || secao === "vendedores") {
    for (const v of await vendedoresNoPeriodo(ini, fim)) {
      if (secao === "televendas" ? v.televendas : !v.televendas && v.branchId === filial) base.set(chaveMetaVendedor(v.vendedorCodigo), v.venda);
    }
  }
  const valores = new Map<string, number | null>();
  for (const [chave, venda] of base) if (!atuais.has(chave) && venda > 0) valores.set(chave, arred(venda));
  if (!valores.size) return { ok: "Nenhuma meta em branco com venda no mês anterior para preencher." };
  const r = await gravar(mes, valores, sessao.id);
  if ("erro" in r) return { erro: r.erro };
  return { ok: `${r.salvas} ${r.salvas === 1 ? "meta preenchida" : "metas preenchidas"} com a venda do mês anterior${percentual ? ` ${percentual > 0 ? "+" : "−"} ${Math.abs(percentual)}%` : ""}. Confira e ajuste o que precisar.` };
}
