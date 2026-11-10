"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { ehUuid } from "@/lib/data/filiais";
import { createClient } from "@/lib/supabase/server";

const ROTA = "/vendas/vendedores";

/** Volta para a tela com os filtros que estavam e o recado. */
function voltar(fd: FormData, msg: string): never {
  const filtros = new URLSearchParams(String(fd.get("volta") ?? ""));
  filtros.delete("msg");
  filtros.set("msg", msg);
  revalidatePath(ROTA);
  revalidatePath("/vendas/minhas");
  redirect(`${ROTA}?${filtros.toString()}`);
}

const codigoValido = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 10_000_000 ? n : null;
};

/** "NOME · F014" ou "NOME · F014 (2)" (a lista para escolher à mão) → funcionário. */
async function funcionarioDoRotulo(supabase: Awaited<ReturnType<typeof createClient>>, rotulo: string) {
  const m = /^(.+?) · (\S+?)(?: \((\d+)\))?$/.exec(rotulo.trim());
  if (!m) return { erro: "Escolha o funcionário na lista." };
  const [, nome, filial, ordem] = m;
  const [{ data }, { data: fil }] = await Promise.all([
    supabase.from("employees").select("id, branch_id").eq("nome", nome).neq("status", "desligado").order("nome").order("id"),
    supabase.from("branches").select("id").eq("codigo", filial).maybeSingle(),
  ]);
  const daFilial = (data ?? []).filter((e) => (filial === "sem filial" ? !e.branch_id : e.branch_id === fil?.id));
  if (!daFilial.length) return { erro: `Não achei ${nome} (${filial}) entre os funcionários ativos.` };
  if (daFilial.length > 1 && !ordem) return { erro: `Há mais de um ${nome} na ${filial}: escolha o da lista com o número.` };
  return { id: daFilial[Math.min(Number(ordem ?? 1), daFilial.length) - 1].id };
}

/** Liga um código do Trier a um funcionário (sugestão confirmada ou escolhido na lista). Só admin. */
export async function ligarVendedor(fd: FormData) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") voltar(fd, "Só o administrador liga vendedores.");
  const codigo = codigoValido(fd.get("codigo"));
  const nomeTrier = String(fd.get("nome") ?? "").trim().slice(0, 80);
  if (!codigo || !nomeTrier) voltar(fd, "Código do vendedor inválido.");
  const supabase = await createClient();
  let employeeId = String(fd.get("employee") ?? "");
  const rotulo = String(fd.get("rotulo") ?? "").trim();
  if (rotulo) {
    const r = await funcionarioDoRotulo(supabase, rotulo);
    if (r.erro) voltar(fd, r.erro);
    employeeId = r.id!;
  }
  if (!ehUuid(employeeId)) voltar(fd, "Escolha o funcionário.");
  // nunca troca em silêncio: se o código já é de alguém, avisa (desligue antes)
  const { data: antes } = await supabase.from("vendas_vendedor_vinculo").select("employee_id").eq("vendedor_codigo", codigo).maybeSingle();
  if (antes) voltar(fd, `O código ${codigo} já está ligado a outro funcionário. Desligue primeiro para trocar.`);
  const linha = { vendedor_codigo: codigo, employee_id: employeeId, vendedor_nome: nomeTrier, criado_por: sessao.id };
  const { error } = await supabase.from("vendas_vendedor_vinculo").insert(linha);
  if (error) voltar(fd, `Não liguei: ${error.message}`);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "vendas_vendedor_vinculo", registroId: String(codigo), novo: linha });
  voltar(fd, `${nomeTrier} (${codigo}) ligado.`);
}

/** Liga de uma vez as sugestões certas que estão na tela (nenhum código já ligado é trocado). Só admin. */
export async function ligarSugestoes(fd: FormData) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") voltar(fd, "Só o administrador liga vendedores.");
  let pares: unknown;
  try {
    pares = JSON.parse(String(fd.get("pares") ?? "[]"));
  } catch {
    voltar(fd, "Lista inválida.");
  }
  const linhas = (Array.isArray(pares) ? pares : [])
    .map((p) => ({ vendedor_codigo: codigoValido(p?.c), employee_id: String(p?.e ?? ""), vendedor_nome: String(p?.n ?? "").trim().slice(0, 80), criado_por: sessao.id }))
    .filter((l): l is typeof l & { vendedor_codigo: number } => !!l.vendedor_codigo && ehUuid(l.employee_id) && !!l.vendedor_nome);
  if (!linhas.length) voltar(fd, "Nenhuma sugestão para ligar.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendas_vendedor_vinculo").upsert(linhas, { onConflict: "vendedor_codigo", ignoreDuplicates: true }).select("vendedor_codigo");
  if (error) voltar(fd, `Não liguei: ${error.message}`);
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "vendas_vendedor_vinculo", novo: { ligados: data?.length ?? 0, codigos: (data ?? []).map((d) => d.vendedor_codigo) } });
  const pulados = linhas.length - (data?.length ?? 0);
  voltar(fd, `${data?.length ?? 0} vendedores ligados${pulados ? `; ${pulados} já estavam ligados e ficaram como estavam` : ""}.`);
}

/** Desliga o código do funcionário (ele deixa de ver essa venda). Só admin. */
export async function desligarVendedor(fd: FormData) {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") voltar(fd, "Só o administrador desliga vendedores.");
  const codigo = codigoValido(fd.get("codigo"));
  if (!codigo) voltar(fd, "Código inválido.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("vendas_vendedor_vinculo").delete().eq("vendedor_codigo", codigo).select("vendedor_codigo, employee_id, vendedor_nome");
  if (error) voltar(fd, `Não desliguei: ${error.message}`);
  if (data?.length) await registrarAuditoria(supabase, { userId: sessao.id, acao: "excluir", entidade: "vendas_vendedor_vinculo", registroId: String(codigo), anterior: data[0] });
  voltar(fd, data?.length ? `${data[0].vendedor_nome} (${codigo}) desligado.` : "Esse código já não estava ligado.");
}
