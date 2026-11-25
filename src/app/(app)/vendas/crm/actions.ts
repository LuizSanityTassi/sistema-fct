"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getSessao } from "@/lib/auth/session";
import { lerCsvCrm } from "@/lib/crm/bunker-csv";
import { createClient } from "@/lib/supabase/server";

export type EstadoCrm = { erro?: string; ok?: string; avisos?: string[] };

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const hojeBrasil = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const br = (d: string) => d.split("-").reverse().join("/");
/**
 * Fora disso, o arquivo não é do dia informado: o Bunker conta quase as mesmas vendas que os atendimentos do Trier (de
 * 09/10/2026 em diante, 96–100%; no começo de outubro, 77–89%). Dois dias juntos ou o dia errado passam longe disso.
 */
const FAIXA_TRIER = { min: 0.7, max: 1.25 };

/**
 * CSV "Exportar Vendedores" do Bunker (Índice de Fidelização por Vendedor (Adm), filtrado num dia só). Confere com os
 * atendimentos do Trier daquele dia para não gravar um período errado como se fosse o dia, e substitui o dia inteiro.
 */
export async function importarCrm(_prev: EstadoCrm, fd: FormData): Promise<EstadoCrm> {
  const sessao = await getSessao();
  if (sessao.papel !== "admin" && sessao.papel !== "financeiro") return { erro: "Só o administrador e o financeiro enviam o CRM." };
  const arquivo = fd.get("arquivo");
  if (!(arquivo instanceof File) || !arquivo.size) return { erro: "Escolha o arquivo CSV exportado do Bunker." };
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "Arquivo maior que 4 MB: exporte um dia por vez." };
  const diaInformado = String(fd.get("dia") ?? "").trim();
  if (diaInformado && !DATA.test(diaInformado)) return { erro: "Dia inválido." };

  let lido;
  try {
    lido = lerCsvCrm(arquivo.name, new Uint8Array(await arquivo.arrayBuffer()), diaInformado || null);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não consegui ler o arquivo." };
  }
  const { linhas, dias, avisos } = lido;
  if (dias.some((d) => d > hojeBrasil())) return { erro: `O arquivo tem dia no futuro (${dias.filter((d) => d > hojeBrasil()).map(br).join(", ")}).` };

  // conferência com o Trier: vendas do Bunker × atendimentos das lojas no mesmo dia
  const supabase = await createClient();
  // uma linha por filial e dia (≈45 por dia): de 20 em 20 dias para não passar das 1.000 linhas por leitura
  const atendDia = new Map<string, number>();
  for (let i = 0; i < dias.length; i += 20) {
    const { data: trier, error: eTrier } = await supabase.from("vendas_filial_dia").select("data, atendimentos").in("data", dias.slice(i, i + 20)).limit(1000);
    if (eTrier) return { erro: `Não consegui conferir com o Trier: ${eTrier.message}` };
    for (const t of trier ?? []) atendDia.set(t.data, (atendDia.get(t.data) ?? 0) + Number(t.atendimentos ?? 0));
  }
  const conferencia: Record<string, { bunker: number; trier: number }> = {};
  for (const d of dias) {
    const bunker = linhas.filter((l) => l.data === d).reduce((s, l) => s + l.qtd_vendas, 0);
    const atend = atendDia.get(d) ?? 0;
    conferencia[d] = { bunker, trier: atend };
    if (!atend) {
      avisos.push(`${br(d)}: o Trier ainda não tem as vendas desse dia no portal; não deu para conferir se o arquivo é mesmo desse dia.`);
      continue;
    }
    const r = bunker / atend;
    if (r < FAIXA_TRIER.min || r > FAIXA_TRIER.max)
      return {
        erro: `O arquivo não parece ser só do dia ${br(d)}: tem ${bunker.toLocaleString("pt-BR")} vendas no Bunker e o Trier teve ${atend.toLocaleString("pt-BR")} atendimentos nesse dia. No Bunker, deixe a Data Inicial e a Data Final no mesmo dia e exporte de novo.`,
        avisos,
      };
  }

  const { data: id, error } = await supabase.rpc("crm_importar", {
    p_arquivo: arquivo.name,
    p_dias: dias,
    p_linhas: linhas,
    p_nome: sessao.nome,
    p_resumo: { conferencia, avisos: avisos.slice(0, 20) },
  });
  if (error) return { erro: `Não consegui gravar: ${error.message}`, avisos };
  const vendas = linhas.reduce((s, l) => s + l.qtd_vendas, 0);
  const fidelizadas = linhas.reduce((s, l) => s + l.qtd_fidelizadas, 0);
  await registrarAuditoria(supabase, {
    userId: sessao.id,
    acao: "importar",
    entidade: "crm_fidelizacao_dia",
    registroId: id,
    novo: { arquivo: arquivo.name, dias, linhas: linhas.length, vendas, fidelizadas, conferencia },
  });
  revalidatePath("/vendas/crm");
  const indice = vendas ? ((fidelizadas / vendas) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "0";
  return {
    ok: `CRM de ${dias.map(br).join(", ")} gravado: ${linhas.length} vendedores, ${vendas.toLocaleString("pt-BR")} vendas, ${fidelizadas.toLocaleString("pt-BR")} fidelizadas (${indice}%).`,
    avisos,
  };
}
