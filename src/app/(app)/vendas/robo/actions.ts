"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { credenciaisTrier } from "@/lib/integracoes/segredos";
import { createClient } from "@/lib/supabase/server";
import { coletarVendas, ehRelatorioVendas } from "@/lib/vendas/coleta";

export type EstadoBuscaVendas = { erro?: string; ok?: string; avisos?: string[] };

const hojeNoBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const DIAS_MAX = 62;

/** Busca agora no Trier os relatórios de vendas marcados, do período escolhido (todas as filiais), e guarda cada Excel. */
export async function buscarVendasAgora(_prev: EstadoBuscaVendas, fd: FormData): Promise<EstadoBuscaVendas> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin") return { erro: "Só o administrador roda o robô de vendas." };
  const de = String(fd.get("de") ?? "");
  const ate = String(fd.get("ate") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return { erro: "Escolha o período." };
  if (ate < de) return { erro: "A data final vem antes da inicial." };
  if (ate > hojeNoBrasil()) return { erro: "A data final não pode passar de hoje." };
  if ((Date.parse(ate) - Date.parse(de)) / 86_400_000 + 1 > DIAS_MAX) return { erro: `Período de no máximo ${DIAS_MAX} dias por busca.` };
  const relatorios = fd.getAll("relatorio").map(String).filter(ehRelatorioVendas);
  if (!relatorios.length) return { erro: "Marque pelo menos um relatório." };
  const supabase = await createClient();
  const cred = await credenciaisTrier(supabase);
  if (!cred.usuario || !cred.senha) return { erro: "Cadastre antes o usuário e a senha do robô do Trier (Administração → Integrações)." };
  let r;
  try {
    r = await coletarVendas(supabase, cred, relatorios.map((relatorio) => ({ relatorio, de, ate })), sessao.id, 270_000);
  } catch (e) {
    return { erro: `O robô não conseguiu entrar no Trier: ${e instanceof Error ? e.message : String(e)}` };
  }
  await registrarAuditoria(supabase, { userId: sessao.id, acao: "criar", entidade: "vendas_coletas", novo: { de, ate, relatorios, ok: r.ok, erros: r.erros.length } });
  revalidatePath("/vendas/robo");
  const avisos = [...r.erros.map((e) => `${e.relatorio}: ${e.erro}`), ...(r.restantes.length ? [`${r.restantes.length} relatório(s) ficaram para a próxima busca (o tempo acabou).`] : [])];
  if (!r.ok && !r.vazios) return { erro: "O Trier não devolveu nenhum relatório.", avisos };
  return { ok: `Pronto: ${r.ok} relatório(s) guardado(s)${r.vazios ? `, ${r.vazios} sem movimento` : ""} em ${Math.round(r.ms / 1000)} s.`, avisos };
}
